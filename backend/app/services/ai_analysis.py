"""Validated report analysis using OpenAI Structured Outputs, with an explicit mock mode."""

import json
import os

import httpx

from ..schemas import Incident, LLMAnalysis, ParsedReport, ResponderNeed, Resource, ResponsePlan
from .ai_mock import parse_report, parse_update
from .coordinator import default_response_plan

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"

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


def provider_mode() -> str:
    mode = os.getenv("PULSE_AI_MODE", "").strip().lower()
    if not mode:
        mode = "openai" if os.getenv("OPENAI_API_KEY") else "mock"
    if mode not in {"mock", "openai"}:
        raise AnalysisServiceError("PULSE_AI_MODE must be 'mock' or 'openai'.")
    if mode == "openai" and not os.getenv("OPENAI_API_KEY"):
        raise AnalysisServiceError("OpenAI analysis is enabled but OPENAI_API_KEY is not set.")
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
        "Recommend whether medical assistance is needed, then list one responder need per person with a required skill "
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
        return analysis.parsed_report(), analysis.response_plan(), mode

    parsed = parse_update(existing, report_text) if existing else parse_report(report_text)
    if existing:
        parsed.priority_score = max(parsed.priority_score, existing.priority_score)
    return parsed, default_response_plan(parsed), mode
