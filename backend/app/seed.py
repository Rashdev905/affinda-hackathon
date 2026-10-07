from .schemas import Resource


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
        ("VOL-014", "You · Volunteer 14", "General volunteer", "Lawn Stage", ["communication"]),
        ("SEC-001", "Security · North", "Security staff", "North Gate", ["security", "safeguarding"]),
        ("SEC-002", "Security · South", "Security staff", "South Gate", ["security", "safeguarding"]),
        ("SEC-003", "Security · Stages", "Security staff", "River Stage", ["security", "safeguarding"]),
        ("TEAM-FIRSTAID-A", "First Aid Team A", "First-aid team", "Medical Tent", ["first_aid"]),
        ("TEAM-FIRSTAID-B", "First Aid Team B", "First-aid team", "Medical Tent", ["first_aid"]),
        ("OPS-001", "Site Operations", "Site operations team", "Food Village", ["site_operations", "communication"]),
    ]
    return [Resource(
        id=id_, name=name, role=role, zone=zone, skills=skills,
        qualifications=["Simulated first-aid qualification"] if "first_aid" in skills else [],
        available=id_ != "VOL-010", status="on_break" if id_ == "VOL-010" else "available",
    ) for id_, name, role, zone, skills in rows]

