import sqlite3
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException

from .. import database
from ..schemas import Incident, ResponsePlan, TimelineEvent
from .coordinator import recommend


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def event(incident: Incident, kind: str, actor: str, message: str) -> None:
    timestamp = now()
    incident.updated_at = timestamp
    incident.timeline.append(TimelineEvent(id=uuid4().hex, timestamp=timestamp, kind=kind, actor=actor, message=message))


def require_incident(db: sqlite3.Connection, incident_id: str) -> Incident:
    incident = database.get_incident(db, incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found.")
    return incident


def require_open(incident: Incident) -> None:
    if incident.status == "resolved":
        raise HTTPException(status_code=409, detail="This incident is resolved and cannot be changed.")


def refresh(incident: Incident, db: sqlite3.Connection) -> Incident:
    resources = database.list_resources(db)
    # Older saved recommendations may contain responder IDs without a name snapshot.
    by_id = {resource.id: resource for resource in resources}
    for assignment in incident.recommendation.assignments:
        resource = by_id.get(assignment.resource_id)
        if resource:
            assignment.resource_name = assignment.resource_name or resource.name
            assignment.resource_role = assignment.resource_role or resource.role
            assignment.resource_zone = assignment.resource_zone or resource.zone
    if incident.status not in ["resolved", "response_dispatched", "in_progress"] and not incident.recommendation.manager_edited:
        recommendation = incident.recommendation
        plan = ResponsePlan(
            medical_assistance_needed=recommendation.medical_assistance_needed,
            responder_needs=recommendation.responder_needs,
            actions=recommendation.actions or ["Review the incident and confirm an appropriate response."],
            reasoning=recommendation.reasoning or ["Suggested response requires manager review."],
        ) if recommendation.responder_needs else None
        incident.recommendation = recommend(incident, resources, plan)
    return incident

