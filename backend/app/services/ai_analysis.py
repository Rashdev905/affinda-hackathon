"""Validated report analysis using Gemini structured output, with an explicit mock mode."""

import json
import os
import re

import httpx

from ..schemas import Incident, LLMAnalysis, ParsedReport, ResponderAssignment, ResponderNeed, Resource, ResponsePlan
from .ai_mock import parse_report, parse_update
from .coordinator import default_response_plan

GEMINI_GENERATE_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

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


_FRACTURE_SIGNAL = re.compile(
    r"\b(?:broken|fractured)\s+(?:(?:left|right)\s+)?(?:leg|arm|ankle|wrist|hip|rib|bone)\b"
    r"|\bfracture\b"
    r"|\b(?:leg|arm|ankle|wrist|hip|rib)\s+(?:is\s+)?(?:(?:possibly|suspected to be|may be|might be|could be)\s+)?(?:a\s+)?broken\b"
    r"|\bsuspected\s+(?:broken|fractured)\s+(?:(?:left|right)\s+)?(?:leg|arm|ankle|wrist|hip|rib|bone)\b",
    re.IGNORECASE,
)
_FRACTURE_NEGATION = re.compile(
    r"\b(?:no|not|without|never)\s+(?:(?:evidence|signs|indication)\s+of\s+)?(?:a\s+|any\s+|the\s+)?(?:broken|fractured|fracture)\b"
    r"|\b(?:does not|doesn't|did not|didn't)\s+(?:appear to have|have|sustain)\s+(?:a\s+)?(?:broken|fractured|fracture)\b"
    r"|\bfracture\s+(?:was\s+)?(?:ruled out|not present)\b",
    re.IGNORECASE,
)


def _apply_safety_overrides(parsed: ParsedReport, plan: ResponsePlan, context: str) -> None:
    """Keep an explicit possible fracture from being downgraded by model wording."""
    if not _FRACTURE_SIGNAL.search(context) or _FRACTURE_NEGATION.search(context):
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
    mode = os.getenv("PULSE_AI_MODE", "").strip().lower()
    # Older local setup notes used "openai"; keep that setting usable with Gemini.
    if mode == "openai":
        mode = "gemini"
    if not mode:
        mode = "gemini" if os.getenv("GEMINI_API_KEY") else "mock"
    if mode not in {"mock", "gemini"}:
        raise AnalysisServiceError("PULSE_AI_MODE must be 'mock' or 'gemini'.")
    if mode == "gemini" and not os.getenv("GEMINI_API_KEY"):
        raise AnalysisServiceError("Gemini analysis is enabled but GEMINI_API_KEY is not set.")
    return mode


def alert_provider_mode() -> str:
    """Select the alert-drafting provider independently from incident analysis."""
    mode = os.getenv("PULSE_ALERT_PROVIDER", "").strip().lower()
    # Redirect prior OpenAI/Ollama alert settings to the replacement provider.
    if mode in {"openai", "ollama"}:
        mode = "gemini"
    # Preserve the previous behavior when no alert-specific provider is configured.
    if not mode:
        return provider_mode()
    if mode not in {"mock", "gemini"}:
        raise AnalysisServiceError("PULSE_ALERT_PROVIDER must be 'mock' or 'gemini'.")
    if mode == "gemini" and not os.getenv("GEMINI_API_KEY"):
        raise AnalysisServiceError("Gemini alert drafting is enabled but GEMINI_API_KEY is not set.")
    return mode


def _available_capabilities(resources: list[Resource]) -> list[dict]:
    # Do not send volunteer names or IDs to the model. The server assigns actual people.
    return [
        {"role": resource.role, "zone": resource.zone, "skills": resource.skills}
        for resource in resources if resource.available and resource.current_assignment is None
    ]


