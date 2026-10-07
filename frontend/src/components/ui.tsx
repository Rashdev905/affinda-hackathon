import type { ReactNode } from 'react'
import type { IncidentStatus, IncidentType, Urgency } from '../types'

const paths = {
  pulse: 'M2 12h5l3-8 4 16 3-8h5',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  plus: 'M12 5v14 M5 12h14',
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0 M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  arrow: 'M5 12h14 M12 5l7 7-7 7',
  back: 'M19 12H5 M12 5l-7 7 7 7',
  check: 'M5 12l4 4L19 6',
  shield: 'M12 3l8 3v6c0 5-8 10-8 10S4 17 4 12V6z M8 12l3 3 5-6',
  clock: 'M12 8v4l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  alert: 'M12 9v4 M12 17h.01 M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0',
  spark: 'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h5',
  close: 'M6 6l12 12 M6 18L18 6',
  edit: 'M16 3l5 5 M4 20l4-1 13-13-4-4L4 15z',
} as const
export type IconName = keyof typeof paths

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}

export const statusLabels: Record<IncidentStatus, string> = {
  reported: 'Reported', awaiting_clarification: 'Needs clarification', awaiting_approval: 'Awaiting approval',
  response_dispatched: 'Response dispatched', in_progress: 'In progress', resolved: 'Resolved',
}
export const typeLabels: Record<IncidentType, string> = { medical: 'Medical', lost_person: 'Lost person', security: 'Security', hazard: 'Site hazard', general: 'General' }

export function StatusBadge({ status }: { status: IncidentStatus }) {
  return <span className={`badge status-${status}`}><span className="dot" />{statusLabels[status]}</span>
}
export function UrgencyBadge({ urgency, priorityScore }: { urgency: Urgency; priorityScore?: number }) {
  const priority = priorityScore !== undefined
    ? priorityScore >= 70 ? 'high' : priorityScore >= 35 ? 'medium' : 'low'
    : urgency === 'critical' ? 'high' : urgency
  return <span className={`badge urgency-${priority}`}><span className="dot" />{priority} priority</span>
}
export function ErrorNotice({ message }: { message?: string }) {
  return message ? <div className="notice notice-error" role="alert"><Icon name="alert" /><span>{message}</span></div> : null
}
export function EmptyState({ icon = 'shield', title, children }: { icon?: IconName; title: string; children: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name={icon} size={30} /></span><h3>{title}</h3><div>{children}</div></div>
}
export function time(value: string) {
  return new Intl.DateTimeFormat('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Sydney' }).format(new Date(value))
}
export function dateTime(value: string) {
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Sydney' }).format(new Date(value))
}

