from .schemas import Resource

LEGACY_RESOURCE_IDS = {"TEAM-FIRSTAID-A", "TEAM-FIRSTAID-B", "OPS-001"}


def seed_resources() -> list[Resource]:
    """Stable demo data; no incidents or assignments are inserted on startup."""
    rows = [
        ("VOL-001", "Alex Morgan", "General volunteer", "Lawn Stage", ["communication"]),
        ("VOL-002", "Jamie Chen", "First-aid volunteer", "Lawn Stage", ["first_aid", "communication"]),
        ("VOL-003", "Sam Taylor", "General volunteer", "River Stage", ["communication"]),
        ("VOL-004", "Priya Shah", "First-aid volunteer", "River Stage", ["first_aid", "communication"]),
        ("VOL-005", "Jordan Lee", "General volunteer", "Food Village", ["communication", "site_operations"]),
        ("VOL-006", "Casey Wilson", "First-aid volunteer", "Food Village", ["first_aid", "communication"]),
        ("VOL-007", "Riley James", "Welfare volunteer", "North Gate", ["safeguarding", "communication"]),
        ("VOL-008", "Avery Nguyen", "General volunteer", "North Gate", ["communication"]),
        ("VOL-009", "Charlie Brown", "Welfare volunteer", "South Gate", ["safeguarding", "communication"]),
        ("VOL-010", "Taylor Kim", "General volunteer", "South Gate", ["communication"]),
        ("VOL-011", "Morgan Patel", "Welfare volunteer", "Lawn Stage", ["safeguarding", "communication"]),
        ("VOL-012", "Drew Williams", "Site volunteer", "River Stage", ["site_operations", "communication"]),
        ("VOL-013", "Harper Singh", "Site volunteer", "Food Village", ["site_operations", "communication"]),
        ("VOL-015", "Ethan Cole", "Paramedic", "Lawn Stage", ["first_aid", "paramedic", "communication"]),
        ("VOL-016", "Maya Thompson", "Paramedic", "River Stage", ["first_aid", "paramedic", "communication"]),
        ("VOL-014", "Joon Kit Loong", "General volunteer", "Lawn Stage", ["communication"]),
        ("SEC-001", "Security · North", "Security staff", "North Gate", ["security", "safeguarding"]),
        ("SEC-002", "Security · South", "Security staff", "South Gate", ["security", "safeguarding"]),
        ("SEC-003", "Security · Stages", "Security staff", "River Stage", ["security", "safeguarding"]),
    ]
    return [Resource(
        id=id_, name=name, role=role, zone=zone, skills=skills,
        qualifications=(
            ["Simulated paramedic qualification", "Simulated first-aid qualification"] if "paramedic" in skills
            else ["Simulated first-aid qualification"] if "first_aid" in skills else []
        ),
        available=True, status="available",
    ) for id_, name, role, zone, skills in rows]

