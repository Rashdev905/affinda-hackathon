import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { apiBase, errorMessage, request, type ManagerUpdate, type ManagerUpdateFeed } from '../api/client'
import { Icon } from './ui'

interface ManagerUpdatesState {
  updates: ManagerUpdate[]
  error: string
  dismiss: (id: number) => void
}

const ManagerUpdatesContext = createContext<ManagerUpdatesState>({ updates: [], error: '', dismiss: () => {} })

function readSavedUpdates(): ManagerUpdate[] {
  try {
    const saved = JSON.parse(localStorage.getItem(`pulse.dashboard.manager-updates:${apiBase()}`) ?? '[]')
    const dismissed = JSON.parse(localStorage.getItem(`pulse.dashboard.manager-update-dismissed:${apiBase()}`) ?? '[]')
    const dismissedIds = new Set<number>(Array.isArray(dismissed) ? dismissed : [])
    return Array.isArray(saved) ? saved.filter(item => !dismissedIds.has(item.id)) : []
  } catch { return [] }
}

export function ManagerUpdatesProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [updates, setUpdates] = useState<ManagerUpdate[]>(readSavedUpdates)
  const [error, setError] = useState('')
  const dismissedRef = useRef(new Set<number>())
  const dismissRef = useRef<(id: number) => void>(() => {})

  function dismiss(id: number) {
    dismissedRef.current.add(id)
    localStorage.setItem(`pulse.dashboard.manager-update-dismissed:${apiBase()}`, JSON.stringify([...dismissedRef.current]))
    setUpdates(current => current.filter(item => item.id !== id))
  }
  dismissRef.current = dismiss

  useEffect(() => {
    let stopped = false
    let inFlight = false
    let cursor: number | null = null
    const base = apiBase()
    const cursorKey = `pulse.dashboard.manager-update-cursor:${base}`
    const dismissedKey = `pulse.dashboard.manager-update-dismissed:${base}`
    try {
      const saved = JSON.parse(localStorage.getItem(dismissedKey) ?? '[]')
      dismissedRef.current = new Set(Array.isArray(saved) ? saved.filter(Number.isSafeInteger) : [])
    } catch { dismissedRef.current = new Set() }

    async function poll() {
      if (stopped || inFlight) return
      inFlight = true
      try {
        if (cursor === null) {
          const savedCursor = localStorage.getItem(cursorKey)
          cursor = savedCursor && Number.isSafeInteger(Number(savedCursor)) ? Number(savedCursor) : null
        }
        const feed = await request<ManagerUpdateFeed>(`/api/manager/updates${cursor === null ? '' : `?after=${cursor}`}`)
        if (stopped) return
        const fresh = feed.updates.filter(item => !dismissedRef.current.has(item.id))
        if (fresh.length) {
          setUpdates(current => [...fresh, ...current.filter(item => !fresh.some(next => next.id === item.id))].slice(0, 30))
          if ('Notification' in window && Notification.permission === 'granted') {
            for (const item of fresh) {
              const notice = new Notification(item.kind === 'report' ? 'New volunteer report' : 'Volunteer report update', {
                body: `${item.volunteer_name} · ${item.location}: ${item.message}`,
                tag: `pulse-update-${item.id}`,
              })
              notice.onclick = () => {
                dismissRef.current(item.id)
                window.focus()
                window.location.href = `/safety/incidents/${item.incident_id}`
              }
            }
          }
        }
        cursor = feed.cursor
        localStorage.setItem(cursorKey, String(cursor))
        setError('')
      } catch (err) { if (!stopped) setError(errorMessage(err)) }
      finally { inFlight = false }
    }

    void poll()
    const timer = window.setInterval(() => void poll(), 3000)
    return () => { stopped = true; window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    localStorage.setItem(`pulse.dashboard.manager-updates:${apiBase()}`, JSON.stringify(updates))
  }, [updates])

  useEffect(() => {
    const match = location.pathname.match(/^\/safety\/incidents\/([^/]+)$/)
    if (!match) return
    const incidentId = decodeURIComponent(match[1])
    updates.filter(item => item.incident_id === incidentId).forEach(item => dismiss(item.id))
  }, [location.pathname, updates])

  return <ManagerUpdatesContext.Provider value={{ updates, error, dismiss }}>{children}</ManagerUpdatesContext.Provider>
}

export function ManagerUpdatesPanel() {
  const { updates, error, dismiss } = useContext(ManagerUpdatesContext)
  return <section className="panel updates-panel">
    <div className="section-heading"><h2><Icon name="pulse" size={18} />Updates <span className="count-bubble">{updates.length}</span></h2><span className="small-label">VOLUNTEERS</span></div>
    {error && <div className="notice notice-error"><Icon name="alert" size={16} /><span>{error}</span></div>}
    {!updates.length ? <div className="updates-empty"><Icon name="check" size={18} /><p>No new volunteer reports or updates.</p></div> : <div className="updates-list">{updates.map(item => <Link className="update-item" key={item.id} to={`/safety/incidents/${item.incident_id}`} onClick={() => dismiss(item.id)}>
      <span className="update-type">{item.kind === 'report' ? 'NEW REPORT' : 'REPORT UPDATE'}</span>
      <strong>{item.volunteer_name}</strong><span className="update-location"><Icon name="pin" size={13} />{item.location}</span>
      <p>{item.message}</p><span className="text-link">Open incident<Icon name="arrow" size={14} /></span>
    </Link>)}</div>}
  </section>
}