def _call_gemini_json(system: str, user_data: dict, schema: dict, max_output_tokens: int) -> dict:
    """Call Gemini's GenerateContent API and parse its schema-constrained JSON response."""
    model = os.getenv("PULSE_GEMINI_MODEL", "gemini-3.8-flash")
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": json.dumps(user_data, ensure_ascii=False)}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseJsonSchema": schema,
            "temperature": 0,
            "maxOutputTokens": max_output_tokens,
        },
    }
    try:
        response = httpx.post(
            GEMINI_GENERATE_URL.format(model=model),
            headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"], "Content-Type": "application/json"},
            json=body,
            timeout=httpx.Timeout(45.0, connect=8.0),
        )
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            try:
                api_message = exc.response.json().get("error", {}).get("message", "")
            except (ValueError, AttributeError):
                api_message = ""
            detail = f": {api_message[:400]}" if api_message else ""
            raise AnalysisServiceError(f"Gemini API returned HTTP {exc.response.status_code}{detail}") from exc
        parts = response.json()["candidates"][0]["content"]["parts"]
        output_text = "".join(part.get("text", "") for part in parts if isinstance(part.get("text"), str))
        if not output_text:
            raise ValueError("Gemini returned no text content.")
        output = json.loads(output_text)
        if not isinstance(output, dict):
            raise ValueError("Gemini returned a non-object JSON value.")
        return output
    except AnalysisServiceError:
        raise
    except httpx.TimeoutException as exc:
        raise AnalysisServiceError("The Gemini API request timed out. Check your internet connection and retry.") from exc
    except httpx.HTTPError as exc:
        raise AnalysisServiceError("Could not connect to the Gemini API. Check your internet connection and retry.") from exc
    except (ValueError, KeyError, IndexError, TypeError, AttributeError) as exc:
        raise AnalysisServiceError(
            "Gemini returned an empty or invalid response. Check PULSE_GEMINI_MODEL and retry."
        ) from exc


def _call_gemini_analysis(report_text: str, resources: list[Resource], existing: Incident | None) -> LLMAnalysis:
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
        "mean review sooner. Do not invent facts. Classify each new incident from its initial report text. Extract the location "
        "directly from that text, preserving the named zone, landmark, and relative position (for example, 'beside the west "
        "entrance of the Food Village'). Never replace a specific location with only a broad zone, and never guess a location. "
        "Extract concise observations and ask only for critical missing details. The initial report should provide the available "
        "incident facts; do not ask the volunteer to repeat or move the location into a later update. "
        "Treat an explicit or suspected broken/fractured bone as a medical incident requiring medical assistance and at least a 70/100 queue score; do not call a possible fracture low priority. Do not infer a fracture from a negative statement such as 'no fracture'. Recommend whether medical assistance is needed, then list one responder need per person with a required skill "
        "that exists in the supplied available capabilities and a concrete responsibility. Use paramedic when that skill "
        "is justified and available. Recommend no more than 10 people. If no capability matches, still describe the need; "
        "the server will report the staffing gap. Give concise response actions and reasons. For updates, return the current "
        "combined incident picture and preserve prior facts unless the new update clearly corrects them. Use an empty "
        "string for follow_up_question when none is needed. The manager must "
        "approve any assignment. Output only the requested structured data."
    )
    try:
        output = _call_gemini_json(system, user_data, ANALYSIS_SCHEMA, 1400)
        analysis = LLMAnalysis.model_validate(output)
    except AnalysisServiceError:
        raise
    except (ValueError, TypeError) as exc:
        raise AnalysisServiceError("Gemini analysis returned invalid incident data. The report was not saved; retry or use mock mode.") from exc

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
    if mode == "gemini":
        analysis = _call_gemini_analysis(report_text, resources, existing)
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
    try:
        output = _call_gemini_json(system_prompt, {
            "incident": incident.summary,
            "location": incident.location,
            "assignments": tasks,
        }, alert_schema, max(300, min(1200, len(assignments) * 100)))
        indexed = {item["index"]: item["message"].strip() for item in output["messages"]}
        if set(indexed) != set(range(len(assignments))) or any(not message or len(message) > 500 for message in indexed.values()):
            raise ValueError("The AI did not return one valid message per responder.")
        return [indexed[index] for index in range(len(assignments))], mode
    except AnalysisServiceError as exc:
        raise AnalysisServiceError(f"Could not generate responder alert drafts. {exc}") from exc
    except (ValueError, KeyError, TypeError, AttributeError) as exc:
        raise AnalysisServiceError(
            "Gemini returned alert drafts that did not match the assigned responders. Retry or use the editable templates."
        ) from exc
