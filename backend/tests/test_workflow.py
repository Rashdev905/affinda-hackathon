from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from app.main import app

MEDICAL = "Someone collapsed near the Lawn Stage toilets. They're awake but really dizzy and a crowd is forming."


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PULSE_DB_PATH", str(tmp_path / "pulse-test.db"))
    with TestClient(app) as test_client:
        yield test_client


def report(client, text=MEDICAL):
    response = client.post("/api/reports", json={"text": text})
    assert response.status_code == 201, response.text
    return response.json()


def test_seed_and_health_are_idempotent(client):
    from app.database import initialize
    assert client.get("/health").json()["status"] == "ok"
    initialize()
    resources = client.get("/api/resources").json()
    assert len(resources) == 20
    assert len({resource["zone"] for resource in resources}) == 6
    assert any(resource["role"] == "First-aid team" for resource in resources)
    assert client.get("/api/incidents").json() == []


def test_full_report_clarify_approve_update_resolve_and_persist(client):
    incident = report(client)
    id_ = incident["id"]
    assert incident["type"] == "medical"
    assert incident["location"] == "Lawn Stage Toilets"
    assert incident["missing_information"] == ["breathing_status"]
    assert incident["status"] == "awaiting_clarification"
    assert incident["assigned_responders"] == []
    assert incident["recommendation"]["requires_human_approval"] is True
    assert not any(resource["current_assignment"] for resource in client.get("/api/resources").json())

    updated = client.post(f"/api/incidents/{id_}/updates", json={"text": "Yes, they are breathing normally."})
    assert updated.status_code == 200
    assert updated.json()["status"] == "awaiting_approval"
    assert updated.json()["follow_up_question"] is None
    approved = client.post(f"/api/incidents/{id_}/decision", json={"decision": "approve"})
    assert approved.status_code == 200
    assert approved.json()["status"] == "response_dispatched"
    assigned = approved.json()["assigned_responders"]
    assert len(assigned) == 2
    assert all(not resource["available"] for resource in client.get("/api/resources").json() if resource["id"] in assigned)
    progressed = client.post(f"/api/incidents/{id_}/updates", json={"text": "The team has arrived at the scene."})
    assert progressed.json()["status"] == "in_progress"
    resolved = client.post(f"/api/incidents/{id_}/resolve", json={"note": "Response completed and recorded."})
    assert resolved.status_code == 200
    assert resolved.json()["status"] == "resolved"
    assert "Response completed and recorded." in resolved.json()["draft_report"]
    assert all(resource["available"] for resource in client.get("/api/resources").json() if resource["id"] in assigned)
    persisted = client.get(f"/api/incidents/{id_}").json()
    assert persisted == resolved.json()
    kinds = [event["kind"] for event in persisted["timeline"]]
    assert kinds == ["reported", "suggestion", "update", "approved", "update", "resolved"]
    assert persisted["timeline"][0]["message"] == MEDICAL
    assert [event["timestamp"] for event in persisted["timeline"]] == sorted(event["timestamp"] for event in persisted["timeline"])
    # A fresh app startup must preserve the incident and not reassign seeded resources.
    with TestClient(app) as restarted:
        assert restarted.get(f"/api/incidents/{id_}").json() == persisted


def test_reject_does_not_dispatch_and_modified_response_can_be_approved(client):
    incident = report(client, "A lost child is at North Gate, separated from their parent.")
    endpoint = f"/api/incidents/{incident['id']}/decision"
    assert client.post(endpoint, json={"decision": "reject"}).status_code == 422
    rejected = client.post(endpoint, json={"decision": "reject", "note": "Use the welfare volunteer instead."})
    assert rejected.json()["status"] == "awaiting_approval"
    assert rejected.json()["last_decision"] == "reject"
    assert not any(resource["current_assignment"] for resource in client.get("/api/resources").json())
    modified = client.post(endpoint, json={
        "decision": "modify", "responder_ids": ["VOL-007"],
        "actions": ["Ask the welfare volunteer to attend the information point."], "note": "Welfare volunteer is at the same gate.",
    })
    assert modified.status_code == 200
    assert modified.json()["assigned_responders"] == ["VOL-007"]
    assert modified.json()["recommendation"]["actions"] == ["Ask the welfare volunteer to attend the information point."]
    assert modified.json()["timeline"][-1]["kind"] == "modified"


def test_competing_approvals_cannot_double_assign(client):
    first, second = report(client), report(client)
    ids = first["recommendation"]["recommended_responders"]

    def approve(incident):
        return client.post(f"/api/incidents/{incident['id']}/decision", json={"decision": "approve", "responder_ids": ids})

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(approve, [first, second]))
    assert sorted(response.status_code for response in responses) == [200, 409]
    loser = next(incident for incident, response in zip([first, second], responses) if response.status_code == 409)
    fresh = client.get(f"/api/incidents/{loser['id']}").json()
    assert not set(ids).intersection(fresh["recommendation"]["recommended_responders"])
    assert any("Already assigned elsewhere" in conflict for conflict in fresh["recommendation"]["conflicts"])
    assert fresh["assigned_responders"] == []
    approved_alternative = client.post(f"/api/incidents/{loser['id']}/decision", json={
        "decision": "approve", "responder_ids": fresh["recommendation"]["recommended_responders"],
    })
    assert approved_alternative.status_code == 200
    resources = {resource["id"]: resource for resource in client.get("/api/resources").json()}
    for responder in approved_alternative.json()["assigned_responders"]:
        assert any(resources[responder]["name"] in action for action in approved_alternative.json()["recommendation"]["actions"])


