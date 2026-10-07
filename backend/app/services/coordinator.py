from ..models import REQUIRED_SKILLS, ZONES
from ..schemas import Incident, Recommendation, Resource


def recommend(incident: Incident, resources: list[Resource]) -> Recommendation:
    skill = REQUIRED_SKILLS[incident.type]
    zone = next((zone for zone in ZONES if zone in incident.location), None)
    qualified = [resource for resource in resources if skill in resource.skills]
    eligible = [resource for resource in qualified if
                (resource.available and resource.current_assignment is None)
                or resource.current_assignment == incident.id]

    def score(resource: Resource) -> int:
        return 40 + (25 if resource.zone == zone else 0) + (25 if resource.available else 0) + (10 if not resource.current_assignment else 0)

    eligible.sort(key=lambda resource: (-score(resource), resource.id))
    selected = eligible[:1]
    if incident.type == "medical" and incident.urgency in ["high", "critical"]:
        team = next((resource for resource in eligible if resource.role == "First-aid team" and resource not in selected), None)
        if team:
            selected.append(team)
    conflicts = []
    unavailable = [resource for resource in qualified if resource.current_assignment and resource.current_assignment != incident.id]
    if unavailable:
        conflicts.append("Already assigned elsewhere: " + ", ".join(f"{r.name} ({r.current_assignment})" for r in unavailable))
    if not selected:
        conflicts.append(f"No available responder with {skill.replace('_', ' ')} skills. Safety lead must arrange an alternative.")
    conflicts.extend(coverage_conflicts([resource.id for resource in selected], resources, incident.id))
    reasoning = [f"{resource.name}: {skill.replace('_', ' ')} skills, "
                 + ("in the incident zone" if resource.zone == zone else f"based at {resource.zone}")
                 + (", already assigned to this incident." if resource.current_assignment == incident.id else ", available and unassigned.")
                 for resource in selected]
    actions = [f"Assign {resource.name} to attend {incident.location}." for resource in selected]
    actions.append("Confirm the location and response with the reporting volunteer.")
    return Recommendation(
        recommended_responders=[resource.id for resource in selected],
        alternatives=[resource.id for resource in eligible if resource not in selected][:4],
        actions=actions, reasoning=reasoning, conflicts=conflicts,
    )


def coverage_conflicts(responder_ids: list[str], resources: list[Resource], incident_id: str) -> list[str]:
    selected = [resource for resource in resources if resource.id in responder_ids]
    warnings = []
    for zone in sorted({resource.zone for resource in selected}):
        remaining = [resource for resource in resources if resource.zone == zone and resource.available
                     and resource.current_assignment is None and resource.id not in responder_ids]
        if not remaining:
            warnings.append(f"Coverage check: this response leaves no available resources at {zone} (demo minimum: 1).")
    return warnings

