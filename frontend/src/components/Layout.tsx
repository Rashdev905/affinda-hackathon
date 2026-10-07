import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { usePolling } from '../api/client'
import { Icon } from './ui'

export default function Layout() {
  const { data, error } = usePolling<{ status: string }>('/health', 10000)
  const volunteer = useLocation().pathname === '/volunteer'
  return <div className="app-shell">
    <aside className="sidebar">
      <NavLink to="/safety" className="brand" aria-label="Pulse home"><span className="brand-symbol"><Icon name="pulse" size={30} /></span><span>pulse<span className="brand-period">.</span></span></NavLink>
      <div className="event-label"><span className="event-mark">R</span><div><strong>Riverside</strong><span>Festival coordination</span></div></div>
      <span className="nav-heading">WORKSPACE</span>
      <nav aria-label="Main navigation">
        <NavLink to="/safety" end><Icon name="grid" />Overview</NavLink>
        <NavLink to="/volunteer"><Icon name="plus" />Report incident</NavLink>
        <NavLink to="/safety/resources"><Icon name="people" />Team & resources</NavLink>
      </nav>
      <div className="sidebar-note"><Icon name="shield" size={24} /><strong>People make the call.</strong><p>Pulse suggests a response.<br />Your safety lead decides.</p><span className="demo-pill">HACKATHON DEMO</span></div>
      <div className="profile"><div className="avatar">{volunteer ? 'V' : 'SL'}</div><div><strong>{volunteer ? 'Volunteer 14' : 'Safety lead'}</strong><span>{volunteer ? 'Reporting workspace' : 'Coordination workspace'}</span></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="breadcrumb">Riverside <span>/</span> <strong>{volunteer ? 'Volunteer' : 'Safety operations'}</strong></div><div className={`connection ${error ? 'offline' : ''}`}><span className="dot" />{error ? 'Connection lost' : data ? 'Connected' : 'Connecting…'}<span className="topbar-divider" /><span className="mock-label">Mock AI</span></div></header>
      <main id="main-content"><Outlet /></main>
      <footer className="footer"><span>Pulse · A little clarity when it matters.</span><span>Simulated festival · Times in Sydney</span></footer>
    </div>
  </div>
}

