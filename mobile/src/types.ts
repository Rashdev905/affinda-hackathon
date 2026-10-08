export type IncidentStatus = 'reported' | 'awaiting_clarification' | 'awaiting_approval' | 'response_dispatched' | 'in_progress' | 'resolved'
export type IncidentType = 'medical' | 'lost_person' | 'security' | 'hazard' | 'general'
export type Urgency = 'low' | 'medium' | 'high' | 'critical'

export interface Resource {
  id: string
  name: string
  role: string
  zone: string
  skills: string[]
  qualifications: string[]
  available: boolean
  current_assignment: string | null
  status: 'available' | 'assigned' | 'on_break'
}

export interface Recommendation {
  recommended_responders: string[]
  medical_assistance_needed?: boolean
  responders_needed?: number
  responder_needs?: { required_skill: string; responsibility: string }[]
  assignments?: { resource_id: string; resource_name?: string | null; resource_role?: string | null; resource_zone?: string | null; required_skill: string; responsibility: string }[]
  alternatives: string[]
  actions: string[]
  reasoning: string[]
  conflicts: string[]
  manager_edited?: boolean
  requires_human_approval: true
}

export interface TimelineEvent {
  id: string
  timestamp: string
  kind: string
  actor: string
  message: string
}

export interface Incident {
  id: string
  type: IncidentType
  location: string
  summary: string
  observations: string[]
  urgency: Urgency
  priority_score?: number
  missing_information: string[]
  follow_up_question: string | null
  status: IncidentStatus
  reported_by: string
  created_at: string
  updated_at: string
  recommendation: Recommendation
  timeline: TimelineEvent[]
  last_decision: 'approve' | 'modify' | 'reject' | null
  assigned_responders: string[]
  resolution_note: string | null
  draft_report: string | null
  parser_mode: 'mock' | 'gemini' | 'openai'
}

export interface Decision {
  decision: 'approve' | 'reject'
  responder_ids?: string[]
  actions?: string[]
  note?: string
}

export interface VolunteerAlert {
  id: string
  incident_id: string
  volunteer_id: string
  source: 'automatic' | 'manager'
  urgency: Urgency
  location: string
  message: string
  instructions: string[]
  created_at: string
  acknowledged_at: string | null
  active: boolean
}

export interface AlertDraft {
  volunteer_id: string
  volunteer_name: string
  role: string
  task: string
  message: string
}
