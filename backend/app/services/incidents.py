import sqlite3
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException

from .. import database
from ..schemas import Incident, TimelineEvent
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
    if incident.status not in ["resolved", "response_dispatched", "in_progress"]:
        incident.recommendation = recommend(incident, database.list_resources(db))
    return incident

