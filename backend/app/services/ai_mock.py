"""Deterministic demo parser for typed reports and reviewed voice transcripts.

These keyword rules are a demo fixture, not clinical interpretation or triage.
The raw report and every update are preserved in the incident timeline.
"""
import re

from ..models import ZONES
from ..schemas import Incident, ParsedReport
from .medical_priority import medical_priority, normalize


def parse_report(text: str) -> ParsedReport:
    lower = normalize(text)
    zone = next((zone for zone in ZONES if zone.lower() in lower), None)
    location = zone or "Location to confirm"
    if zone and "toilet" in lower:
        location += " Toilets"
    type_ = "general"
    medical = medical_priority(text)
    if medical:
        type_ = "medical"
    elif any(word in lower for word in ["lost child", "missing child", "lost person", "separated", "can't find", "cannot find"]):
        type_ = "lost_person"
    elif any(word in lower for word in ["fight", "aggressive", "security", "threat"]):
        type_ = "security"
    elif any(word in lower for word in ["fire", "smoke", "cable", "hazard", "blocked"]):
        type_ = "hazard"
    priority_score = medical.score if medical else {"security": 76, "lost_person": 58, "hazard": 42, "general": 20}[type_]
    urgency = medical.urgency if medical else "high" if priority_score >= 70 else "medium" if priority_score >= 35 else "low"
    # Preserve the actual evidence instead of inferring 'conscious' from the
    # substring in 'unconscious', or discarding the words which triggered a rule.
    observations = [text.strip()[:500]]
    if medical:
        observations.append("Keyword priority: " + medical.reason)
    missing = []
    if not zone:
        missing.append("location")
    if medical and medical.score >= 70 and not breathing_supplied(lower):
        missing.append("breathing_status")
    if medical and medical.vague:
        missing.append("symptoms")
    question = question_for(missing)
    summary = "Person collapsed and appears dizzy" if "collapsed" in lower and "dizzy" in lower else text.strip()[:200]
    return ParsedReport(type=type_, location=location, summary=summary, observations=observations,
                        urgency=urgency, priority_score=priority_score,
                        missing_information=missing, follow_up_question=question)


def question_for(missing: list[str]) -> str | None:
    # Ask about immediate danger before a missing landmark. Dispatch remains a
    # manager decision; urgency never waits on the answer to this question.
    if "breathing_status" in missing:
        return "Is the person breathing normally?"
    if "symptoms" in missing:
        return "What symptoms are present, and is the person alert and breathing normally?"
    if "location" in missing:
        return "Which festival zone are you in, and what is the nearest landmark?"
    return None


def breathing_supplied(text: str) -> bool:
    # 'Unknown breathing' or 'are they breathing?' does not answer the question.
    return bool(re.search(
        r"\b(?:breathing (?:normally|well|slowly|very slowly)|normal breathing|"
        r"not breathing|stopped breathing|no (?:normal )?breathing|"
        r"(?:cannot|hard to|unable to) breathe|(?:difficulty|trouble) breathing|"
        r"struggling for breath|gasping|occasional gasps)\b", normalize(text),
    )) and not bool(re.search(r"\b(?:is|are) (?:he|she|they|the person) breathing", normalize(text)))


def parse_update(incident: Incident, text: str) -> ParsedReport:
    parsed = parse_report(text)
    lower = normalize(text)
    answering_breathing = incident.follow_up_question == "Is the person breathing normally?"
    missing = list(incident.missing_information)
    location = incident.location
    if parsed.location != "Location to confirm":
        location = parsed.location
        missing = [item for item in missing if item != "location"]
    if "breathing_status" in missing and (
        breathing_supplied(text)
        or (answering_breathing and re.match(r"^(yes|no)\b", lower))
    ):
        missing.remove("breathing_status")
    type_ = parsed.type if parsed.type != "general" else incident.type
    if (type_ == "medical" and parsed.priority_score >= 70
            and (incident.type != "medical" or parsed.priority_score > incident.priority_score)
            and not breathing_supplied(text)):
        missing.append("breathing_status")
    medical = medical_priority(text)
    if "symptoms" in missing and medical and not medical.vague:
        missing.remove("symptoms")
    levels = ["low", "medium", "high", "critical"]
    urgency = max([incident.urgency, parsed.urgency], key=levels.index)
    priority_score = max(incident.priority_score, parsed.priority_score)
    if answering_breathing and re.match(r"^no\b", lower):
        urgency = "critical"
        priority_score = 100
    # Do not downgrade urgency from a short reassuring update in this mock.
    return ParsedReport(
        type=type_, location=location, summary=incident.summary,
        observations=incident.observations + [text.strip()], urgency=urgency,
        priority_score=priority_score,
        missing_information=list(dict.fromkeys(missing)), follow_up_question=question_for(missing),
    )
