import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon, StatusBadge, time, typeLabels, UrgencyBadge } from './ui'
import type { Incident, IncidentStatus, IncidentType, Urgency } from '../types'

const zones = ['Lawn Stage', 'River Stage', 'Food Village', 'North Gate', 'South Gate', 'Medical Tent']
const statuses: IncidentStatus[] = ['reported', 'awaiting_clarification', 'awaiting_approval', 'response_dispatched', 'in_progress', 'resolved']
const types: IncidentType[] = ['medical', 'lost_person', 'security', 'hazard', 'general']

export function IncidentLog({ incidents, zone: initialZone, compact = false }: { incidents: Incident[]; zone?: string; compact?: boolean }) {
  const [search, setSearch] = useState('')
  const [zone, setZone] = useState(initialZone ?? '')
  const [urgency, setUrgency] = useState<Urgency | ''>('')
  const [status, setStatus] = useState<IncidentStatus | ''>('')
  const [type, setType] = useState<IncidentType | ''>('')
  const [sort, setSort] = useState<'urgency' | 'time'>('urgency')
  const [expanded, setExpanded] = useState<string | null>(null)
  useEffect(() => { setZone(initialZone ?? '') }, [initialZone])
  const visible = useMemo(() => incidents.filter(item => {
    const haystack = `${item.id} ${item.summary} ${item.location}`.toLowerCase()
    return (!search || haystack.includes(search.toLowerCase())) && (!zone || item.location === zone) && (!urgency || item.urgency === urgency) && (!status || item.status === status) && (!type || item.type === type)
  }).sort((a, b) => sort === 'time' ? +new Date(b.created_at) - +new Date(a.created_at) : (['critical', 'high', 'medium', 'low'].indexOf(a.urgency) - ['critical', 'high', 'medium', 'low'].indexOf(b.urgency)) || (+new Date(b.created_at) - +new Date(a.created_at))), [incidents, search, zone, urgency, status, type, sort])
  const activeFilters = [zone, urgency, status, type].filter(Boolean).length
  const clear = () => { setSearch(''); setZone(''); setUrgency(''); setStatus(''); setType('') }
  return <section className={`incident-log panel ${compact ? 'incident-log-compact' : ''}`}>
    <div className="section-heading"><div><span className="eyebrow">LIVE INCIDENT LOG</span><h2>Incident log <span className="count-bubble">{visible.length}</span></h2></div><span className="live-label"><span className="dot" />Refreshes every 5s</span></div>
    <div className="log-controls"><input aria-label="Search incident log" type="search" placeholder="Search ID, summary or location" value={search} onChange={event => setSearch(event.target.value)} />
      <div className="filter-row"><select aria-label="Urgency" value={urgency} onChange={event => setUrgency(event.target.value as Urgency | '')}><option value="">All urgency</option>{(['critical', 'high', 'medium', 'low'] as Urgency[]).map(value => <option key={value} value={value}>{value}</option>)}</select><select aria-label="Category" value={type} onChange={event => setType(event.target.value as IncidentType | '')}><option value="">All categories</option>{types.map(value => <option key={value} value={value}>{typeLabels[value]}</option>)}</select><select aria-label="Workflow status" value={status} onChange={event => setStatus(event.target.value as IncidentStatus | '')}><option value="">All statuses</option>{statuses.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select><select aria-label="Zone" value={zone} onChange={event => setZone(event.target.value)}><option value="">All zones & unconfirmed</option>{zones.map(value => <option key={value}>{value}</option>)}</select><select aria-label="Sort incidents" value={sort} onChange={event => setSort(event.target.value as 'urgency' | 'time')}><option value="urgency">Urgency first</option><option value="time">Newest first</option></select>{(activeFilters || search) ? <button className="clear-button" onClick={clear}>Clear filters ({activeFilters})</button> : null}</div></div>
    {!visible.length ? <div className="empty-state"><Icon name="file" size={28} /><h3>No matching incidents</h3><p>Adjust or clear the current filters.</p></div> : <div className="log-table-wrap"><table><thead><tr><th>Incident</th><th>Reported</th><th>Urgency</th><th>Category</th><th>Location</th><th>Status</th><th aria-label="Expand" /></tr></thead><tbody>{visible.map(item => <>
      <tr className={expanded === item.id ? 'expanded' : ''} key={item.id}><td><Link to={`/safety/incidents/${item.id}`} className="log-summary"><strong>{item.id}</strong><span>{item.summary}</span></Link></td><td className="tabular">{time(item.created_at)}</td><td><UrgencyBadge urgency={item.urgency} /></td><td>{typeLabels[item.type]}</td><td>{item.location || 'Unconfirmed'}</td><td><StatusBadge status={item.status} /></td><td><button className="icon-button" aria-label={`Show details for ${item.id}`} aria-expanded={expanded === item.id} onClick={() => setExpanded(expanded === item.id ? null : item.id)}><Icon name={expanded === item.id ? 'close' : 'arrow'} size={16} /></button></td></tr>
      {expanded === item.id && <tr className="log-expanded" key={`${item.id}-detail`}><td colSpan={7}><div><strong>Original report</strong><p>{item.timeline[0]?.message ?? item.summary}</p><strong>Observations</strong><p>{item.observations.join(' · ') || 'None recorded'}</p><strong>Information still needed</strong><p>{item.follow_up_question ?? 'No follow-up requested.'}</p><strong>Recent activity</strong><p>{item.timeline.at(-1)?.message ?? 'No activity recorded.'}</p><Link className="text-link" to={`/safety/incidents/${item.id}`}>Open full incident <Icon name="arrow" size={15} /></Link></div></td></tr>}
    </>)}</tbody></table></div>}
  </section>
}
