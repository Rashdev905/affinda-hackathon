import { useState } from 'react'
import { api, apiBase, hiddenResolvedKey, saveApiBase } from '../api/client'
import { ErrorNotice, Icon } from '../components/ui'

export default function Settings() {
  const [server, setServer] = useState(apiBase())
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  async function saveConnection(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setError(''); setMessage('')
    const target = server.trim().replace(/\/$/, '')
    try {
      const response = await fetch(`${target}/health`)
      const health = await response.json()
      if (!response.ok || health.status !== 'ok' || health.service !== 'pulse') throw new Error('That address did not return a healthy Pulse backend.')
      saveApiBase(target)
      window.location.reload()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not reach the Pulse backend.') }
    finally { setBusy(false) }
  }
  async function enableNotifications() {
    setError(''); setMessage('')
    if (!('Notification' in window)) { setError('This browser does not support desktop notifications. Updates will still appear in the dashboard.'); return }
    const permission = await Notification.requestPermission()
    setMessage(permission === 'granted' ? 'Manager notifications are enabled while this dashboard is open.' : 'Notification permission was not granted. Updates will still appear in the dashboard.')
  }
  function hideResolved() {
    localStorage.setItem(hiddenResolvedKey, new Date().toISOString())
    window.location.href = '/safety'
  }
  function showResolved() {
    localStorage.removeItem(hiddenResolvedKey)
    window.location.href = '/safety'
  }
  async function deleteAll() {
    if (!window.confirm('Delete every incident from the database and release assigned resources? This cannot be undone.')) return
    setDeleting(true); setError(''); setMessage('')
    try {
      const result = await api.clearAllIncidents()
      setMessage(`${result.deleted_count} incident${result.deleted_count === 1 ? '' : 's'} deleted. Assigned resources are available again.`)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not delete incidents.') }
    finally { setDeleting(false) }
  }
  return <div className="page settings-page">
    <div className="page-heading"><div><div className="eyebrow">SAFETY LEAD</div><h1>Settings<span className="heading-dot">.</span></h1></div></div>
    <ErrorNotice message={error} />{message && <div role="status" className="notice notice-success"><Icon name="check" /><span>{message}</span></div>}
    <section className="panel settings-card"><div className="settings-heading"><Icon name="pulse" size={20} /><div><h2>Python server</h2><p>Connect this dashboard to the Pulse backend.</p></div></div>
      <form onSubmit={saveConnection}><label htmlFor="dashboard-server">Server address</label><input id="dashboard-server" type="url" value={server} onChange={event => setServer(event.target.value)} placeholder="http://127.0.0.1:8000" /><div className="button-row"><button className="button primary" disabled={busy}>{busy ? 'Checking…' : 'Test and save connection'}</button><button type="button" className="button secondary" onClick={() => setServer('')}>Use website proxy</button></div></form>
      <p className="field-hint">For a phone or another computer, use the server computer’s LAN address and allow the connection through its private-network firewall.</p>
    </section>
    <section className="panel settings-card"><div className="settings-heading"><Icon name="pulse" size={20} /><div><h2>Manager notifications</h2><p>Show volunteer reports and updates in this dashboard. Optional browser notifications appear while it is open.</p></div></div>
      <div className="settings-actions"><span className="field-hint">In-dashboard updates poll every three seconds.</span><button className="button secondary" onClick={() => void enableNotifications()}>Enable browser notifications</button></div>
    </section>
    <section className="panel settings-card"><div className="settings-heading"><Icon name="file" size={20} /><div><h2>Incident data</h2><p>Manage what appears in the dashboard and database.</p></div></div>
      <div className="settings-actions"><div><strong>Hide resolved incidents</strong><p className="field-hint">Remove currently resolved incidents from this dashboard view on this browser.</p></div><div className="button-row"><button className="button secondary" onClick={hideResolved}>Hide resolved from dashboard</button><button className="button secondary" onClick={showResolved}>Show all resolved again</button></div></div>
      <div className="settings-actions destructive-setting"><div><strong>Delete all incidents</strong><p className="field-hint">Permanently delete active and resolved incidents and release assigned resources.</p></div><button className="button danger" disabled={deleting} onClick={() => void deleteAll()}>{deleting ? 'Deleting…' : 'Delete all incidents'}</button></div>
    </section>
    <p className="field-hint">This dashboard presents the manager workspace only. The demo backend does not provide user authentication.</p>
  </div>
}
