import { useState } from 'react'
import { Link } from 'react-router-dom'
import { resolvedIsHidden, usePolling, useResources } from '../api/client'
import { EmptyState, ErrorNotice, Icon, StatusBadge, time, typeLabels, UrgencyBadge } from '../components/ui'
import type { Incident } from '../types'
import { ManagerUpdatesPanel } from '../components/ManagerUpdates'

export default function Safety() {
  const { data, error, loading } = usePolling<Incident[]>('/api/incidents')
  const resources = useResources()
  const [filter, setFilter] = useState('pending')
  const [search, setSearch] = useState('')
  const incidents = (data ?? []).filter(item => !resolvedIsHidden(item))
  const pending = incidents.filter(item => ['reported', 'awaiting_clarification', 'awaiting_approval'].includes(item.status))
  const active = incidents.filter(item => ['response_dispatched', 'in_progress'].includes(item.status))
  const available = resources.data?.filter(resource => resource.available).length
  const visible = incidents.filter(item => {
    const matchesFilter = filter === 'pending' ? pending.includes(item)
      : filter === 'active' ? active.includes(item)
        : item.status === 'resolved'
    const searchableText = [
      item.id, item.summary, item.location, item.type, item.reported_by,
      ...item.observations, ...item.recommendation.actions,
    ].join(' ').toLocaleLowerCase()
    return matchesFilter && searchableText.includes(search.trim().toLocaleLowerCase())
  })
  return <div className="page">
    <div className="page-heading"><div><div className="eyebrow">SAFETY LEAD</div><h1>Operations overview<span className="heading-dot">.</span></h1></div></div>
    <ErrorNotice message={error || resources.error} />
    <div className="stats-grid"><div className="stat-card"><span className="stat-label">Pending<Icon name="clock" /></span><div className="stat-value">{data ? pending.length.toString().padStart(2, '0') : '—'}<span>awaiting manager response</span></div></div><div className="stat-card"><span className="stat-label">Active<Icon name="pulse" /></span><div className="stat-value">{data ? active.length.toString().padStart(2, '0') : '—'}<span>response dispatched</span></div></div><Link to="/safety/resources" className="stat-card resource-stat"><span className="stat-label">Available resources<Icon name="people" /></span><div className="stat-value">{available?.toString().padStart(2, '0') ?? '—'}<span>of {resources.data?.length ?? '—'} on the roster<Icon name="arrow" size={16} /></span></div></Link></div>
    <div className="overview-grid"><section className="incident-feed"><div className="section-heading"><h2>Incident board <span className="count-bubble">{active.length + pending.length}</span></h2><span className="live-label"><span className="dot" />Updates every 5s</span></div><div className="feed-tools"><div className="tabs" role="group" aria-label="Filter incidents">{[['pending', 'Pending'], ['active', 'Active'], ['resolved', 'Resolved']].map(([value, label]) => <button key={value} className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div><input aria-label="Search incidents" type="search" className="search-input" placeholder="Search ID, report, location…" value={search} onChange={event => setSearch(event.target.value)} /></div>
      {loading ? <div className="panel loading-state" role="status">Loading incidents…</div> : visible.length ? <div className="incident-cards">{visible.map(incident => <Link to={`/safety/incidents/${incident.id}`} className={`incident-card border-${incident.urgency}`} key={incident.id}><div className="incident-card-top"><div className="badge-row"><UrgencyBadge urgency={incident.urgency} priorityScore={incident.priority_score} /><span className="incident-type">{typeLabels[incident.type]}</span></div><span className="incident-time">{time(incident.created_at)}</span></div><h3>{incident.summary}</h3><div className="location-line"><Icon name="pin" size={16} />{incident.location}</div><div className="incident-card-bottom"><StatusBadge status={incident.status} /><span className="mono incident-id">{incident.id}</span><Icon name="arrow" size={19} /></div></Link>)}</div> : <div className="panel"><EmptyState title={search ? 'No matching incidents' : filter === 'resolved' ? 'No resolved incidents yet' : filter === 'active' ? 'No active responses' : 'No pending incidents'}><p>{search ? 'Try another location, ID, or keyword.' : filter === 'pending' ? 'Reports awaiting a manager response will appear here.' : filter === 'active' ? 'Incidents with a dispatched or in-progress response will appear here.' : 'Resolved incidents will appear here.'}</p></EmptyState></div>}
    </section><aside className="overview-aside"><ManagerUpdatesPanel /><section className="panel zone-panel"><div className="section-heading"><h3>Zone coverage</h3><span className="small-label">AVAILABLE</span></div>{['Lawn Stage', 'River Stage', 'Food Village', 'North Gate', 'South Gate', 'Medical Tent'].map(zone => { const count = resources.data?.filter(resource => resource.zone === zone && resource.available).length; return <div className="zone-row" key={zone}><span><span className={`dot ${count === 0 ? 'dot-amber' : 'dot-green'}`} />{zone}</span><strong>{count ?? '—'}</strong></div> })}<Link to="/safety/resources" className="text-link">View team & resources<Icon name="arrow" size={16} /></Link></section><p className="aside-footnote"><Icon name="spark" size={16} />Suggested responses use deterministic demo rules.</p></aside></div>
  </div>
}

