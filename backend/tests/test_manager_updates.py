import pytest
from fastapi.testclient import TestClient

from app import database
from app.main import app
from app.services import ai_analysis
from app.services.ai_analysis import AnalysisServiceError


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PULSE_DB_PATH", str(tmp_path / "manager.db"))
    with TestClient(app) as client:
        yield client


def report(client):
    result = client.post("/api/reports", json={"text": "A small cut, bleeding stopped", "reported_by": "VOL-001"})
    assert result.status_code == 201
    return result.json()["id"]


def update(client, id, reporter="VOL-001"):
    return client.post(f"/api/incidents/{id}/updates", json={"text": "The person is awake and breathing normally.", "reported_by": reporter})


def test_saved_volunteer_update_notifies_each_manager_independently(client):
    id = report(client)
    baseline = client.get("/api/manager/updates").json()["cursor"]
    assert update(client, id).status_code == 200
    first = client.get(f"/api/manager/updates?after={baseline}")
    assert first.headers["cache-control"] == "no-store"
    feed = first.json()
    message, = feed["updates"]
    assert message["incident_id"] == id
    assert message["volunteer_name"] == "Alex Morgan"
    assert message["message"] == "The person is awake and breathing normally."
    assert message["location"] == "Lawn Stage"
    assert client.get(f"/api/manager/updates?after={baseline}").json() == feed
    assert client.get(f"/api/manager/updates?after={feed['cursor']}").json()["updates"] == []
    assert client.get("/api/volunteers/VOL-001/alerts").json() == []
    database.initialize()
    assert client.get(f"/api/manager/updates?after={baseline}").json() == feed


@pytest.mark.parametrize("reporter", ["Manager", "Safety lead", "VOL-999"])
def test_manager_or_unknown_reporter_does_not_generate_volunteer_notification(client, reporter):
    id = report(client)
    baseline = client.get("/api/manager/updates").json()["cursor"]
    assert update(client, id, reporter).status_code == 200
    assert client.get(f"/api/manager/updates?after={baseline}").json()["updates"] == []


def test_updates_save_and_notify_even_when_gemini_is_unavailable(client, monkeypatch):
    id = report(client)
    def fail(*args, **kwargs):
        raise AnalysisServiceError("Provider unavailable")
    monkeypatch.setattr(ai_analysis.httpx, "post", fail)
    monkeypatch.setenv("PULSE_AI_MODE", "gemini")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with database.connection() as db:
        before = database.get_incident(db, id).model_dump(mode="json")
    baseline = client.get("/api/manager/updates").json()["cursor"]
    response = update(client, id)
    assert response.status_code == 200
    for field in ("priority_score", "location", "recommendation", "assigned_responders", "status", "parser_mode"):
        assert response.json()[field] == before[field]
    assert client.get(f"/api/manager/updates?after={baseline}").json()["updates"][0]["kind"] == "update"


def test_closed_or_missing_incident_does_not_notify(client):
    id = report(client)
    baseline = client.get("/api/manager/updates").json()["cursor"]
    assert client.post(f"/api/incidents/{id}/resolve", json={"note": "Resolved"}).status_code == 200
    assert update(client, id).status_code == 409
    assert update(client, "INC-MISSING").status_code == 404
    assert client.get(f"/api/manager/updates?after={baseline}").json()["updates"] == []


def test_first_subscription_skips_history_and_clear_keeps_cursor_monotonic(client):
    assert update(client, report(client)).status_code == 200
    baseline = client.get("/api/manager/updates").json()
    assert baseline["cursor"] > 0 and baseline["updates"] == []
    assert client.delete("/api/incidents", headers={"X-Pulse-Mode": "Manager"}).status_code == 200
    assert client.get("/api/manager/updates?after=0").json()["updates"] == []
    assert update(client, report(client)).status_code == 200
    feed = client.get(f"/api/manager/updates?after={baseline['cursor']}").json()
    assert len(feed["updates"]) == 2 and feed["cursor"] > baseline["cursor"]
    assert client.get("/api/manager/updates?after=999999").json() == {"cursor": feed["cursor"], "updates": []}


def test_feed_pages_without_losing_same_time_updates(client):
    with database.connection(write=True) as db:
        for index in range(105):
            db.execute("""INSERT INTO manager_updates
                (incident_id, volunteer_id, volunteer_name, message, location, created_at)
                VALUES ('INC-TEST', 'VOL-001', 'Alex', ?, 'Lawn Stage', '2026-10-08T00:00:00Z')""", (str(index),))
    page = client.get("/api/manager/updates?after=0").json()
    next_page = client.get(f"/api/manager/updates?after={page['cursor']}").json()
    assert len(page["updates"]) == 100 and len(next_page["updates"]) == 5
    assert len({item["id"] for item in page["updates"] + next_page["updates"]}) == 105


def test_new_report_notifies_manager_once_with_original_text(client):
    baseline = client.get("/api/manager/updates").json()["cursor"]
    id = report(client)
    feed = client.get(f"/api/manager/updates?after={baseline}").json()
    notification, = feed["updates"]
    assert notification["kind"] == "report"
    assert notification["incident_id"] == id
    assert notification["message"] == "A small cut, bleeding stopped"
    assert client.get(f"/api/manager/updates?after={feed['cursor']}").json()["updates"] == []


def test_rejected_report_does_not_notify(client, monkeypatch):
    monkeypatch.setenv("PULSE_AI_MODE", "gemini")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    response = client.post("/api/reports", json={"text": "Someone needs help", "reported_by": "VOL-001"})
    assert response.status_code == 503
    assert client.get("/api/manager/updates?after=0").json()["updates"] == []


def test_update_and_notification_roll_back_together(client, monkeypatch):
    from app.routers import incidents
    id = report(client)
    with database.connection() as db:
        before = database.get_incident(db, id).model_dump(mode="json")
    baseline = client.get("/api/manager/updates").json()["cursor"]
    original = incidents.queue_manager_notification
    def fail_after_insert(*args, **kwargs):
        original(*args, **kwargs)
        raise RuntimeError("Simulated database failure")
    monkeypatch.setattr(incidents, "queue_manager_notification", fail_after_insert)
    with pytest.raises(RuntimeError):
        update(client, id)
    with database.connection() as db:
        assert database.get_incident(db, id).model_dump(mode="json") == before
    assert client.get(f"/api/manager/updates?after={baseline}").json()["updates"] == []
