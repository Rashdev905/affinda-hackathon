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
    priority_score: int = Field(default=50, ge=0, le=100)
    missing_information: list[str]
    follow_up_question: str | None = None


ResponseSkill = Literal["first_aid", "paramedic", "safeguarding", "security", "site_operations", "communication"]


class ResponderNeed(BaseModel):
    required_skill: ResponseSkill
    responsibility: str = Field(min_length=3, max_length=300)


class ResponsePlan(BaseModel):
    medical_assistance_needed: bool
    responder_needs: list[ResponderNeed] = Field(max_length=10)
    actions: list[str] = Field(min_length=1, max_length=10)
    reasoning: list[str] = Field(min_length=1, max_length=10)


class LLMAnalysis(BaseModel):
    type: IncidentType
    location: str = Field(min_length=1, max_length=200)
    summary: str = Field(min_length=1, max_length=300)
    observations: list[str] = Field(max_length=20)
    priority_score: int = Field(ge=0, le=100)
    missing_information: list[str] = Field(max_length=10)
    follow_up_question: str
    medical_assistance_needed: bool
    responder_needs: list[ResponderNeed] = Field(max_length=10)
    actions: list[str] = Field(min_length=1, max_length=10)
    reasoning: list[str] = Field(min_length=1, max_length=10)

    def parsed_report(self) -> ParsedReport:
        urgency: Urgency = "high" if self.priority_score >= 70 else "medium" if self.priority_score >= 35 else "low"
        return ParsedReport(
            type=self.type, location=self.location, summary=self.summary, observations=self.observations,
            urgency=urgency, priority_score=self.priority_score,
            missing_information=self.missing_information, follow_up_question=self.follow_up_question or None,
        )

    def response_plan(self) -> ResponsePlan:
        needs = list(self.responder_needs)
        medical_needed = self.medical_assistance_needed or self.type == "medical"
        if medical_needed and not any(need.required_skill in ("first_aid", "paramedic") for need in needs):
            needs.insert(0, ResponderNeed(required_skill="first_aid", responsibility="Provide first aid and assess the person."))
        if self.type != "medical":
            from .models import REQUIRED_SKILLS

            required = REQUIRED_SKILLS[self.type]
            if not any(need.required_skill == required for need in needs):
                needs.insert(0, ResponderNeed(
                    required_skill=required,
                    responsibility=f"Respond to the {self.type.replace('_', ' ')} incident and follow manager direction.",
                ))
        return ResponsePlan(
            medical_assistance_needed=medical_needed,
            responder_needs=needs[:10], actions=self.actions, reasoning=self.reasoning,
        )


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


class ResponderAssignment(BaseModel):
    resource_id: str
    resource_name: str | None = None
    resource_role: str | None = None
    resource_zone: str | None = None
    required_skill: ResponseSkill
    responsibility: str


class Recommendation(BaseModel):
    recommended_responders: list[str]
    medical_assistance_needed: bool = False
    responders_needed: int = Field(default=0, ge=0, le=10)
    responder_needs: list[ResponderNeed] = Field(default_factory=list, max_length=10)
    assignments: list[ResponderAssignment] = Field(default_factory=list, max_length=10)
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
    parser_mode: Literal["mock", "openai"] = "mock"
