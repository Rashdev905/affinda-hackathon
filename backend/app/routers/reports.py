from uuid import uuid4

from fastapi import APIRouter, HTTPException

from .. import database
from ..schemas import Incident, Recommendation, ReportInput
from ..services.ai_analysis import AnalysisServiceError, analyze_report
from ..services.coordinator import recommend
from ..services.incidents import event, now
from ..services.report_location import apply_reporter_location
from ..services.manager_notifications import queue_manager_notification

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.post("", response_model=Incident, status_code=201)
def create_report(body: ReportInput) -> Incident:
    with database.connection() as db:
        resources = database.list_resources(db)
    reporter_zone = next((resource.zone for resource in resources if resource.id == body.reported_by), None)
    try:
        parsed, plan, parser_mode = analyze_report(body.text, resources, reporter_zone=reporter_zone)
    except AnalysisServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    location_note = apply_reporter_location(parsed, resources, body.reported_by, parser_mode)
    timestamp = now()
    incident = Incident(
        **parsed.model_dump(), id="INC-" + uuid4().hex[:8].upper(),
        status="awaiting_clarification" if parsed.missing_information else "awaiting_approval",
        reported_by=body.reported_by, created_at=timestamp, updated_at=timestamp, timeline=[],
        parser_mode=parser_mode,
        recommendation=Recommendation(recommended_responders=[], actions=[], reasoning=[], conflicts=[]),
    )
    with database.connection(write=True) as db:
        incident.recommendation = recommend(incident, database.list_resources(db), plan)
        event(incident, "reported", body.reported_by, body.text)
        if location_note:
            event(incident, "location_inferred", "Pulse", location_note)
        event(incident, "suggestion", f"Pulse · {parser_mode} analysis", "Report structured. Suggested response awaits a manager decision.")
        database.save_incident(db, incident)
        queue_manager_notification(db, incident, body.reported_by, body.text, "report")
    return incident
