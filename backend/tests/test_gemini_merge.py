import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas import Incident, ResponderAssignment
from app.services import ai_analysis


def analysis(**overrides):
    return {
        "type": "medical", "location": "Location to confirm", "summary": "Person needs medical assessment",
        "observations": ["Reporter says someone is dying"], "priority_score": 90,
        "missing_information": ["location", "breathing_status"],
        "follow_up_question": "Is the person breathing normally?", "medical_assistance_needed": True,
        "responder_needs": [{"required_skill": "first_aid", "responsibility": "Assess the person within training."}],
        "actions": ["Request medical assessment."], "reasoning": ["Possible immediate danger reported."],
        **overrides,
    }


def envelope(output):
    return {"candidates": [{"finishReason": "STOP", "content": {"parts": [
        {"thought": True, "text": "Reasoning is not the structured answer."},
        {"text": json.dumps(output)},
    ]}}]}


@pytest.fixture
def gemini(monkeypatch):
    monkeypatch.setenv("PULSE_AI_MODE", "gemini")
    monkeypatch.setenv("PULSE_ALERT_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "fake-test-key")
    state = {"output": analysis(), "status": 200, "envelope": None, "calls": []}

    def fake_post(url, **kwargs):
        state["calls"].append((url, kwargs))
        payload = state["envelope"] if state["envelope"] is not None else envelope(state["output"])
        return httpx.Response(state["status"], json=payload, request=httpx.Request("POST", url))

    monkeypatch.setattr(ai_analysis.httpx, "post", fake_post)
    return state


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PULSE_DB_PATH", str(tmp_path / "gemini-merge.db"))
    with TestClient(app) as client:
        yield client


@pytest.mark.parametrize("mode,key,expected", [
    ("", False, "mock"), ("", True, "gemini"), ("mock", True, "mock"),
    ("gemini", True, "gemini"), ("openai", True, "gemini"),
])
def test_provider_and_health_agree(client, monkeypatch, mode, key, expected):
    monkeypatch.setenv("PULSE_AI_MODE", mode)
    if key:
        monkeypatch.setenv("GEMINI_API_KEY", "fake-test-key")
    assert ai_analysis.provider_mode() == expected
    assert client.get("/health").json()["analysis_mode"] == expected


def test_explicit_gemini_without_key_is_an_error_not_silent_mock(client, monkeypatch):
    monkeypatch.setenv("PULSE_AI_MODE", "gemini")
    response = client.post("/api/reports", json={"text": "Someone is dying", "reported_by": "VOL-001"})
    assert response.status_code == 503
    assert "GEMINI_API_KEY" in response.json()["detail"]
    assert client.get("/api/incidents").json() == []


def test_gemini_report_keeps_automatic_location_and_clarification(client, gemini):
    response = client.post("/api/reports", json={"text": "Someone is dying", "reported_by": "VOL-001"})
    assert response.status_code == 201, response.text
    incident = response.json()
    assert incident["parser_mode"] == "gemini"
    assert incident["location"] == "Lawn Stage"
    assert incident["missing_information"] == ["breathing_status"]
    assert incident["follow_up_question"] == "Is the person breathing normally?"
    assert incident["assigned_responders"] == []
    assert incident["timeline"][0]["message"] == "Someone is dying"
    assert client.get("/api/volunteers/VOL-001/alerts").json() == []
    url, request = gemini["calls"][0]
    assert url.endswith("/gemini-3.8-flash:generateContent")
    assert request["headers"]["x-goog-api-key"] == "fake-test-key"
    assert request["json"]["generationConfig"]["responseJsonSchema"] == ai_analysis.ANALYSIS_SCHEMA
    payload_text = request["json"]["contents"][0]["parts"][0]["text"]
    assert json.loads(payload_text)["reporter_zone"] == "Lawn Stage"
    assert "VOL-001" not in payload_text and "Alex Morgan" not in payload_text
    assert Incident.model_validate({**incident, "parser_mode": "openai"})


def test_gemini_specific_location_is_preserved(client, gemini):
    location = "Beside the west entrance of the Food Village"
    gemini["output"] = analysis(location=location, missing_information=[], follow_up_question="")
    response = client.post("/api/reports", json={"text": f"Someone is dying {location}", "reported_by": "VOL-001"})
    assert response.status_code == 201
    assert response.json()["location"] == location


@pytest.mark.parametrize("text,minimum", [
    ("Someone is dying", 70), ("help somone is dieing", 70),
    ("Someone fell down stairs and is unconscious", 98),
    ("Not unconscious but cannot breathe", 70), ("A suspected broken leg", 70),
])
def test_keyword_danger_floor_survives_a_low_model_score(gemini, text, minimum):
    gemini["output"] = analysis(type="general", priority_score=10, medical_assistance_needed=False,
                                responder_needs=[], actions=["Confirm details."], observations=[])
    parsed, plan, mode = ai_analysis.analyze_report(text, [])
    assert mode == "gemini" and parsed.type == "medical"
    assert parsed.priority_score >= minimum
    assert plan.medical_assistance_needed
    assert any(need.required_skill == "first_aid" for need in plan.responder_needs)


def test_no_global_keyword_upgrade_for_negated_warnings(gemini):
    gemini["output"] = analysis(priority_score=20, observations=[], missing_information=[], follow_up_question="")
    parsed, _, _ = ai_analysis.analyze_report("Small paper cut, not a fracture; bleeding stopped, otherwise well", [])
    assert parsed.priority_score == 20


def test_update_saves_directly_without_another_gemini_call(client, gemini):
    response = client.post("/api/reports", json={"text": "Someone is dying", "reported_by": "VOL-001"})
    incident = response.json()
    gemini["output"] = analysis(location="Lawn Stage", priority_score=20, observations=[], missing_information=[], follow_up_question="")
    update = client.post(f"/api/incidents/{incident['id']}/updates", json={"text": "Breathing normally now", "reported_by": "VOL-003"})
    assert update.status_code == 200
    assert update.json()["priority_score"] >= incident["priority_score"]
    assert len(gemini["calls"]) == 1
    assert update.json()["location"] == incident["location"]
    assert update.json()["timeline"][-1]["message"] == "Breathing normally now"


@pytest.mark.parametrize("payload", [
    {"candidates": []}, {"candidates": [{"finishReason": "MAX_TOKENS", "content": {"parts": [{"text": "{}"}]}}]},
    envelope({"type": "medical"}), envelope([]),
])
def test_invalid_model_result_does_not_save_or_dispatch(client, gemini, payload):
    gemini["envelope"] = payload
    response = client.post("/api/reports", json={"text": "Someone is dying", "reported_by": "VOL-001"})
    assert response.status_code == 503
    assert client.get("/api/incidents").json() == []
    assert client.get("/api/volunteers/VOL-001/alerts").json() == []


def test_provider_errors_do_not_echo_credentials(client, gemini):
    gemini["status"] = 429
    gemini["envelope"] = {"error": {"message": "An upstream diagnostic containing fake-test-key"}}
    response = client.post("/api/reports", json={"text": "Someone is dying"})
    assert response.status_code == 503
    assert "429" in response.json()["detail"]
    assert "fake-test-key" not in response.text
    assert client.get("/api/incidents").json() == []


def test_gemini_drafts_do_not_send_until_manager_reviews_and_sends(client, gemini):
    incident = client.post("/api/reports", json={"text": "Someone is dying", "reported_by": "VOL-001"}).json()
    base = f"/api/incidents/{incident['id']}"
    assert client.post(base + "/alert-drafts", json={}).status_code == 409
    approved = client.post(base + "/decision", json={"decision": "approve"})
    assert approved.status_code == 200
    assigned = approved.json()["assigned_responders"]
    gemini["output"] = {"messages": [{"index": index, "message": f"Go to Lawn Stage. Carry out assigned task {index}."}
                                    for index in reversed(range(len(assigned)))]}
    drafts = client.post(base + "/alert-drafts", json={})
    assert drafts.status_code == 200, drafts.text
    assert drafts.json()["mode"] == "gemini"
    for volunteer_id in assigned:
        assert client.get(f"/api/volunteers/{volunteer_id}/alerts").json() == []
    messages = [{"volunteer_id": draft["volunteer_id"], "message": draft["message"]} for draft in drafts.json()["drafts"]]
    assert client.post(base + "/alerts", json={"messages": messages}).status_code == 200
    for message in messages:
        inbox = client.get(f"/api/volunteers/{message['volunteer_id']}/alerts").json()
        assert len(inbox) == 1 and inbox[0]["message"] == message["message"]
    assert client.get("/api/volunteers/VOL-010/alerts").json() == []


@pytest.mark.parametrize("messages", [
    [{"index": 0, "message": "One"}, {"index": 0, "message": "Duplicate"}],
    [{"index": False, "message": "Boolean is not an index"}],
    [{"index": 2, "message": "Wrong recipient index"}],
])
def test_malformed_draft_indices_are_rejected(client, gemini, messages):
    incident = Incident.model_validate(client.post("/api/reports", json={"text": "Someone is dying"}).json())
    assignment = ResponderAssignment(resource_id="VOL-002", required_skill="first_aid", responsibility="Assess the person.")
    gemini["output"] = {"messages": messages}
    with pytest.raises(ai_analysis.AnalysisServiceError):
        ai_analysis.generate_alert_messages(incident, [assignment])


def test_draft_budget_allows_complete_answer_after_model_reasoning(client, gemini, monkeypatch):
    incident = Incident.model_validate(client.post("/api/reports", json={"text": "Someone is dying"}).json())
    assignment = ResponderAssignment(resource_id="VOL-002", required_skill="first_aid", responsibility="Assess the person.")

    def budget_limited_model(url, **kwargs):
        budget = kwargs["json"]["generationConfig"]["maxOutputTokens"]
        if budget < 4096:
            payload = {"candidates": [{"finishReason": "MAX_TOKENS", "content": {"parts": []}}]}
        else:
            payload = envelope({"messages": [{"index": 0, "message": "Go to Lawn Stage and assess the person."}]})
        return httpx.Response(200, json=payload, request=httpx.Request("POST", url))

    monkeypatch.setattr(ai_analysis.httpx, "post", budget_limited_model)
    messages, mode = ai_analysis.generate_alert_messages(incident, [assignment])
    assert mode == "gemini"
    assert messages == ["Go to Lawn Stage and assess the person."]
    assert client.get("/api/volunteers/VOL-002/alerts").json() == []


@pytest.mark.parametrize("payload,expected", [
    ({"candidates": [{"finishReason": "MAX_TOKENS"}]}, "MAX_TOKENS"),
    ({"promptFeedback": {"blockReason": "SAFETY"}}, "blocked"),
    ({"candidates": [{"finishReason": "SAFETY"}]}, "blocked"),
    ({"candidates": []}, "no response candidates"),
    ({"candidates": [{"finishReason": "STOP", "content": {"parts": []}}]}, "without any answer text"),
    ({"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": '{"messages":'}]}}]}, "malformed JSON"),
])
def test_draft_failures_explain_cause_without_sending(client, gemini, payload, expected):
    incident = client.post("/api/reports", json={"text": "Someone is dying"}).json()
    base = f"/api/incidents/{incident['id']}"
    approved = client.post(base + "/decision", json={"decision": "approve"})
    assert approved.status_code == 200
    gemini["envelope"] = payload
    response = client.post(base + "/alert-drafts", json={})
    assert response.status_code == 503
    assert expected in response.json()["detail"]
    assert "fake-test-key" not in response.text
    for volunteer_id in approved.json()["assigned_responders"]:
        assert client.get(f"/api/volunteers/{volunteer_id}/alerts").json() == []