def test_short_negative_clarification_is_accepted_and_flags_review(client):
    incident = report(client)
    response = client.post(f"/api/incidents/{incident['id']}/updates", json={"text": "No"})
    assert response.status_code == 200
    assert response.json()["urgency"] == "critical"
    assert response.json()["status"] == "awaiting_approval"
    assert response.json()["assigned_responders"] == []


@pytest.mark.parametrize("body", [
    {"decision": "approve", "responder_ids": ["missing"]},
    {"decision": "approve", "responder_ids": ["VOL-001"]},
    {"decision": "approve", "responder_ids": []},
    {"decision": "approve", "responder_ids": ["VOL-002", "VOL-002"]},
    {"decision": "modify", "responder_ids": ["VOL-002"]},
    {"decision": "modify", "responder_ids": ["VOL-002"], "note": "Changed", "actions": [" "]},
])
def test_invalid_decisions_leave_state_unchanged(client, body):
    incident = report(client)
    response = client.post(f"/api/incidents/{incident['id']}/decision", json=body)
    assert response.status_code == 422
    assert client.get(f"/api/incidents/{incident['id']}").json()["status"] == "awaiting_clarification"
    assert not any(resource["current_assignment"] for resource in client.get("/api/resources").json())


def test_escalation_needs_new_approval_without_new_dispatch(client):
    incident = report(client)
    id_ = incident["id"]
    approved = client.post(f"/api/incidents/{id_}/decision", json={"decision": "approve"}).json()
    resources_before = client.get("/api/resources").json()
    escalated = client.post(f"/api/incidents/{id_}/updates", json={"text": "Update: the person is now unconscious."}).json()
    assert escalated["urgency"] == "critical"
    assert escalated["status"] == "awaiting_approval"
    assert escalated["last_decision"] is None
    assert escalated["assigned_responders"] == approved["assigned_responders"]
    assert any(event["kind"] == "escalation" for event in escalated["timeline"])
    assert client.get("/api/resources").json() == resources_before


def test_resolved_incidents_reject_mutations(client):
    incident = report(client)
    base = f"/api/incidents/{incident['id']}"
    assert client.post(base + "/resolve", json={"note": "Duplicate reported by radio."}).status_code == 200
    for suffix, payload in [("/updates", {"text": "new update"}), ("/decision", {"decision": "approve"}), ("/resolve", {})]:
        assert client.post(base + suffix, json=payload).status_code == 409
    assert client.get("/api/incidents/INC-NOT-FOUND").status_code == 404


def test_generic_report_can_be_clarified_without_losing_original(client):
    incident = report(client, "We need someone to help out here.")
    assert incident["missing_information"] == ["location"]
    clarified = client.post(f"/api/incidents/{incident['id']}/updates", json={"text": "At River Stage by the entrance."}).json()
    assert clarified["location"] == "River Stage"
    assert clarified["summary"] == incident["summary"]
    assert clarified["status"] == "awaiting_approval"
    assert clarified["missing_information"] == []


def test_coverage_warning_for_last_zone_responder(client):
    incident = report(client, "A lost child is at South Gate, separated from their parent.")
    assert "VOL-009" in incident["recommendation"]["recommended_responders"] or "SEC-002" in incident["recommendation"]["recommended_responders"]
    response = client.post(f"/api/incidents/{incident['id']}/decision", json={
        "decision": "modify", "responder_ids": ["VOL-009", "SEC-002"], "note": "Both required at the gate.",
    })
    assert response.status_code == 200
    assert any("no available resources at South Gate" in warning for warning in response.json()["recommendation"]["conflicts"])


def test_validation_and_cors(client):
    assert client.post("/api/reports", json={"text": "   "}).status_code == 422
    assert client.post("/api/reports", json={"text": "x" * 5001}).status_code == 422
    response = client.options("/api/reports", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_android_download_serves_only_the_built_artifact(client, tmp_path, monkeypatch):
    from app import main
    apk = tmp_path / "Pulse-Android.apk"
    monkeypatch.setattr(main, "ANDROID_APK", apk)
    assert client.get("/downloads/pulse.apk").status_code == 404
    apk.write_bytes(b"APK download fixture")
    response = client.get("/downloads/pulse.apk")
    assert response.status_code == 200
    assert response.content == b"APK download fixture"
    assert response.headers["content-type"] == "application/vnd.android.package-archive"
    assert 'filename="Pulse-Android.apk"' in response.headers["content-disposition"]
