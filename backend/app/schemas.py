from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

IncidentType = Literal["medical", "lost_person", "security", "hazard", "general"]
Urgency = Literal["low", "medium", "high", "critical"]
IncidentStatus = Literal[
    "reported", "awaiting_clarification", "awaiting_approval",
    "response_dispatched", "in_progress", "resolved",
]


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ReportInput(InputModel):
    text: str = Field(min_length=3, max_length=5000)
    reported_by: str = Field(default="VOL-014", min_length=1, max_length=80)


class UpdateInput(ReportInput):
    text: str = Field(min_length=1, max_length=5000)


class DecisionInput(InputModel):
    decision: Literal["approve", "modify", "reject"]
    responder_ids: list[str] | None = Field(default=None, max_length=20)
    actions: list[str] | None = Field(default=None, max_length=10)
    note: str = Field(default="", max_length=2000)
    decided_by: str = Field(default="Safety lead", min_length=1, max_length=80)

    @field_validator("actions")
    @classmethod
    def validate_actions(cls, actions: list[str] | None) -> list[str] | None:
        if actions is None:
            return None
        if not actions or any(not action.strip() or len(action) > 500 for action in actions):
            raise ValueError("Provide between 1 and 10 non-empty actions, each under 500 characters.")
        return [action.strip() for action in actions]


class ResolveInput(InputModel):
    note: str = Field(default="", max_length=2000)
    resolved_by: str = Field(default="Safety lead", min_length=1, max_length=80)


class AlertInput(InputModel):
    message: str = Field(min_length=3, max_length=500)
    alerted_by: str = Field(default="Safety lead", min_length=1, max_length=80)


class ParsedReport(BaseModel):
    type: IncidentType
    location: str
    summary: str
    observations: list[str]
    urgency: Urgency
    missing_information: list[str]
    follow_up_question: str | None = None


class Resource(BaseModel):
    id: str
    name: str
    role: str
    zone: str
    skills: list[str]
    qualifications: list[str]
    available: bool
    current_assignment: str | None = None
    status: Literal["available", "assigned", "on_break"]


class Recommendation(BaseModel):
    recommended_responders: list[str]
    alternatives: list[str] = Field(default_factory=list)
    actions: list[str]
    reasoning: list[str]
    conflicts: list[str]
    requires_human_approval: Literal[True] = True


class TimelineEvent(BaseModel):
    id: str
    timestamp: str
    kind: str
    actor: str
    message: str


class Incident(ParsedReport):
    id: str
    status: IncidentStatus
    reported_by: str
    created_at: str
    updated_at: str
    recommendation: Recommendation
    timeline: list[TimelineEvent]
    last_decision: Literal["approve", "modify", "reject"] | None = None
    assigned_responders: list[str] = Field(default_factory=list)
    resolution_note: str | None = None
    draft_report: str | None = None
    parser_mode: Literal["mock"] = "mock"
