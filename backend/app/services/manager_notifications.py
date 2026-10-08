import sqlite3
from typing import Literal

from .. import database
from ..schemas import Incident


def queue_manager_notification(db: sqlite3.Connection, incident: Incident, reporter_id: str,
                               message: str, kind: Literal["report", "update"]) -> None:
    """Use the caller's transaction so the saved message and notification stay together."""
    reporter = next((r for r in database.list_resources(db)
                     if r.id == reporter_id and r.id.startswith("VOL-")), None)
    if reporter:
        db.execute("""INSERT INTO manager_updates
            (incident_id, volunteer_id, volunteer_name, message, location, created_at, kind)
            VALUES (?, ?, ?, ?, ?, ?, ?)""", (incident.id, reporter.id, reporter.name,
            message[:500], incident.location, incident.updated_at, kind))
