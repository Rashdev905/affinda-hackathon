import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePolling, useResources } from '../api/client'
import { ErrorNotice, Icon, StatusBadge, typeLabels, UrgencyBadge } from '../components/ui'
import type { Incident, Resource } from '../types'

const zones = [
  { name: 'North Gate', x: 52, y: 9, tint: '#e8e4d7' },
  { name: 'Lawn Stage', x: 4, y: 9, tint: '#d8e5bb' },
  { name: 'Food Village', x: 4, y: 39, tint: '#f3dfb8' },
  { name: 'River Stage', x: 52, y: 39, tint: '#dce9dc' },
  { name: 'South Gate', x: 4, y: 69, tint: '#e8e4d7' },
  { name: 'Medical Tent', x: 52, y: 69, tint: '#f2ded6' },
]
function marker(resource: Resource) {
  if (resource.skills.some(skill => ['first_aid', 'paramedic'].includes(skill))) return { label: resource.id.startsWith('VOL-') ? resource.id.slice(-2) : 'M', color: '#ab473e' }
  if (resource.skills.includes('security')) return { label: resource.id.startsWith('SEC-') ? `S${resource.id.slice(-1)}` : 'S', color: '#536397' }
  if (resource.skills.includes('site_operations')) return { label: 'OP', color: '#956127' }
  return { label: resource.id.startsWith('VOL-') ? resource.id.slice(-2) : '+', color: '#315945' }
}
function resourcePosition(resources: Resource[]) {
  return zones.flatMap(zone => {
    const members = resources.filter(item => item.zone === zone.name).sort((a, b) => a.id.localeCompare(b.id))
    const rows = Math.ceil(members.length / 3)
    return members.map((resource, index) => ({ resource,
      x: zone.x + 8 + (index % 3) * 12,
      y: zone.y + 12 + Math.floor(index / 3) * Math.min(8, 10 / Math.max(1, rows - 1)),
    }))
  })
}
function incidentZone(incident: Incident) { return zones.find(zone => incident.location.toLowerCase().includes(zone.name.toLowerCase()))?.name }

export default function Map() {
  const resources = useResources()
  const incidents = usePolling<Incident[]>('/api/incidents')
  const [zone, setZone] = useState<string | null>(null)
  const [selected, setSelected] = useState<Resource | null>(null)
  const active = (incidents.data ?? []).filter(item => item.status !== 'resolved')
  const visibleResources = (resources.data ?? []).filter(item => !zone || item.zone === zone)
  const visibleIncidents = active.filter(item => !zone || incidentZone(item) === zone)
  const positions = resourcePosition(resources.data ?? [])
  const unmappedResources = (resources.data ?? []).filter(item => !zones.some(itemZone => itemZone.name === item.zone))
  const unmappedIncidents = active.filter(item => !incidentZone(item))
  return <div className="page">
    <div className="page-heading"><div><div className="eyebrow">SAFETY LEAD</div><h1>Festival map<span className="heading-dot">.</span></h1></div><span className="tag">Illustrative positions · no GPS</span></div>
    <ErrorNotice message={resources.error || incidents.error} />
    <div className="festival-map" aria-label="Illustrative festival map">
      <div className="map-river" /><div className="map-road vertical" /><div className="map-road horizontal first" /><div className="map-road horizontal second" />
      <span className="map-caption">RIVERSIDE PARK</span><span className="map-north">↑ N</span><span className="map-walk">FESTIVAL WALK</span>
      {zones.map(item => {
        const count = active.filter(incident => incidentZone(incident) === item.name).length
        return <button key={item.name} className={`map-zone ${zone === item.name ? 'selected' : ''}`} style={{ left: `${item.x}%`, top: `${item.y}%`, backgroundColor: item.tint }} onClick={() => { setZone(item.name); setSelected(null) }}>
          <strong>{item.name}</strong>{!!count && <span className="map-incident-pin">! {count}</span>}
        </button>
      })}
      {positions.map(({ resource, x, y }) => { const item = marker(resource); return <button key={resource.id} aria-label={`${resource.name}, ${resource.id}, ${resource.zone}, ${resource.status}`} title={`${resource.name} · ${resource.id} · ${resource.status.replace('_', ' ')}`} className={`map-resource ${resource.status === 'on_break' ? 'on-break' : ''} ${selected?.id === resource.id ? 'selected' : ''}`} style={{ left: `${x}%`, top: `${y}%`, backgroundColor: item.color }} onClick={() => { setSelected(resource); setZone(resource.zone) }}>{item.label}</button> })}
    </div>
    <div className="map-legend"><span><i className="medical" />Medical</span><span><i className="security" />Security</span><span><i className="operations" />Site ops</span><span><i className="volunteer" />Volunteer</span><span>! Active incident</span></div>
    <p className="field-hint">Positions are illustrative and stay within each responder’s assigned zone. Roster and incidents refresh every 5 seconds.</p>
    {(unmappedResources.length > 0 || unmappedIncidents.length > 0) && <div className="notice notice-warning"><Icon name="alert" size={16} /><span>{unmappedResources.length} responders and {unmappedIncidents.length} incidents have locations outside this layout. Select All zones to include them in the lists.</span></div>}
    <div className="map-zone-tabs"><button className={!zone ? 'active' : ''} onClick={() => { setZone(null); setSelected(null) }}>All zones</button>{zones.map(item => <button className={zone === item.name ? 'active' : ''} key={item.name} onClick={() => { setZone(item.name); setSelected(null) }}>{item.name}</button>)}</div>
    {selected && <section className="panel map-selection"><div><span className="small-label">SELECTED RESPONDER</span><h2>{selected.name}</h2><p>{selected.role} · {selected.zone} · {selected.status.replace('_', ' ')}</p></div>{selected.current_assignment && <Link className="button secondary" to={`/safety/incidents/${selected.current_assignment}`}>View assigned incident<Icon name="arrow" size={15} /></Link>}</section>}
    <div className="map-lists"><section><h2>{zone ?? 'All zones'} · Active incidents <span className="count-bubble">{visibleIncidents.length}</span></h2>{visibleIncidents.map(item => <Link className="map-incident-row" key={item.id} to={`/safety/incidents/${item.id}`}><strong>{item.location}</strong><span>{item.summary}</span><div className="badge-row"><UrgencyBadge urgency={item.urgency} priorityScore={item.priority_score} /><StatusBadge status={item.status} /><span className="incident-type">{typeLabels[item.type]}</span></div></Link>)}{!visibleIncidents.length && <p className="field-hint">No active incidents in this area.</p>}</section>
      <section><h2>Responders in this area <span className="count-bubble">{visibleResources.length}</span></h2>{visibleResources.map(item => <button className="map-person-row" key={item.id} onClick={() => setSelected(item)}><span className="map-person-marker" style={{ backgroundColor: marker(item).color }}>{marker(item).label}</span><span><strong>{item.name} · {item.id}</strong><small>{item.role} · {item.zone} · {item.status.replace('_', ' ')}</small></span><Icon name="arrow" size={15} /></button>)}</section></div>
  </div>
}
