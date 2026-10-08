"""Validated report analysis using OpenAI Structured Outputs, with an explicit mock mode."""

import json
import os

import httpx

from ..schemas import Incident, LLMAnalysis, ParsedReport, ResponderAssignment, ResponderNeed, Resource, ResponsePlan
from .ai_mock import parse_report, parse_update
from .coordinator import default_response_plan
from .medical_priority import has_possible_fracture

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
OLLAMA_CHAT_URL = os.getenv("PULSE_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/") + "/api/chat"

ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "type": {"type": "string", "enum": ["medical", "lost_person", "security", "hazard", "general"]},
        "location": {"type": "string"},
        "summary": {"type": "string"},
        "observations": {"type": "array", "items": {"type": "string"}},
        "priority_score": {"type": "integer", "minimum": 0, "maximum": 100},
        "missing_information": {"type": "array", "items": {"type": "string"}},
        "follow_up_question": {"type": "string"},
        "medical_assistance_needed": {"type": "boolean"},
        "responder_needs": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "required_skill": {"type": "string", "enum": ["first_aid", "paramedic", "safeguarding", "security", "site_operations", "communication"]},
                    "responsibility": {"type": "string"},
                },
                "required": ["required_skill", "responsibility"],
                "additionalProperties": False,
            },
        },
        "actions": {"type": "array", "items": {"type": "string"}},
        "reasoning": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["type", "location", "summary", "observations", "priority_score", "missing_information",
                 "follow_up_question", "medical_assistance_needed", "responder_needs", "actions", "reasoning"],
    "additionalProperties": False,
}


class AnalysisServiceError(Exception):
    pass


def _apply_safety_overrides(parsed: ParsedReport, plan: ResponsePlan, context: str) -> None:
    """Keep an explicit possible fracture from being downgraded by model wording."""
    if not has_possible_fracture(context):
        return
    parsed.type = "medical"
    parsed.priority_score = max(parsed.priority_score, 70)
    if parsed.urgency not in ("high", "critical"):
        parsed.urgency = "high"
    plan.medical_assistance_needed = True
    if not any(need.required_skill in ("first_aid", "paramedic") for need in plan.responder_needs):
        if len(plan.responder_needs) >= 10:
            plan.responder_needs.pop()
        plan.responder_needs.insert(0, ResponderNeed(
            required_skill="first_aid",
            responsibility="Assess the reported possible fracture and provide first aid within training.",
        ))
    if not any(any(word in action.lower() for word in ("medical", "first aid", "paramedic")) for action in plan.actions):
        if len(plan.actions) >= 10:
            plan.actions.pop()
        plan.actions.insert(0, "Request prompt medical assessment for the reported possible fracture; manager approval is required before dispatch.")
    explanation = "Possible fracture reported; medical assistance and at least high-priority manager review were applied by a safety rule."
    if explanation not in plan.reasoning:
        if len(plan.reasoning) >= 10:
            plan.reasoning.pop()
        plan.reasoning.append(explanation)


def provider_mode() -> str:
    # A stored API key alone must not opt the keyword demo into paid analysis.
    mode = os.getenv("PULSE_AI_MODE", "").strip().lower() or "mock"
    if mode not in {"mock", "openai"}:
        raise AnalysisServiceError("PULSE_AI_MODE must be 'mock' or 'openai'.")
    if mode == "openai" and not os.getenv("OPENAI_API_KEY"):
        raise AnalysisServiceError("OpenAI analysis is enabled but OPENAI_API_KEY is not set.")
    return mode


def alert_provider_mode() -> str:
    """Select the alert-drafting provider independently from incident analysis."""
    mode = os.getenv("PULSE_ALERT_PROVIDER", "").strip().lower()
    # Preserve the previous behavior when no alert-specific provider is configured.
    if not mode:
        return provider_mode()
    if mode not in {"mock", "openai", "ollama"}:
        raise AnalysisServiceError("PULSE_ALERT_PROVIDER must be 'mock', 'openai', or 'ollama'.")
    if mode == "openai" and not os.getenv("OPENAI_API_KEY"):
        raise AnalysisServiceError("OpenAI alert drafting is enabled but OPENAI_API_KEY is not set.")
    return mode


