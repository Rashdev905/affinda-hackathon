import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePolling, useResources } from '../api/client'
import { EmptyState, ErrorNotice, Icon, StatusBadge, time, typeLabels, UrgencyBadge } from '../components/ui'
import type { Incident } from '../types'

export default function Safety() {
  const { data, error, loading } = usePolling<Incident[]>('/api/incidents')
  const resources = useResources()
  const [filter, setFilter] = useState('active')
  const [search, setSearch] = useState('')
  const incidents = data ?? []
  const active = incidents.filter(item => item.status !== 'resolved')
  const attention = active.filter(item => ['reported', 'awaiting_approval', 'awaiting_clarification'].includes(item.status))
  const available = resources.data?.filter(resource => resource.available).length
  const visible = incidents.filter(item => {
    const matchesFilter = filter === 'all' || (filter === 'resolved' ? item.status === 'resolved' : filter === 'attention' ? attention.includes(item) : item.status !== 'resolved')
    return matchesFilter && `${item.summary} ${item.location} ${item.id}`.toLowerCase().includes(search.toLowerCase())
  })
  return <div className="page">
    <div className="page-heading"><div><div className="eyebrow">YOUR FESTIVAL, IN FOCUS</div><h1>Operations overview<span className="heading-dot">.</span></h1><p>A shared picture. A clear next step.</p></div><Link to="/volunteer" className="button primary"><Icon name="plus" size={18} />Report incident</Link></div>
    <ErrorNotice message={error || resources.error} />
    <div className="stats-grid"><div className="stat-card"><span className="stat-label">Active incidents<Icon name="pulse" /></span><div className="stat-value">{data ? active.length.toString().padStart(2, '0') : '—'}<span>across the festival</span></div></div><div className="stat-card"><span className="stat-label">Awaiting review<Icon name="clock" /></span><div className="stat-value">{data ? attention.length.toString().padStart(2, '0') : '—'}<span>need your attention</span></div></div><Link to="/safety/resources" className="stat-card resource-stat"><span className="stat-label">Available resources<Icon name="people" /></span><div className="stat-value">{available?.toString().padStart(2, '0') ?? '—'}<span>of {resources.data?.length ?? '—'} on the roster<Icon name="arrow" size={16} /></span></div></Link></div>
    <div className="overview-grid"><section className="incident-feed"><div className="section-heading"><h2>Incident board <span className="count-bubble">{active.length}</span></h2><span className="live-label"><span className="dot" />Updates every 5s</span></div><div className="feed-tools"><div className="tabs" role="group" aria-label="Filter incidents">{[['active', 'Active'], ['attention', 'Needs review'], ['resolved', 'Resolved'], ['all', 'All']].map(([value, label]) => <button key={value} className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div><input aria-label="Search incidents" type="search" className="search-input" placeholder="Search incidents…" value={search} onChange={event => setSearch(event.target.value)} /></div>
      {loading ? <div className="panel loading-state" role="status">Loading incidents…</div> : visible.length ? <div className="incident-cards">{visible.map(incident => <Link to={`/safety/incidents/${incident.id}`} className={`incident-card border-${incident.urgency}`} key={incident.id}><div className="incident-card-top"><div className="badge-row"><UrgencyBadge urgency={incident.urgency} /><span className="incident-type">{typeLabels[incident.type]}</span></div><span className="incident-time">{time(incident.created_at)}</span></div><h3>{incident.summary}</h3><div className="location-line"><Icon name="pin" size={16} />{incident.location}</div><div className="incident-card-bottom"><StatusBadge status={incident.status} /><span className="mono incident-id">{incident.id}</span><Icon name="arrow" size={19} /></div></Link>)}</div> : <div className="panel"><EmptyState title={search ? 'No matching incidents' : filter === 'resolved' ? 'No resolved incidents yet' : 'A clear view starts here'}><p>{search ? 'Try another location, ID, or keyword.' : 'Reports from volunteers will appear here, ready for your review.'}</p>{!search && <Link className="button secondary" to="/volunteer">Create a demo report<Icon name="arrow" size={16} /></Link>}</EmptyState></div>}
    </section><aside className="overview-aside"><div className="green-panel compact"><Icon name="shield" size={28} /><h2>Supported by Pulse.<br />Led by you.</h2><p>Review each suggested response, check coverage, and decide what happens next.</p><div className="green-panel-footer"><span className="dot" />Human approval at every step</div></div><section className="panel zone-panel"><div className="section-heading"><h3>Zone coverage</h3><span className="small-label">AVAILABLE</span></div>{['Lawn Stage', 'River Stage', 'Food Village', 'North Gate', 'South Gate', 'Medical Tent'].map(zone => { const count = resources.data?.filter(resource => resource.zone === zone && resource.available).length; return <div className="zone-row" key={zone}><span><span className={`dot ${count === 0 ? 'dot-amber' : 'dot-green'}`} />{zone}</span><strong>{count ?? '—'}</strong></div> })}<Link to="/safety/resources" className="text-link">View team & resources<Icon name="arrow" size={16} /></Link></section><p className="aside-footnote"><Icon name="spark" size={16} />Suggested responses use deterministic demo rules.</p></aside></div>
  </div>
}

