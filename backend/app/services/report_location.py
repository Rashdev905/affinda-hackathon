"""Use the reporter's stored demo zone when a new report omits location."""

from ..schemas import ParsedReport, Resource
from .ai_mock import question_for


def apply_reporter_location(parsed: ParsedReport, resources: list[Resource], reported_by: str, parser_mode: str) -> str | None:
    # A reported location always wins. Do not append the zone to the raw report:
    # the original transcript must remain intact and available for review.
    if parsed.location.strip() and parsed.location != "Location to confirm" and "location" not in parsed.missing_information:
        return None
    reporter = next((item for item in resources if item.id == reported_by), None)
    if reporter is None or not reporter.zone.strip():
        return None
    parsed.location = reporter.zone.strip()
    parsed.missing_information = [item for item in parsed.missing_information if item != "location"]
    if parser_mode == "mock" or parsed.follow_up_question == question_for(["location"]):
        parsed.follow_up_question = question_for(parsed.missing_information)
    elif not parsed.missing_information:
        parsed.follow_up_question = None
    return f"Location set to {parsed.location} from {reporter.name}'s assigned demo zone."
