"""Deterministic demo parser. Replace parse_report/parse_update with a validated AI adapter later.

These keyword rules are a demo fixture, not clinical interpretation or triage.
The raw report and every update are preserved in the incident timeline.
"""
import re

from ..models import ZONES
from ..schemas import Incident, ParsedReport


def parse_report(text: str) -> ParsedReport:
    lower = text.lower()
    zone = next((zone for zone in ZONES if zone.lower() in lower), None)
    location = zone or "Location to confirm"
    if zone and "toilet" in lower:
        location += " Toilets"
    type_ = "general"
    fracture_signal = bool(re.search(r"\b(?:broken|fractured)\s+(?:(?:left|right)\s+)?(?:leg|arm|ankle|wrist|hip|rib|bone)\b|\bfracture\b", lower))
    fracture_denied = bool(re.search(
        r"\b(?:no|not|without|never)\s+(?:(?:evidence|signs|indication)\s+of\s+)?(?:a\s+|any\s+|the\s+)?(?:broken|fractured|fracture)\b"
        r"|\b(?:does not|doesn't|did not|didn't)\s+(?:appear to have|have|sustain)\s+(?:a\s+)?(?:broken|fractured|fracture)\b"
        r"|\bfracture\s+(?:was\s+)?(?:ruled out|not present)\b", lower,
    ))
    suspected_fracture = fracture_signal and not fracture_denied
    if suspected_fracture or any(word in lower for word in ["collapsed", "dizzy", "unconscious", "fainted", "injured", "breathing", "heat", "medical"]):
        type_ = "medical"
    elif any(word in lower for word in ["lost child", "missing child", "lost person", "separated", "can't find", "cannot find"]):
        type_ = "lost_person"
    elif any(word in lower for word in ["fight", "aggressive", "security", "threat"]):
        type_ = "security"
    elif any(word in lower for word in ["fire", "smoke", "cable", "hazard", "blocked"]):
        type_ = "hazard"
    critical = bool(re.search(r"\bunconscious\b|not breathing|stopped breathing", lower))
    if re.search(r"not unconscious|no longer unconscious", lower):
        critical = False
    urgency = "critical" if critical else "high" if type_ in ["medical", "security"] else "medium" if type_ == "lost_person" else "low"
    priority_score = 98 if critical else 82 if type_ == "medical" else 76 if type_ == "security" else 58 if type_ == "lost_person" else 42 if type_ == "hazard" else 20
    observations = []
    if critical:
        observations.append("Reported loss of consciousness or breathing concern; safety lead review required")
    elif any(word in lower for word in ["awake", "conscious"]):
        observations.append("Person reportedly conscious")
    if "crowd" in lower:
        observations.append("Crowd forming nearby")
    if "breathing" in lower:
        observations.append("Breathing information supplied; see the original report")
    if not observations:
        observations = [text.strip()[:500]]
    missing = []
    if not zone:
        missing.append("location")
    if type_ == "medical" and "breathing" not in lower:
        missing.append("breathing_status")
    question = question_for(missing)
    summary = "Person collapsed and appears dizzy" if "collapsed" in lower and "dizzy" in lower else text.strip()[:200]
    return ParsedReport(type=type_, location=location, summary=summary, observations=observations,
                        urgency=urgency, priority_score=priority_score,
                        missing_information=missing, follow_up_question=question)


def question_for(missing: list[str]) -> str | None:
    if "location" in missing:
        return "Which festival zone are you in, and what is the nearest landmark?"
    if "breathing_status" in missing:
        return "Is the person breathing normally?"
    return None


def parse_update(incident: Incident, text: str) -> ParsedReport:
    parsed = parse_report(text)
    answering_breathing = incident.follow_up_question == "Is the person breathing normally?"
    missing = list(incident.missing_information)
    location = incident.location
    if parsed.location != "Location to confirm":
        location = parsed.location
        missing = [item for item in missing if item != "location"]
    if "breathing_status" in missing and (
        "breathing" in text.lower()
        or (answering_breathing and re.match(r"^(yes|no)\b", text.lower()))
    ):
        missing.remove("breathing_status")
    type_ = parsed.type if parsed.type != "general" else incident.type
    if type_ == "medical" and incident.type != "medical" and "breathing" not in text.lower():
        missing.append("breathing_status")
    levels = ["low", "medium", "high", "critical"]
    urgency = max([incident.urgency, parsed.urgency], key=levels.index)
    priority_score = max(incident.priority_score, parsed.priority_score)
    if answering_breathing and re.match(r"^no\b", text.lower()):
        urgency = "critical"
        priority_score = 100
    # Do not downgrade urgency from a short reassuring update in this mock.
    return ParsedReport(
        type=type_, location=location, summary=incident.summary,
        observations=incident.observations + [text.strip()], urgency=urgency,
        priority_score=priority_score,
        missing_information=list(dict.fromkeys(missing)), follow_up_question=question_for(missing),
    )
