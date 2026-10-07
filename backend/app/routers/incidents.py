from fastapi import APIRouter, Header, HTTPException

from .. import database
from ..models import REQUIRED_SKILLS
from ..schemas import AlertInput, DecisionInput, Incident, ResponderAssignment, ResponderNeed, ResponsePlan, ResolveInput, UpdateInput
from ..services.ai_analysis import AnalysisServiceError, analyze_report
from ..services.alerts import queue_alerts, queue_emergency
from ..services.coordinator import coverage_conflicts, recommend
from ..services.incidents import event, refresh, require_incident, require_open

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


@router.delete("")
def clear_all_incidents(x_pulse_mode: str | None = Header(default=None)) -> dict[str, int]:
    if x_pulse_mode != "Manager":
        raise HTTPException(status_code=403, detail="Only Manager mode can clear incidents.")
    with database.connection(write=True) as db:
        deleted = database.delete_all_incidents(db)
        for resource in database.list_resources(db):
            if resource.current_assignment is not None:
                resource.available, resource.current_assignment, resource.status = True, None, "available"
                database.save_resource(db, resource)
    return {"deleted_count": deleted}


@router.get("", response_model=list[Incident])
def get_incidents() -> list[Incident]:
    with database.connection() as db:
        incidents = [refresh(incident, db) for incident in database.list_incidents(db)]
    incidents.sort(key=lambda incident: incident.created_at, reverse=True)
    incidents.sort(key=lambda incident: (incident.status == "resolved", -incident.priority_score))
    return incidents


@router.get("/{incident_id}", response_model=Incident)
def get_incident(incident_id: str) -> Incident:
    with database.connection() as db:
        return refresh(require_incident(db, incident_id), db)


@router.post("/{incident_id}/updates", response_model=Incident)
def update_incident(incident_id: str, body: UpdateInput) -> Incident:
    with database.connection() as db:
        original = require_incident(db, incident_id)
        require_open(original)
        resources = database.list_resources(db)
    try:
        parsed, plan, parser_mode = analyze_report(body.text, resources, original)
    except AnalysisServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    with database.connection(write=True) as db:
        incident = require_incident(db, incident_id)
        require_open(incident)
        if incident.updated_at != original.updated_at:
            raise HTTPException(status_code=409, detail="This incident changed while the update was analyzed. Refresh and submit the update again.")
        prior_plan = incident.recommendation
        plan_changed = (
            plan.medical_assistance_needed != prior_plan.medical_assistance_needed
            or [(need.required_skill, need.responsibility) for need in plan.responder_needs]
            != [(need.required_skill, need.responsibility) for need in prior_plan.responder_needs]
            or plan.actions != prior_plan.actions
        )
        escalated = parsed.priority_score > incident.priority_score or parsed.type != incident.type or plan_changed
        for key, value in parsed.model_dump().items():
            setattr(incident, key, value)
        incident.parser_mode = parser_mode
        event(incident, "update", body.reported_by, body.text)
        if escalated:
            incident.status = "awaiting_approval"
            incident.last_decision = None
            event(incident, "escalation", f"Pulse · {parser_mode} analysis", "New information changes the suggested response. Manager review required; existing assignments are retained.")
        elif incident.status == "response_dispatched":
            incident.status = "in_progress"
        elif incident.status not in ["in_progress"]:
            incident.status = "awaiting_clarification" if incident.missing_information else "awaiting_approval"
            incident.last_decision = None
        if incident.status not in ["in_progress", "response_dispatched"]:
            incident.recommendation = recommend(incident, database.list_resources(db), plan)
        if escalated:
            queue_emergency(db, incident)
        database.save_incident(db, incident)
    return incident