def _available_capabilities(resources: list[Resource]) -> list[dict]:
    # Do not send volunteer names or IDs to the model. The server assigns actual people.
    return [
        {"role": resource.role, "zone": resource.zone, "skills": resource.skills}
        for resource in resources if resource.available and resource.current_assignment is None
    ]


def _extract_output_text(response: dict) -> str:
    for item in response.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "refusal":
                raise AnalysisServiceError("The AI service declined to analyze this report. Please review it manually.")
            if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                return content["text"]
    raise AnalysisServiceError("The AI service returned no structured analysis. Please retry the report.")


def _call_openai(report_text: str, resources: list[Resource], existing: Incident | None) -> LLMAnalysis:
    previous = None
    if existing:
        previous = {
            "type": existing.type,
            "location": existing.location,
            "summary": existing.summary,
            "observations": existing.observations,
            "priority_score": existing.priority_score,
            "missing_information": existing.missing_information,
        }
    user_data = {
        "report": report_text,
        "existing_incident": previous,
        "available_capabilities": _available_capabilities(resources),
    }
    system = (
        "You analyze festival incident reports for a human manager. You are not a clinician and must not diagnose, "
        "promise safety, or dispatch anyone. Return a queue-priority score from 0 to 100 based only on stated facts: "
        "immediate danger, possible life threat, people affected, vulnerability, hazards, and uncertainty. Higher scores "
        "mean review sooner. Do not invent facts. Extract concise observations and ask only for critical missing details. "
        "Treat an explicit or suspected broken/fractured bone as a medical incident requiring medical assistance and at least a 70/100 queue score; do not call a possible fracture low priority. Do not infer a fracture from a negative statement such as 'no fracture'. Recommend whether medical assistance is needed, then list one responder need per person with a required skill "
        "that exists in the supplied available capabilities and a concrete responsibility. Use paramedic when that skill "
        "is justified and available. Recommend no more than 10 people. If no capability matches, still describe the need; "
        "the server will report the staffing gap. Give concise response actions and reasons. For updates, return the current "
        "combined incident picture and preserve prior facts unless the new update clearly corrects them. Use an empty "
        "string for follow_up_question when none is needed. The manager must "
        "approve any assignment. Output only the requested structured data."
    )
    body = {
        "model": os.getenv("PULSE_OPENAI_MODEL", "gpt-6-astra"),
        "store": False,
        "max_output_tokens": 1400,
        "input": [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(user_data, ensure_ascii=False)},
        ],
        "text": {"format": {"type": "json_schema", "name": "festival_incident_analysis", "strict": True, "schema": ANALYSIS_SCHEMA}},
    }
    try:
        response = httpx.post(
            OPENAI_RESPONSES_URL,
            headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}", "Content-Type": "application/json"},
            json=body,
            timeout=httpx.Timeout(35.0, connect=8.0),
        )
        response.raise_for_status()
        output = _extract_output_text(response.json())
        analysis = LLMAnalysis.model_validate_json(output)
    except AnalysisServiceError:
        raise
    except (httpx.HTTPError, ValueError, KeyError, AttributeError, TypeError) as exc:
        raise AnalysisServiceError("AI analysis is unavailable. The report was not saved; retry or use mock mode.") from exc

    if existing:
        # Updates may escalate priority, but they do not silently downgrade an active incident.
        analysis.priority_score = max(analysis.priority_score, existing.priority_score)
    if len(analysis.responder_needs) == 0:
        analysis.responder_needs.append(
            ResponderNeed(required_skill="communication", responsibility="Coordinate the response and confirm the situation.")
        )
    return analysis


