import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useResources } from '../api/client'
import { EmptyState, ErrorNotice, Icon } from '../components/ui'

export default function Resources() {
  const { data, error, loading } = useResources()
  const [zone, setZone] = useState('all')
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const visible = data?.filter(resource => (zone === 'all' || resource.zone === zone) && (!onlyAvailable || resource.available)) ?? []
  return <div className="page"><div className="page-heading"><div><div className="eyebrow">SAFETY LEAD</div><h1>Team & resources<span className="heading-dot">.</span></h1></div><span className="tag">{data?.length ?? '—'} simulated resources</span></div><ErrorNotice message={error} /><div className="resource-tools"><label>Festival zone<select value={zone} onChange={event => setZone(event.target.value)}><option value="all">All zones</option>{[...new Set(data?.map(resource => resource.zone))].map(item => <option key={item}>{item}</option>)}</select></label><label className="checkbox-label"><input type="checkbox" checked={onlyAvailable} onChange={event => setOnlyAvailable(event.target.checked)} />Available only</label></div>{loading ? <div className="loading-state">Loading resources…</div> : visible.length ? <div className="resource-grid">{visible.map(resource => <article className="panel resource-card" key={resource.id}><div className="resource-card-top"><span className="resource-avatar"><Icon name={resource.skills.includes('first_aid') ? 'plus' : 'people'} size={23} /></span><span className={`badge ${resource.available ? 'status-resolved' : resource.status === 'on_break' ? 'status-awaiting_approval' : 'status-in_progress'}`}><span className="dot" />{resource.status.replace('_', ' ')}</span></div><h3>{resource.name}</h3><p>{resource.role}</p><div className="location-line"><Icon name="pin" size={16} />{resource.zone}</div><div className="skill-tags">{resource.skills.map(skill => <span key={skill}>{skill.replaceAll('_', ' ')}</span>)}</div><div className="resource-assignment">{resource.current_assignment ? <Link className="text-link" to={`/safety/incidents/${resource.current_assignment}`}>Assigned to {resource.current_assignment}<Icon name="arrow" size={15} /></Link> : <span>{resource.available ? 'Ready for assignment' : 'Currently on break'}</span>}</div></article>)}</div> : <EmptyState title="No resources match"><p>Choose another zone or include unavailable resources.</p></EmptyState>}</div>
}

