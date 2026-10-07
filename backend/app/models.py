"""Shared domain constants. SQLite persistence lives in database.py."""

ZONES = [
    "Lawn Stage", "River Stage", "Food Village", "North Gate", "South Gate", "Medical Tent"
]

REQUIRED_SKILLS = {
    "medical": "first_aid",
    "lost_person": "safeguarding",
    "security": "security",
    "hazard": "site_operations",
    "general": "communication",
}

