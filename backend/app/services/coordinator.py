from ..models import REQUIRED_SKILLS, ZONES
from ..schemas import Incident, Recommendation, ResponderAssignment, ResponderNeed, Resource, ResponsePlan


def default_response_plan(incident) -> ResponsePlan:
    """Deterministic fallback used when Gemini is not configured."""
    if incident.type == "medical":
        needs = [ResponderNeed(required_skill="first_aid", responsibility="Assess the person and provide first aid.")]
        if incident.priority_score >= 70:
            needs.append(ResponderNeed(required_skill="first_aid", responsibility="Support the first aider and coordinate with the medical tent."))
        return ResponsePlan(
            medical_assistance_needed=True,
            responder_needs=needs,
            actions=["Confirm the person's condition and exact location with the reporting volunteer."],
            reasoning=["A reported medical incident should receive human review and appropriately qualified assistance."],
        )
    if incident.type == "lost_person":
        return ResponsePlan(
            medical_assistance_needed=False,
            responder_needs=[
                ResponderNeed(required_skill="safeguarding", responsibility="Stay with the person and follow safeguarding procedures."),
                ResponderNeed(required_skill="communication", responsibility="Coordinate the reunification point with the manager."),
            ],
            actions=["Keep the person in a safe, staffed location and follow safeguarding procedures."],
            reasoning=["Safeguarding support and clear manager coordination are appropriate for a lost-person report."],
        )
    skill = REQUIRED_SKILLS[incident.type]
    responsibility = {
        "security": "Assess the scene and help maintain a safe perimeter.",
        "site_operations": "Inspect the reported site hazard and make the area safe if appropriate.",
        "communication": "Confirm details with the reporting volunteer and coordinate next steps.",
    }.get(skill, "Attend the incident and assist as directed by the manager.")
    return ResponsePlan(
        medical_assistance_needed=False,
        responder_needs=[ResponderNeed(required_skill=skill, responsibility=responsibility)],
        actions=["Confirm the incident details and coordinate a suitable response."],
        reasoning=[f"The report is categorized as {incident.type.replace('_', ' ')}."],
    )


def recommend(incident: Incident, resources: list[Resource], plan: ResponsePlan | None = None) -> Recommendation:
    plan = plan or default_response_plan(incident)
    responder_needs = list(plan.responder_needs)
    medical_scenario = incident.type == "medical" or plan.medical_assistance_needed

    def is_medical_staff(resource: Resource) -> bool:
        return bool({"first_aid", "paramedic"}.intersection(resource.skills))

    zone = next((zone for zone in ZONES if zone in incident.location), None)
    eligible = [resource for resource in resources if
                (resource.available and resource.current_assignment is None)
                or resource.current_assignment == incident.id]
    used: set[str] = set()
    assignments: list[ResponderAssignment] = []
    conflicts: list[str] = []
    short_staffed = False

    for need in plan.responder_needs:
        candidates = [resource for resource in eligible if need.required_skill in resource.skills and resource.id not in used]

        def rank(resource: Resource) -> tuple[int, int, int, int, int, str]:
            medical_staff_match = 0 if medical_scenario or not is_medical_staff(resource) else 1
            paramedic_match = 0 if medical_scenario and need.required_skill == "first_aid" and "paramedic" in resource.skills else 1
            reporter_match = 0 if resource.id == incident.reported_by else 1
            zone_match = 0 if zone and resource.zone == zone else 1
            team_match = 1 if "team" in resource.role.lower() else 0
            return medical_staff_match, paramedic_match, reporter_match, zone_match, team_match, resource.id

        candidates.sort(key=rank)
        if not candidates:
            short_staffed = True
            skill_name = need.required_skill.replace("_", " ")
            conflicts.append(f"No free responder with {skill_name} skills for: {need.responsibility}")
            continue
        chosen = candidates[0]
        used.add(chosen.id)
        if not medical_scenario and is_medical_staff(chosen):
            short_staffed = True
        assignments.append(ResponderAssignment(
            resource_id=chosen.id,
            resource_name=chosen.name,
            resource_role=chosen.role,
            resource_zone=chosen.zone,
            required_skill=need.required_skill,
            responsibility=(
                "Stay at the scene, guide responders to the exact location, and share updates."
                if chosen.id == incident.reported_by and need.required_skill == "communication"
                else need.responsibility
            ),
        ))

    # If the reporter did not fill a required role, roster them as a nearby scene contact
    # when they are free and have communication skills.
    reporter = next((resource for resource in resources if resource.id == incident.reported_by), None)
    if (
        reporter and reporter.id not in used
        and ((reporter.available and reporter.current_assignment is None) or reporter.current_assignment == incident.id)
        and "communication" in reporter.skills and len(responder_needs) < 10
        and (medical_scenario or not is_medical_staff(reporter) or short_staffed)
    ):
        reporter_need = ResponderNeed(
            required_skill="communication",
            responsibility="Stay at the scene, guide responders to the exact location, and share updates.",
        )
        responder_needs.append(reporter_need)
        assignments.append(ResponderAssignment(
            resource_id=reporter.id,
            resource_name=reporter.name,
            resource_role=reporter.role,
            resource_zone=reporter.zone,
            required_skill="communication",
            responsibility=reporter_need.responsibility,
        ))
        used.add(reporter.id)

    unavailable_skills = sorted({need.required_skill for need in responder_needs})
    unavailable = [resource for resource in resources if resource.current_assignment and resource.current_assignment != incident.id
                   and any(skill in resource.skills for skill in unavailable_skills)]
    if unavailable:
        conflicts.append("Qualified responders already assigned elsewhere: " + ", ".join(
            f"{resource.name} ({resource.current_assignment})" for resource in unavailable
        ))

    responder_ids = [assignment.resource_id for assignment in assignments]
    conflicts.extend(coverage_conflicts(responder_ids, resources, incident.id))
    reasoning = list(plan.reasoning)
    for assignment in assignments:
        resource = next(resource for resource in resources if resource.id == assignment.resource_id)
        reasoning.append(
            f"{resource.name} matched to {assignment.required_skill.replace('_', ' ')}; "
            + (f"located in {zone}." if zone and resource.zone == zone else f"based at {resource.zone}.")
        )
    alternatives = [
        resource.id for resource in eligible
        if resource.id not in responder_ids and any(skill in resource.skills for skill in unavailable_skills)
    ][:5]
    return Recommendation(
        recommended_responders=responder_ids,
        medical_assistance_needed=plan.medical_assistance_needed,
        responders_needed=len(responder_needs),
        responder_needs=responder_needs,
        assignments=assignments,
        alternatives=alternatives,
        actions=plan.actions,
        reasoning=reasoning,
        conflicts=conflicts,
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
