"""Persistent alert inbox; recipient selection is deliberately a demo placeholder."""
import sqlite3
from uuid import uuid4

from .. import database
from ..schemas import Incident, VolunteerAlert
from .incidents import event, now


def save_alert(db: sqlite3.Connection, alert: VolunteerAlert) -> None:
    db.execute(
        """INSERT INTO volunteer_alerts VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET payload = excluded.payload""",
        (alert.id, alert.incident_id, alert.volunteer_id, alert.model_dump_json()),
    )


def queue_alerts(db: sqlite3.Connection, incident: Incident, recipients: list[str],
                 message: str, source: str) -> None:
    volunteers = {r.id for r in database.list_resources(db) if r.id.startswith("VOL-")}
    location_step = (f"If safe, go to {incident.location} and keep access clear for trained responders."
                     if incident.location != "Location to confirm"
                     else "Confirm the location with the reporting volunteer before moving.")
    for volunteer_id in set(recipients) & volunteers:
        save_alert(db, VolunteerAlert(
            id=uuid4().hex, incident_id=incident.id, volunteer_id=volunteer_id,
            source=source, urgency=incident.urgency, location=incident.location,
            message=message, created_at=now(),
            instructions=[location_step, "Contact your supervisor and follow their instructions.",
                          "Send an incident update when you arrive or need help."],
        ))


def queue_emergency(db: sqlite3.Connection, incident: Incident) -> None:
    # Emergency notifications are sent only after a manager approves and assigns a response.
    if incident.urgency not in ("high", "critical") or incident.status != "response_dispatched" or not incident.assigned_responders:
        return
    recipients = incident.assigned_responders
    queue_alerts(db, incident, recipients, incident.summary, "automatic")
    event(incident, "emergency_alert", "Pulse · demo alerts",
          f"Emergency alert queued for {len(recipients)} manager-approved responders.")


def inbox(db: sqlite3.Connection, volunteer_id: str) -> list[VolunteerAlert]:
    alerts = []
    # Include acknowledged history; resolved incidents must never trigger a new alarm.
    rows = db.execute("""SELECT a.payload, i.payload AS incident FROM volunteer_alerts a
        JOIN incidents i ON i.id = a.incident_id WHERE a.volunteer_id = ?
        ORDER BY a.rowid DESC LIMIT 200""", (volunteer_id,))
    for row in rows:
        alert = VolunteerAlert.model_validate_json(row["payload"])
        alert.active = Incident.model_validate_json(row["incident"]).status != "resolved"
        alerts.append(alert)
    return alerts
