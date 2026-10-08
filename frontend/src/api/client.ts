import { useCallback, useEffect, useRef, useState } from 'react'
import type { Decision, Incident, Resource } from '../types'

const baseKey = 'pulse.dashboard.api-base.v1'
export const hiddenResolvedKey = 'pulse.dashboard.hidden-resolved-before.v1'
export function apiBase() {
  return (localStorage.getItem(baseKey) ?? import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
}
export function resolvedIsHidden(incident: Incident) {
  if (incident.status !== 'resolved') return false
  const cutoff = localStorage.getItem(hiddenResolvedKey)
  if (!cutoff) return false
  const resolvedAt = [...incident.timeline].reverse().find(entry => entry.kind === 'resolved')?.timestamp ?? incident.updated_at
  return Date.parse(resolvedAt) <= Date.parse(cutoff)
}
export function saveApiBase(value: string) {
  if (value.trim()) localStorage.setItem(baseKey, value.trim().replace(/\/$/, ''))
  else localStorage.removeItem(baseKey)
  window.dispatchEvent(new Event('pulse-api-base-change'))
}

export async function request<T>(path: string, body?: unknown, options: { method?: string; headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method: options.method ?? (body === undefined ? 'GET' : 'POST'),
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...options.headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 15000),
    })
  } catch {
    throw new Error('Unable to reach Pulse. Check your connection and that the backend is running.')
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = data?.detail
    throw new Error(typeof detail === 'string' ? detail : Array.isArray(detail)
      ? detail.map((item: { msg: string }) => item.msg).join(' ')
      : 'The request could not be completed. Please try again.')
  }
  if (data === null) throw new Error('Pulse returned an unexpected response. Check the API connection.')
  return data as T
}

export const api = {
  report: (text: string) => request<Incident>('/api/reports', { text, reported_by: 'VOL-014' }),
  update: (id: string, text: string, reported_by = 'VOL-014') => request<Incident>(`/api/incidents/${id}/updates`, { text, reported_by }),
  decide: (id: string, decision: Decision) => request<Incident>(`/api/incidents/${id}/decision`, decision),
  modifySuggestion: (id: string, responder_ids: string[], actions: string[], note = '') => request<Incident>(`/api/incidents/${id}/suggestion`, { responder_ids, actions, note }),
  resolve: (id: string, note: string) => request<Incident>(`/api/incidents/${id}/resolve`, { note }),
  alertDrafts: (id: string) => request<{ mode: 'gemini' | 'mock'; drafts: AlertDraft[] }>(`/api/incidents/${id}/alert-drafts`, {}, { timeoutMs: 55000 }),
  sendAlerts: (id: string, messages: { volunteer_id: string; message: string }[]) => request<Incident>(`/api/incidents/${id}/alerts`, { messages, alerted_by: 'Manager' }),
  clearAllIncidents: () => request<{ deleted_count: number }>('/api/incidents', undefined, { method: 'DELETE', headers: { 'X-Pulse-Mode': 'Manager' } }),
}

export interface AlertDraft {
  volunteer_id: string
  volunteer_name: string
  role: string
  task: string
  message: string
}

export interface ManagerUpdate { id: number; incident_id: string; volunteer_name: string; location: string; message: string; kind?: 'report' | 'update' }
export interface ManagerUpdateFeed { cursor: number; updates: ManagerUpdate[] }

export function usePolling<T>(path: string, interval = 5000) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    const current = ++generation.current
    try {
      const next = await request<T>(path)
      if (current === generation.current) { setData(next); setError('') }
    } catch (err) {
      if (current === generation.current) setError(errorMessage(err))
    } finally {
      if (current === generation.current) setLoading(false)
    }
  }, [path])
  useEffect(() => {
    setData(null)
    setLoading(true)
    void refresh()
    const timer = window.setInterval(() => void refresh(), interval)
    return () => { window.clearInterval(timer); generation.current++ }
  }, [refresh, interval])
  return { data, error, loading, refresh }
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

export function useResources() { return usePolling<Resource[]>('/api/resources') }

