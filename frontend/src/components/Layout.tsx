import { NavLink, Outlet } from 'react-router-dom'
import { usePolling } from '../api/client'
import { Icon } from './ui'
import { ManagerUpdatesProvider } from './ManagerUpdates'

export default function Layout() {
  return <ManagerUpdatesProvider><LayoutContent /></ManagerUpdatesProvider>
}

function LayoutContent() {
  const { data, error } = usePolling<{ status: string }>('/health', 10000)
  return <div className="app-shell">
    <aside className="sidebar">
      <NavLink to="/safety" className="brand" aria-label="Pulse home"><img className="brand-logo" src="/pulse.svg" alt="" aria-hidden="true" /><span>pulse<span className="brand-period">.</span></span></NavLink>
      <div className="event-label"><span className="event-mark">R</span><div><strong>Riverside</strong><span>Festival coordination</span></div></div>
      <span className="nav-heading">WORKSPACE</span>
      <nav aria-label="Main navigation">
        <NavLink to="/safety" end><Icon name="grid" />Operations</NavLink>
        <NavLink to="/safety/resources"><Icon name="people" />Team & resources</NavLink>
        <NavLink to="/safety/map"><Icon name="pin" />Festival map</NavLink>
        <NavLink to="/safety/settings"><Icon name="file" />Settings</NavLink>
      </nav>
      <div className="sidebar-note"><Icon name="shield" size={24} /><strong>People make the call.</strong><p>Pulse suggests a response.<br />Your safety lead decides.</p><span className="demo-pill">HACKATHON DEMO</span></div>
      <div className="profile"><div className="avatar">SL</div><div><strong>Safety lead</strong><span>Manager workspace</span></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="breadcrumb">Riverside <span>/</span> <strong>Safety lead dashboard</strong></div><div className={`connection ${error ? 'offline' : ''}`}><span className="dot" />{error ? 'Connection lost' : data ? 'Connected' : 'Connecting…'}<span className="topbar-divider" /><span className="mock-label">Demo</span></div></header>
      <main id="main-content"><Outlet /></main>
      <footer className="footer"><span>Pulse · A little clarity when it matters.</span><span>Simulated festival · Times in Sydney</span></footer>
    </div>
  </div>
}

