import pytest
from fastapi.testclient import TestClient

from app import database
from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PULSE_DB_PATH", str(tmp_path / "map-location.db"))
    monkeypatch.setenv("PULSE_AI_MODE", "mock")
    with TestClient(app) as client:
        yield client


def report(client, text, reporter="VOL-001"):
    response = client.post("/api/reports", json={"text": text, "reported_by": reporter})
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.parametrize("reporter,zone", [
    ("VOL-001", "Lawn Stage"), ("VOL-003", "River Stage"),
    ("VOL-005", "Food Village"), ("VOL-007", "North Gate"),
    ("VOL-009", "South Gate"), ("TEAM-FIRSTAID-A", "Medical Tent"),
    ("SEC-001", "North Gate"), ("OPS-001", "Food Village"),
])
def test_report_inherits_the_reporters_stored_zone(client, reporter, zone):
    text = "Small paper cut, bleeding stopped, otherwise well"
    incident = report(client, text, reporter)
    assert incident["location"] == zone
    assert "location" not in incident["missing_information"]
    assert incident["follow_up_question"] is None
    assert incident["status"] == "awaiting_approval"
    assert incident["timeline"][0]["message"] == text
    note, = [event for event in incident["timeline"] if event["kind"] == "location_inferred"]
    assert zone in note["message"] and "assigned demo zone" in note["message"]
    assert incident["assigned_responders"] == []
    assert client.get(f"/api/incidents/{incident['id']}").json()["location"] == zone


def test_auto_location_does_not_clear_critical_medical_questions(client):
    incident = report(client, "Someone is dying")
    assert incident["location"] == "Lawn Stage"
    assert incident["priority_score"] >= 70
    assert incident["missing_information"] == ["breathing_status"]
    assert incident["follow_up_question"] == "Is the person breathing normally?"


def test_an_explicit_reported_zone_and_landmark_win(client):
    incident = report(client, "Someone is dying near the river stage toilets")
    assert incident["location"] == "River Stage Toilets"
    assert not any(event["kind"] == "location_inferred" for event in incident["timeline"])


def test_unknown_reporter_still_needs_location(client):
    incident = report(client, "Small paper cut, bleeding stopped, otherwise well", "Guest")
    assert incident["location"] == "Location to confirm"
    assert "location" in incident["missing_information"]
    assert "zone" in incident["follow_up_question"]


def test_changed_zone_is_read_from_database_not_seed_data(client):
    with database.connection(write=True) as db:
        alex = next(resource for resource in database.list_resources(db) if resource.id == "VOL-001")
        alex.zone = "South Gate"
        database.save_resource(db, alex)
    assert report(client, "Someone is dying")["location"] == "South Gate"


def test_update_location_correction_is_saved_for_manager_review(client):
    incident = report(client, "Someone is dying")
    endpoint = f"/api/incidents/{incident['id']}/updates"
    # A different volunteer sending an update must not relocate the incident.
    response = client.post(endpoint, json={"text": "Yes, breathing normally", "reported_by": "VOL-003"})
    assert response.status_code == 200
    assert response.json()["location"] == "Lawn Stage"
    response = client.post(endpoint, json={"text": "Correction: this happened at North Gate", "reported_by": "VOL-003"})
    assert response.status_code == 200
    assert response.json()["location"] == "Lawn Stage"
    assert response.json()["timeline"][-1]["message"] == "Correction: this happened at North Gate"
