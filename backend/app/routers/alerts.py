from fastapi import APIRouter, HTTPException, Response

from .. import database
from ..schemas import VolunteerAlert
from ..services.alerts import inbox, save_alert
from ..services.incidents import now, require_incident

router = APIRouter(prefix="/api/volunteers", tags=["volunteer alerts"])


def require_volunteer(db, volunteer_id: str) -> None:
    if not any(r.id == volunteer_id and r.id.startswith("VOL-") for r in database.list_resources(db)):
        raise HTTPException(404, "Volunteer not found.")


@router.get("/{volunteer_id}/alerts", response_model=list[VolunteerAlert])
def get_alerts(volunteer_id: str, response: Response) -> list[VolunteerAlert]:
    response.headers["Cache-Control"] = "no-store"
    with database.connection() as db:
        require_volunteer(db, volunteer_id)
        return inbox(db, volunteer_id)


@router.post("/{volunteer_id}/alerts/{alert_id}/acknowledge", response_model=VolunteerAlert)
def acknowledge(volunteer_id: str, alert_id: str) -> VolunteerAlert:
    with database.connection(write=True) as db:
        require_volunteer(db, volunteer_id)
        row = db.execute("SELECT payload FROM volunteer_alerts WHERE id = ? AND volunteer_id = ?",
                         (alert_id, volunteer_id)).fetchone()
        if not row:
            raise HTTPException(404, "Alert not found for this volunteer.")
        alert = VolunteerAlert.model_validate_json(row["payload"])
        if not alert.acknowledged_at:
            alert.acknowledged_at = now()
            save_alert(db, alert)
        alert.active = require_incident(db, alert.incident_id).status != "resolved"
        return alert
