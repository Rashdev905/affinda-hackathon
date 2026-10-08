import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, errorMessage, usePolling, useResources } from '../api/client'
import { dateTime, ErrorNotice, Icon, StatusBadge, typeLabels, UrgencyBadge } from '../components/ui'
import type { Incident, Resource } from '../types'

type Action = 'modify' | 'reject' | 'resolve'

function DecisionForm({ action, incident, resources, busy, onCancel, onSubmit }: {
  action: Action; incident: Incident; resources: Resource[]; busy: boolean;
  onCancel: () => void; onSubmit: (note: string, ids: string[], actions: string[]) => void;
}) {
  const [note, setNote] = useState('')
  const [ids, setIds] = useState(incident.recommendation.recommended_responders)
  const [actions, setActions] = useState(incident.recommendation.actions.join('\n'))
  const [responderSearch, setResponderSearch] = useState('')
  const available = resources.filter(resource => resource.available || resource.current_assignment === incident.id)
  const filteredResponders = available.filter(resource => `${resource.name} ${resource.id}`.toLowerCase().includes(responderSearch.trim().toLowerCase()))
  const coverageWarnings = [...new Set(resources.filter(resource => ids.includes(resource.id)).map(resource => resource.zone))]
    .filter(zone => !resources.some(resource => resource.zone === zone && resource.available && !resource.current_assignment && !ids.includes(resource.id)))
  function changeResponder(id: string, checked: boolean) {
    const next = checked ? [...ids, id] : ids.filter(item => item !== id)
    setIds(next)
    setActions(resources.filter(resource => next.includes(resource.id)).map(resource => `Assign ${resource.name} to attend ${incident.location}.`).concat('Confirm the location and response with the reporting volunteer.').join('\n'))
  }
  return <form className="decision-form" onSubmit={event => { event.preventDefault(); onSubmit(note, ids, actions.split('\n').map(line => line.trim()).filter(Boolean)) }}>
    <div className="section-heading"><h3>{action === 'modify' ? 'Modify suggested response' : action === 'reject' ? 'Reject suggested response' : 'Resolve incident'}</h3><button aria-label="Close decision form" type="button" className="icon-button" onClick={onCancel} disabled={busy}><Icon name="close" size={18} /></button></div>
    {action === 'modify' && <><fieldset><legend>Choose responders</legend><label className="responder-search-label" htmlFor="responder-search">Search by volunteer name or ID</label><input id="responder-search" className="responder-search" type="search" value={responderSearch} onChange={event => setResponderSearch(event.target.value)} placeholder="Name or volunteer ID" />{filteredResponders.length ? filteredResponders.map(resource => <label className="responder-option" key={resource.id}><input type="checkbox" checked={ids.includes(resource.id)} onChange={event => changeResponder(resource.id, event.target.checked)} /><span><strong>{resource.name}</strong><small>{resource.id} · {resource.zone} · {resource.skills.map(skill => skill.replaceAll('_', ' ')).join(', ')}</small></span></label>) : <p className="responder-search-empty">No available volunteers match that search.</p>}</fieldset>{coverageWarnings.map(zone => <div className="notice notice-warning" key={zone}><Icon name="alert" size={16} /><span>This selection leaves no available resources at {zone}.</span></div>)}<label htmlFor="edited-actions">Response actions (one per line)</label><textarea id="edited-actions" rows={4} value={actions} onChange={event => setActions(event.target.value)} required maxLength={5000} /></>}
    {action !== 'modify' && <><label htmlFor="decision-note">{action === 'resolve' ? 'Resolution note' : 'Reason for this decision'}</label><textarea id="decision-note" rows={3} value={note} onChange={event => setNote(event.target.value)} required maxLength={2000} placeholder={action === 'resolve' ? 'What was the outcome?' : 'Add context for the team…'} /></>}
    {action === 'modify' && <p className="field-hint">Confirming approves this edited response and assigns the selected resources. Review their skills, zones, and coverage first.</p>}
    <div className="button-row"><button className={`button ${action === 'reject' ? 'danger' : 'primary'}`} disabled={busy || (action !== 'modify' && !note.trim()) || (action === 'modify' && (!ids.length || !actions.trim()))}>{busy ? 'Saving…' : action === 'modify' ? 'Save modified response' : action === 'reject' ? 'Confirm rejection' : 'Confirm resolution'}</button><button type="button" className="button secondary" disabled={busy} onClick={onCancel}>Cancel</button></div>
  </form>
}

