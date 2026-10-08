import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, errorMessage, usePolling } from '../api/client'
import { ErrorNotice, Icon, StatusBadge, UrgencyBadge } from '../components/ui'
import type { Incident } from '../types'

const examples = [
  { label: 'Medical incident', text: "Someone collapsed beside the west entrance to the Lawn Stage toilets. They're awake, breathing normally, very dizzy, and a crowd is forming." },
  { label: 'Lost child', text: 'A lost child is at North Gate, separated from their parent. I am staying with them at the information point.' },
  { label: 'Site hazard', text: 'There is a broken cable cover at Food Village, beside the water station. People are tripping over it.' },
]

export default function Volunteer() {
  const [text, setText] = useState('')
  const [incident, setIncident] = useState<Incident | null>(null)
  const [update, setUpdate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const reports = usePolling<Incident[]>('/api/incidents')
  const current = reports.data?.find(item => item.id === incident?.id)
  const shown = current && incident && current.updated_at > incident.updated_at ? current : incident

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('')
    try {
      const result = await api.report(text)
      setIncident(result); setText(''); setSuccess('Your report is with the safety lead.'); void reports.refresh()
    } catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }
  async function submitUpdate(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!shown) return
    setBusy(true); setError(''); setSuccess('')
    try {
      setIncident(await api.update(shown.id, update)); setUpdate(''); setSuccess('Update sent to the safety lead.'); void reports.refresh()
    } catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }
  return <div className="page volunteer-page">
    <div className="page-heading"><div><div className="eyebrow">ON THE GROUND. IN THE LOOP.</div><h1>Report incident<span className="heading-dot">.</span></h1><p>Tell us what’s happening. We’ll help make it clear.</p></div><span className="tag"><Icon name="people" size={16} />Volunteer 14</span></div>
    <div className="volunteer-grid"><div>
      <ErrorNotice message={error || reports.error} />
      {success && <div className="notice notice-success" role="status"><Icon name="check" /><span>{success}</span></div>}
      {!shown ? <section className="panel report-panel"><div className="section-kicker"><span className="step-number">01</span> START WITH WHAT YOU KNOW</div><form onSubmit={submit}>
        <label className="input-title" htmlFor="report-text">What’s happening?</label><p className="field-hint">In this first report, include what happened, the exact festival zone and nearest landmark, who is affected, their condition, and any immediate hazards. Include only what you know.</p>
        <textarea id="report-text" value={text} onChange={event => setText(event.target.value)} minLength={3} maxLength={5000} required rows={7} placeholder="Someone collapsed beside the west entrance to the Lawn Stage toilets. They are awake and breathing normally…" />
        <div className="input-footer"><span><Icon name="pin" size={15} />A nearby landmark helps</span><span>{text.length.toLocaleString()} / 5,000</span></div>
        <div className="example-section"><span className="small-label">TRY A DEMO REPORT</span><div className="example-buttons">{examples.map(example => <button key={example.label} type="button" className="chip" onClick={() => setText(example.text)}>{example.label}<Icon name="plus" size={14} /></button>)}</div></div>
        <button className="button primary full-width" disabled={busy || text.trim().length < 3}>{busy ? 'Sending report…' : 'Submit Incident'}<Icon name="arrow" /></button>
        <p className="form-footnote"><Icon name="shield" size={15} />Every response is reviewed by a person.</p>
      </form></section> : <section className="panel report-panel received-report">
        <div className="section-kicker"><span className="step-number"><Icon name="check" size={15} /></span> REPORT RECEIVED</div>
        <div className="badge-row"><UrgencyBadge urgency={shown.urgency} priorityScore={shown.priority_score} /><StatusBadge status={shown.status} /></div>
        <h2 className="report-summary">{shown.summary}</h2><p className="location-line"><Icon name="pin" size={17} />{shown.location}</p>
        <ul className="observation-list">{shown.observations.map((observation, index) => <li key={index}>{observation}</li>)}</ul>
        {shown.status !== 'resolved' ? <form className="clarification" onSubmit={submitUpdate}><label htmlFor="volunteer-update">Anything new or changed since the initial report?</label><p className="field-hint">Use updates for new information or corrections. Include the location and details known at first report time.</p><textarea id="volunteer-update" rows={3} value={update} onChange={event => setUpdate(event.target.value)} required minLength={1} maxLength={5000} placeholder="Share only what has changed..." /><button className="button primary" disabled={busy || update.trim().length < 1}>{busy ? 'Sending…' : 'Send update'}<Icon name="arrow" size={17} /></button></form> : <div className="notice notice-success"><Icon name="check" />This incident has been resolved by the safety lead.</div>}
        <div className="button-row report-links"><button className="button secondary" disabled={busy} onClick={() => { setIncident(null); setSuccess(''); setError(''); setUpdate('') }}><Icon name="plus" size={17} />New report</button><Link className="text-link" to={`/safety/incidents/${shown.id}`}>View incident<Icon name="arrow" size={16} /></Link></div>
      </section>}
      {!shown && !!reports.data?.filter(item => item.status !== 'resolved').length && <section className="panel previous-reports"><label htmlFor="existing-incident">Updating an existing incident?</label><select id="existing-incident" value="" onChange={event => { setIncident(reports.data?.find(item => item.id === event.target.value) ?? null); setSuccess(''); setError(''); setUpdate('') }}><option value="">Choose an active incident</option>{reports.data.filter(item => item.status !== 'resolved').map(item => <option key={item.id} value={item.id}>{item.id} · {item.summary}</option>)}</select></section>}
    </div><aside className="report-aside"><div className="green-panel"><span className="circle-icon"><Icon name="pulse" size={32} /></span><h2>A clear report.<br />A coordinated response.</h2><p>You don’t need the perfect words. Start with what you see.</p><div className="process-step"><span>1</span><div><strong>You share what’s happening</strong><p>A few words from the scene.</p></div></div><div className="process-step"><span>2</span><div><strong>Pulse brings it together</strong><p>A summary and a short follow-up.</p></div></div><div className="process-step"><span>3</span><div><strong>Your safety lead takes it from here</strong><p>A person reviews the response.</p></div></div></div><div className="quiet-note"><Icon name="spark" /><p><strong>Made for the first few moments.</strong><br />This demo uses a mock parser and simulated resources. No real teams are contacted.</p></div></aside></div>
  </div>
}

