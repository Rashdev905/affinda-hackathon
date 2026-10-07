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
  alternatives: string[]
  actions: string[]
  reasoning: string[]
  conflicts: string[]
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
  parser_mode: 'mock'
}

export interface Decision {
  decision: 'approve' | 'modify' | 'reject'
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