export default function IncidentDetail() {
  const { id } = useParams()
  const { data: incident, error: loadError, loading, refresh } = usePolling<Incident>(`/api/incidents/${id}`)
  const resources = useResources()
  const [action, setAction] = useState<Action | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [update, setUpdate] = useState('')
  const [alertDrafts, setAlertDrafts] = useState<{ volunteer_id: string; volunteer_name: string; role: string; task: string; message: string }[]>([])
  const [draftMode, setDraftMode] = useState<'gemini' | 'mock' | null>(null)
  const [draftLoading, setDraftLoading] = useState(false)
  const [draftError, setDraftError] = useState('')
  const assignedVolunteerIds = incident?.assigned_responders.filter(value => value.startsWith('VOL-')) ?? []
  const responseApproved = !!incident && ['response_dispatched', 'in_progress'].includes(incident.status)
  const draftKey = incident ? [incident.id, incident.summary, incident.location, ...assignedVolunteerIds,
    ...(incident.recommendation.assignments ?? []).map(item => `${item.resource_id}:${item.responsibility}`)].join('|') : ''
  useEffect(() => {
    if (!incident || !responseApproved || !assignedVolunteerIds.length) return
    let active = true
    const assignments = incident.recommendation.assignments ?? []
    const fallback = assignedVolunteerIds.map(volunteerId => {
      const assignment = assignments.find(item => item.resource_id === volunteerId)
      const task = assignment?.responsibility ?? 'Attend the incident and assist as directed by the manager.'
      const volunteerName = assignment?.resource_name ?? volunteerId
      return { volunteer_id: volunteerId, volunteer_name: volunteerName,
        role: assignment?.resource_role ?? 'Volunteer', task,
        message: `${incident.summary} Location: ${incident.location}. Your task: ${task}` }
    })
    setAlertDrafts(fallback); setDraftMode(null); setDraftError(''); setDraftLoading(true)
    void api.alertDrafts(incident.id).then(result => {
      if (active) { setAlertDrafts(result.drafts); setDraftMode(result.mode) }
    }).catch(err => { if (active) setDraftError(errorMessage(err)) })
      .finally(() => { if (active) setDraftLoading(false) })
    return () => { active = false }
  }, [draftKey, responseApproved])
  async function perform(work: () => Promise<unknown>, success: string) {
    setBusy(true); setError(''); setMessage('')
    try { await work(); setAction(null); setMessage(success); await Promise.all([refresh(), resources.refresh()]) }
    catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }
  if (loading) return <div className="page loading-state" role="status">Loading incident…</div>
  if (!incident) return <div className="page"><Link to="/safety" className="text-link"><Icon name="back" size={16} />Back to overview</Link><ErrorNotice message={loadError || 'Incident not found.'} /></div>
  const canDecide = ['reported', 'awaiting_clarification', 'awaiting_approval'].includes(incident.status)
  const isResolved = incident.status === 'resolved'
  const recommendation = incident.recommendation
  function downloadReport() {
    const url = URL.createObjectURL(new Blob([incident!.draft_report ?? ''], { type: 'text/plain;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${incident!.id}-draft-report.txt`; anchor.click(); URL.revokeObjectURL(url)
  }
  return <div className="page detail-page"><Link to="/safety" className="text-link back-link"><Icon name="back" size={17} />Back to overview</Link><div className="page-heading detail-heading"><div><div className="eyebrow">{incident.id} <span> / </span> {typeLabels[incident.type]}</div><h1>{incident.summary}</h1><p className="location-line"><Icon name="pin" size={18} />{incident.location}<span className="detail-date">Reported {dateTime(incident.created_at)}</span></p></div><div className="badge-row"><UrgencyBadge urgency={incident.urgency} priorityScore={incident.priority_score} /><StatusBadge status={incident.status} /></div></div><ErrorNotice message={error || loadError || resources.error} />{message && <div role="status" className="notice notice-success"><Icon name="check" />{message}</div>}
    <div className="detail-grid"><div className="detail-main"><section className="panel detail-section"><div className="section-heading"><h2><Icon name="file" />Incident brief</h2><span className="tag">Mock interpretation</span></div><ul className="observation-list">{incident.observations.map((observation, index) => <li key={index}>{observation}</li>)}</ul><div className="brief-meta"><span>Reported by <strong>{incident.reported_by}</strong></span><span>Last updated <strong>{dateTime(incident.updated_at)}</strong></span></div>{!!incident.missing_information.length && <div className="notice notice-warning"><Icon name="alert" /><div><strong>Information to confirm</strong><p>{incident.follow_up_question}</p><span className="field-hint">{incident.missing_information.map(item => item.replaceAll('_', ' ')).join(' · ')}</span></div></div>}</section>
      {responseApproved && assignedVolunteerIds.length > 0 && <section className="panel detail-section"><h2>Review volunteer alert messages</h2><p className="field-hint">Review and edit each assigned volunteer’s message. No alert is sent until you press the button.</p><ErrorNotice message={draftError} />{draftLoading && <p className="field-hint">Generating individual message suggestions…</p>}{draftMode && <p className="field-hint">{draftMode === 'gemini' ? 'Suggested by Gemini. Edit any message before sending.' : 'Template suggestions shown. Configure Gemini for generated wording.'}</p>}{alertDrafts.map((draft, index) => <div className="alert-draft" key={draft.volunteer_id}><h3>{draft.volunteer_name} · {draft.role}</h3><p className="field-hint">Assigned task: {draft.task}</p><label htmlFor={`alert-${draft.volunteer_id}`}>Alert message for {draft.volunteer_name}</label><textarea id={`alert-${draft.volunteer_id}`} rows={3} maxLength={500} value={draft.message} onChange={event => setAlertDrafts(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, message: event.target.value } : item))} /></div>)}<button className="button primary" disabled={busy || draftLoading || alertDrafts.length !== assignedVolunteerIds.length || alertDrafts.some(item => item.message.trim().length < 3)} onClick={() => void perform(() => api.sendAlerts(incident.id, alertDrafts.map(({ volunteer_id, message }) => ({ volunteer_id, message: message.trim() }))), 'Individual alerts sent to assigned volunteers.')}>Send reviewed alerts<Icon name="arrow" size={16} /></button></section>}
      <section className="panel detail-section"><div className="section-heading"><h2><Icon name="clock" />Incident timeline</h2><span className="small-label">{incident.timeline.length} EVENTS</span></div><ol className="timeline">{incident.timeline.map(entry => <li key={entry.id} className={`event-${entry.kind}`}><span className="timeline-dot" /><div className="timeline-meta"><strong>{entry.actor}</strong><time dateTime={entry.timestamp}>{dateTime(entry.timestamp)}</time></div><p>{entry.message}</p></li>)}</ol></section>
      {!isResolved && <section className="panel detail-section"><h2>Keep the team in the loop</h2><form onSubmit={event => { event.preventDefault(); void perform(async () => { await api.update(incident.id, update, 'Safety lead'); setUpdate('') }, 'Update added to the timeline.') }}><label className="field-hint" htmlFor="lead-update">Add an update or a clarification from the scene.</label><textarea id="lead-update" value={update} onChange={event => setUpdate(event.target.value)} rows={3} minLength={1} maxLength={5000} required placeholder="What has changed?" /><button className="button secondary" disabled={busy || update.trim().length < 1}>Add update<Icon name="arrow" size={16} /></button></form></section>}
      {incident.draft_report && <section className="panel detail-section"><div className="section-heading"><h2><Icon name="file" />Draft incident report</h2><button className="button secondary small" onClick={downloadReport}>Download .txt</button></div><p className="field-hint">Created from the recorded timeline. Review before sharing.</p><pre className="draft-report">{incident.draft_report}</pre></section>}
    </div><aside className="detail-aside"><section className="panel recommendation-panel"><div className="recommendation-heading"><span className="suggestion-icon"><Icon name="spark" size={22} /></span><div><h2>{isResolved ? 'Recorded response' : canDecide ? 'Suggested response' : 'Approved response'}</h2><span>{isResolved ? 'Incident closed by safety lead' : canDecide ? 'Awaiting safety lead approval' : 'Approved by safety lead'}</span></div></div><div className="recommendation-body">{incident.last_decision === 'reject' && <div className="notice notice-warning"><Icon name="alert" /><span>The previous suggestion was rejected. Review or modify before approving.</span></div>}<span className="small-label">{isResolved ? 'RESPONSE RESOURCES' : 'RECOMMENDED RESPONDERS'}</span><div className="recommended-resources">{recommendation.recommended_responders.length ? recommendation.recommended_responders.map(resourceId => { const resource = resources.data?.find(item => item.id === resourceId); const assignment = recommendation.assignments?.find(item => item.resource_id === resourceId); return <div className="recommended-person" key={resourceId}><span className="resource-avatar"><Icon name={resource?.skills.includes('first_aid') ? 'plus' : 'people'} /></span><div><strong>{assignment?.resource_name ?? resource?.name ?? resourceId}</strong><span>{assignment?.resource_role ?? resource?.role ?? 'Responder'} · {assignment?.resource_zone ?? resource?.zone ?? 'Zone to confirm'}</span></div></div> }) : <p>No suitable responders are currently available.</p>}</div><span className="small-label">RESPONSE ACTIONS</span><ol className="action-list">{recommendation.actions.map((item, index) => <li key={index}>{item}</li>)}</ol><div className="reasoning"><h3><Icon name="spark" size={15} />Why this response?</h3>{recommendation.reasoning.map((reason, index) => <p key={index}>{reason}</p>)}</div>{recommendation.conflicts.map((conflict, index) => <div key={index} className="notice notice-warning"><Icon name="alert" size={18} /><span>{conflict}</span></div>)}
      {!!recommendation.alternatives.length && canDecide && <p className="field-hint">Alternatives: {recommendation.alternatives.map(resourceId => resources.data?.find(resource => resource.id === resourceId)?.name ?? resourceId).join(', ')}</p>}
      {canDecide && !action && <div className="approval-controls"><button className="button primary full-width" disabled={busy || !recommendation.recommended_responders.length} onClick={() => void perform(() => api.decide(incident.id, { decision: 'approve', responder_ids: recommendation.recommended_responders }), 'Response approved. Resources assigned in the demo.')}><Icon name="check" size={18} />{busy ? 'Saving…' : 'Approve response'}</button><div className="button-row"><button className="button secondary" disabled={busy} onClick={() => setAction('modify')}><Icon name="edit" size={16} />Modify</button><button className="button secondary reject-button" disabled={busy} onClick={() => setAction('reject')}><Icon name="close" size={16} />Reject</button></div></div>}
      {action && <DecisionForm key={action} action={action} incident={incident} resources={resources.data ?? []} busy={busy} onCancel={() => setAction(null)} onSubmit={(note, ids, actions) => void perform(() => action === 'resolve' ? api.resolve(incident.id, note) : action === 'modify' ? api.modifySuggestion(incident.id, ids, actions, note) : api.decide(incident.id, { decision: 'reject', note }), action === 'resolve' ? 'Incident resolved. Assigned resources are available again.' : action === 'reject' ? 'Suggestion rejected. No new resources were assigned.' : 'Modified response saved for review.')} />}
      <div className="approval-footnote"><Icon name="shield" size={15} /><span>Suggestions support your judgement. Only your approval assigns resources.</span></div></div></section>{!isResolved && !action && <button className="button secondary full-width resolve-button" disabled={busy} onClick={() => setAction('resolve')}><Icon name="check" size={17} />Resolve incident</button>}{isResolved && <div className="notice notice-success"><Icon name="check" /><span>Incident resolved. All assigned resources have been released.</span></div>}</aside></div>
  </div>
}

