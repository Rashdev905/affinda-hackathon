import { useCallback, useEffect, useRef, useState } from 'react'
import type { Decision, Incident, Resource } from '../types'

const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export async function request<T>(path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${base}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
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
  resolve: (id: string, note: string) => request<Incident>(`/api/incidents/${id}/resolve`, { note }),
}

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

