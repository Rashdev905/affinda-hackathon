import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import IncidentDetail from './pages/IncidentDetail'
import Resources from './pages/Resources'
import Safety from './pages/Safety'
import Volunteer from './pages/Volunteer'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter><a className="skip-link" href="#main-content">Skip to content</a><Routes><Route element={<Layout />}><Route index element={<Navigate to="/safety" replace />} /><Route path="volunteer" element={<Volunteer />} /><Route path="safety" element={<Safety />} /><Route path="safety/resources" element={<Resources />} /><Route path="safety/incidents/:id" element={<IncidentDetail />} /><Route path="*" element={<div className="page"><h1>Page not found</h1><Link to="/safety">Return to the overview</Link></div>} /></Route></Routes></BrowserRouter>
  </React.StrictMode>,
)