@router.post("/{incident_id}/decision", response_model=Incident)
def decide(incident_id: str, body: DecisionInput) -> Incident:
    with database.connection(write=True) as db:
        incident = require_incident(db, incident_id)
        require_open(incident)
        if incident.status not in ["awaiting_approval", "awaiting_clarification", "reported"]:
            raise HTTPException(status_code=409, detail="A response is already approved. Submit an update or resolve the incident.")
        if body.decision == "reject":
            if not body.note:
                raise HTTPException(status_code=422, detail="Add a reason so the next safety lead understands the rejection.")
            incident.last_decision = "reject"
            incident.status = "awaiting_approval"
            event(incident, "rejected", body.decided_by, "Suggested response rejected. " + body.note)
        else:
            resources = database.list_resources(db)
            previous = incident.recommendation
            # Preserve the responder IDs the lead reviewed; never silently substitute at approval.
            ids = body.responder_ids if body.responder_ids is not None else incident.recommendation.recommended_responders
            if not ids or len(set(ids)) != len(ids):
                raise HTTPException(status_code=422, detail="Select at least one responder, without duplicates.")
            chosen = []
            for id_ in ids:
                resource = next((resource for resource in resources if resource.id == id_), None)
                if resource is None:
                    raise HTTPException(status_code=422, detail=f"Unknown responder: {id_}.")
                if resource.current_assignment != incident.id and (not resource.available or resource.current_assignment):
                    raise HTTPException(status_code=409, detail=f"{resource.name} is no longer available. Refresh and review the suggested response.")
                chosen.append(resource)
            if incident.type == "medical":
                if incident.recommendation.medical_assistance_needed and not any(
                    {"first_aid", "paramedic"}.intersection(resource.skills) for resource in chosen
                ):
                    raise HTTPException(status_code=422, detail="The response must include a first-aid responder or paramedic.")
            elif not any(REQUIRED_SKILLS[incident.type] in resource.skills for resource in chosen):
                raise HTTPException(status_code=422, detail="The response must include a responder with the required incident skill.")
            if body.decision == "modify" and not body.note:
                raise HTTPException(status_code=422, detail="Add a short reason for the modified response.")
            for resource in resources:
                if resource.current_assignment == incident.id and resource.id not in ids:
                    resource.current_assignment, resource.available, resource.status = None, True, "available"
                    database.save_resource(db, resource)
            warnings = coverage_conflicts(ids, resources, incident.id)
            for resource in chosen:
                resource.available, resource.current_assignment, resource.status = False, incident.id, "assigned"
                database.save_resource(db, resource)
            incident.assigned_responders = ids
            approved_plan = ResponsePlan(
                medical_assistance_needed=previous.medical_assistance_needed,
                responder_needs=previous.responder_needs,
                actions=previous.actions or ["Attend the incident and assist as directed by the manager."],
                reasoning=previous.reasoning or ["Manager reviewed the suggested response."],
            ) if previous.responder_needs else None
            incident.recommendation = recommend(incident, resources, approved_plan)
            incident.recommendation.recommended_responders = ids
            old_assignments = {assignment.resource_id: assignment for assignment in previous.assignments}
            approved_assignments = []
            for resource in chosen:
                old_assignment = old_assignments.get(resource.id)
                need = next((item for item in previous.responder_needs if item.required_skill in resource.skills), None)
                skill = old_assignment.required_skill if old_assignment else need.required_skill if need else resource.skills[0] if resource.skills else REQUIRED_SKILLS[incident.type]
                responsibility = old_assignment.responsibility if old_assignment else need.responsibility if need else "Support the response as directed by the manager."
                approved_assignments.append(ResponderAssignment(
                    resource_id=resource.id, resource_name=resource.name, resource_role=resource.role,
                    resource_zone=resource.zone, required_skill=skill, responsibility=responsibility,
                ))
            incident.recommendation.assignments = approved_assignments
            incident.recommendation.responders_needed = len(ids)
            incident.recommendation.responder_needs = [
                ResponderNeed(required_skill=item.required_skill, responsibility=item.responsibility)
                for item in approved_assignments
            ]
            if body.actions is not None:
                incident.recommendation.actions = body.actions
            else:
                incident.recommendation.actions = [f"Assign {resource.name} to attend {incident.location}." for resource in chosen] + ["Confirm the location and response with the reporting volunteer."]
            incident.recommendation.reasoning = [f"{resource.name} selected by {body.decided_by}; skills: {', '.join(resource.skills)}." for resource in chosen]
            incident.recommendation.conflicts = warnings
            incident.status, incident.last_decision = "response_dispatched", body.decision
            event(incident, "modified" if body.decision == "modify" else "approved", body.decided_by,
                  f"Response {'modified and ' if body.decision == 'modify' else ''}approved. Assigned: {', '.join(r.name for r in chosen)}. " + body.note)
            if warnings:
                event(incident, "coverage", "Pulse · coordinator", " ".join(warnings))
        database.save_incident(db, incident)
    return incident


@router.post("/{incident_id}/resolve", response_model=Incident)
def resolve(incident_id: str, body: ResolveInput) -> Incident:
    with database.connection(write=True) as db:
        incident = require_incident(db, incident_id)
        require_open(incident)
        for resource in database.list_resources(db):
            if resource.current_assignment == incident.id:
                resource.available, resource.current_assignment, resource.status = True, None, "available"
                database.save_resource(db, resource)
        incident.status = "resolved"
        incident.resolution_note = body.note or "Resolved by the safety lead."
        event(incident, "resolved", body.resolved_by, incident.resolution_note)
        incident.assigned_responders = []
        incident.draft_report = (
            f"DRAFT INCIDENT REPORT — {incident.id}\n"
            f"Summary: {incident.summary}\nLocation: {incident.location}\n"
            f"Type: {incident.type}\nPriority: {'High' if incident.priority_score >= 70 else 'Medium' if incident.priority_score >= 35 else 'Low'}\n"
            f"Reported by: {incident.reported_by}\nOpened: {incident.created_at}\n"
            f"Resolved: {incident.updated_at}\nResolution: {incident.resolution_note}\n\n"
            + "\n".join(f"{entry.timestamp} · {entry.actor}: {entry.message}" for entry in incident.timeline)
            + "\n\nGenerated from recorded events using a deterministic template. Review before use."
        )
        database.save_incident(db, incident)
    return incident


@router.post("/{incident_id}/alerts", response_model=Incident)
def alert_assigned_volunteers(incident_id: str, body: AlertInput) -> Incident:
    with database.connection(write=True) as db:
        incident = require_incident(db, incident_id)
        require_open(incident)
        if not incident.assigned_responders:
            raise HTTPException(status_code=409, detail="Approve a response before alerting volunteers.")
        event(incident, "volunteer_alert", body.alerted_by, body.message)
        queue_alerts(db, incident, incident.assigned_responders, body.message, "manager")
        database.save_incident(db, incident)
    return incident
