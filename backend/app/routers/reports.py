from uuid import uuid4

from fastapi import APIRouter, HTTPException

from .. import database
from ..schemas import Incident, Recommendation, ReportInput
from ..services.ai_analysis import AnalysisServiceError, analyze_report
from ..services.coordinator import recommend
from ..services.incidents import event, now

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.post("", response_model=Incident, status_code=201)
def create_report(body: ReportInput) -> Incident:
    with database.connection() as db:
        resources = database.list_resources(db)
    try:
        parsed, plan, parser_mode = analyze_report(body.text, resources)
    except AnalysisServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
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
        event(incident, "suggestion", f"Pulse · {parser_mode} analysis", "Report structured. Suggested response awaits a manager decision.")
        database.save_incident(db, incident)
    return incident
