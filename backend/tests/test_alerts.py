import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import initialize


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PULSE_DB_PATH", str(tmp_path / "alerts.db"))
    with TestClient(app) as client:
        yield client


def report(client, text="Someone collapsed near the Lawn Stage toilets."):
    result = client.post("/api/reports", json={"text": text, "reported_by": "VOL-002"})
    assert result.status_code == 201
    return result.json()


def inbox(client, id="VOL-002"):
    response = client.get(f"/api/volunteers/{id}/alerts")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    return response.json()


def test_emergency_automatically_alerts_demo_volunteers_without_assigning_them(client):
    incident = report(client)
    volunteers = [r for r in client.get("/api/resources").json() if r["id"].startswith("VOL-")]
    assert len(volunteers) == 14
    for volunteer in volunteers:
        alert, = inbox(client, volunteer["id"])
        assert alert["incident_id"] == incident["id"]
        assert alert["volunteer_id"] == volunteer["id"]
        assert alert["instructions"] and "Lawn Stage" in alert["instructions"][0]
        assert alert["active"] and alert["acknowledged_at"] is None
    assert incident["assigned_responders"] == []
    assert incident["timeline"][-1]["kind"] == "emergency_alert"


def test_acknowledgement_is_per_volunteer_idempotent_and_persistent(client):
    report(client)
    alert, = inbox(client)
    path = f"/api/volunteers/VOL-002/alerts/{alert['id']}/acknowledge"
    first = client.post(path, json={})
    assert first.status_code == 200
    assert first.json()["acknowledged_at"]
    assert client.post(path, json={}).json() == first.json()
    assert client.post(path.replace("VOL-002", "VOL-003"), json={}).status_code == 404
    initialize()
    assert inbox(client)[0]["acknowledged_at"] == first.json()["acknowledged_at"]
    assert inbox(client, "VOL-003")[0]["acknowledged_at"] is None


def test_only_emergencies_and_escalations_trigger_new_automatic_alerts(client):
    incident = report(client, "Broken cable cover at Food Village.")
    assert inbox(client) == []
    path = f"/api/incidents/{incident['id']}/updates"
    client.post(path, json={"text": "Someone collapsed at Food Village."})
    assert len(inbox(client)) == 1
    client.post(path, json={"text": "Yes, breathing normally."})
    assert len(inbox(client)) == 1
    client.post(path, json={"text": "They are now unconscious."})
    assert len(inbox(client)) == 2
    assert inbox(client)[0]["urgency"] == "critical"


def test_manager_alert_targets_assigned_volunteers_and_resolution_silences_inbox(client):
    incident = report(client)
    base = f"/api/incidents/{incident['id']}"
    assigned = client.post(base + "/decision", json={"decision": "approve"}).json()["assigned_responders"]
    assert client.post(base + "/alerts", json={"message": "Keep the entrance clear."}).status_code == 200
    volunteers = [r for r in client.get("/api/resources").json() if r["id"].startswith("VOL-")]
    for volunteer in volunteers:
        alerts = inbox(client, volunteer["id"])
        assert len(alerts) == (2 if volunteer["id"] in assigned else 1)
        if volunteer["id"] in assigned:
            assert alerts[0]["source"] == "manager"
            assert alerts[0]["message"] == "Keep the entrance clear."
    client.post(base + "/resolve", json={"note": "Complete."})
    assert all(not alert["active"] for alert in inbox(client))


def test_unknown_volunteer_cannot_read_an_inbox(client):
    assert client.get("/api/volunteers/VOL-999/alerts").status_code == 404
