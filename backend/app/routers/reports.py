from uuid import uuid4

from fastapi import APIRouter

from .. import database
from ..schemas import Incident, Recommendation, ReportInput
from ..services.ai_mock import parse_report
from ..services.coordinator import recommend
from ..services.incidents import event, now

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.post("", response_model=Incident, status_code=201)
def create_report(body: ReportInput) -> Incident:
    parsed = parse_report(body.text)
    timestamp = now()
    incident = Incident(
        **parsed.model_dump(), id="INC-" + uuid4().hex[:8].upper(),
        status="awaiting_clarification" if parsed.missing_information else "awaiting_approval",
        reported_by=body.reported_by, created_at=timestamp, updated_at=timestamp, timeline=[],
        recommendation=Recommendation(recommended_responders=[], actions=[], reasoning=[], conflicts=[]),
    )
    with database.connection(write=True) as db:
        incident.recommendation = recommend(incident, database.list_resources(db))
        event(incident, "reported", body.reported_by, body.text)
        event(incident, "suggestion", "Pulse · mock parser", "Report structured. Suggested response awaits a safety lead decision.")
        database.save_incident(db, incident)
    return incident