def analyze_report(report_text: str, resources: list[Resource], existing: Incident | None = None) -> tuple[ParsedReport, ResponsePlan, str]:
    mode = provider_mode()
    if mode == "openai":
        analysis = _call_openai(report_text, resources, existing)
        parsed, plan = analysis.parsed_report(), analysis.response_plan()
        context = report_text + (" " + existing.summary + " " + " ".join(existing.observations) if existing else "")
        _apply_safety_overrides(parsed, plan, context)
        return parsed, plan, mode

    parsed = parse_update(existing, report_text) if existing else parse_report(report_text)
    if existing:
        parsed.priority_score = max(parsed.priority_score, existing.priority_score)
    plan = default_response_plan(parsed)
    context = report_text + (" " + existing.summary + " " + " ".join(existing.observations) if existing else "")
    _apply_safety_overrides(parsed, plan, context)
    return parsed, plan, mode


def generate_alert_messages(incident: Incident, assignments: list[ResponderAssignment]) -> tuple[list[str], str]:
    """Draft one concise, assignment-specific alert per responder; names/IDs stay server-side."""
    mode = alert_provider_mode()
    if not assignments:
        return [], mode
    if mode == "mock":
        return [f"{incident.summary[:120]} Location: {incident.location[:100]}. Your task: {item.responsibility[:200]}" for item in assignments], mode

    tasks = [{
        "index": index,
        "role": item.resource_role or "Responder",
        "task": item.responsibility,
        "required_skill": item.required_skill,
    } for index, item in enumerate(assignments)]
    alert_schema = {
        "type": "object", "properties": {"messages": {"type": "array", "items": {
            "type": "object", "properties": {"index": {"type": "integer"}, "message": {"type": "string"}},
            "required": ["index", "message"], "additionalProperties": False,
        }}}, "required": ["messages"], "additionalProperties": False,
    }
    system_prompt = (
        "Write a concise emergency alert for each assigned responder. Every message must state what is happening, "
        "the exact supplied location, and that responder's own task. Use only supplied facts. Keep each under 45 words, "
        "plain and direct. Do not add safety claims, diagnoses, names, or tasks for other responders. Return exactly one "
        "message for every task index in the requested JSON format."
    )
    user_payload = json.dumps({
        "incident": incident.summary, "location": incident.location, "assignments": tasks,
    }, ensure_ascii=False)

    if mode == "ollama":
        model = os.getenv("PULSE_OLLAMA_MODEL", "qwen3.5:9b")
        body = {
            "model": model,
            "stream": False,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_payload},
            ],
            "format": alert_schema,
            "options": {"temperature": 0},
        }
        try:
            response = httpx.post(OLLAMA_CHAT_URL, json=body, timeout=httpx.Timeout(90.0, connect=5.0))
            response.raise_for_status()
            output = json.loads(response.json()["message"]["content"])
        except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError) as exc:
            raise AnalysisServiceError(
                f"Could not generate responder alert drafts with Ollama. Ensure Ollama is running and '{model}' is installed."
            ) from exc
    else:
        body = {
            "model": os.getenv("PULSE_OPENAI_MODEL", "gpt-6-astra"),
            "store": False,
            "max_output_tokens": max(300, min(1200, len(assignments) * 100)),
            "input": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_payload},
            ],
            "text": {"format": {"type": "json_schema", "name": "responder_alert_drafts", "strict": True, "schema": alert_schema}},
        }
        try:
            response = httpx.post(
                OPENAI_RESPONSES_URL,
                headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}", "Content-Type": "application/json"},
                json=body, timeout=httpx.Timeout(25.0, connect=8.0),
            )
            response.raise_for_status()
            output = json.loads(_extract_output_text(response.json()))
        except (AnalysisServiceError, httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError) as exc:
            raise AnalysisServiceError("Could not generate responder alert drafts. Retry or use the provided editable templates.") from exc

    try:
        indexed = {item["index"]: item["message"].strip() for item in output["messages"]}
        if set(indexed) != set(range(len(assignments))) or any(not message or len(message) > 500 for message in indexed.values()):
            raise ValueError("The AI did not return one valid message per responder.")
        return [indexed[index] for index in range(len(assignments))], mode
    except (ValueError, KeyError, TypeError, AttributeError) as exc:
        raise AnalysisServiceError("Could not generate responder alert drafts. Retry or use the provided editable templates.") from exc
