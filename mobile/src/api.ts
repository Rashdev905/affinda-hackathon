import { AppState } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Decision, Incident } from './types';

export function validateServer(value: string, allowHttp = true): string {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Enter a server URL such as http://192.168.1.42:8000 without credentials or query parameters.');
  }
  if (!allowHttp && url.protocol !== 'https:') throw new Error('This build requires an HTTPS backend.');
  return url.toString().replace(/\/$/, '');
}

export async function request<T>(base: string, path: string, body?: unknown): Promise<T> {
  if (!base) throw new Error('Set your Python server address in Connection first.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(typeof data?.detail === 'string' ? data.detail : 'The server could not accept this request. Check the input and try again.');
    }
    if (data === null) throw new Error('The server returned an unexpected response.');
    return data as T;
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || error instanceof TypeError)) {
      throw new Error('Cannot reach the Python server. Check the server address, Wi-Fi, and that the backend is running.');
    }
    throw error;
  } finally { clearTimeout(timeout); }
}

export function client(base: string) {
  return {
    report: (text: string) => request<Incident>(base, '/api/reports', { text, reported_by: 'VOL-014' }),
    update: (id: string, text: string, reported_by = 'VOL-014') => request<Incident>(base, `/api/incidents/${id}/updates`, { text, reported_by }),
    decide: (id: string, decision: Decision) => request<Incident>(base, `/api/incidents/${id}/decision`, decision),
    resolve: (id: string, note: string) => request<Incident>(base, `/api/incidents/${id}/resolve`, { note }),
  };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export function usePolling<T>(base: string, path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    if (!base) { setLoading(false); return; }
    try {
      const result = await request<T>(base, path);
      if (current === generation.current) { setData(result); setError(''); }
    } catch (err) {
      if (current === generation.current) setError(errorMessage(err));
    } finally { if (current === generation.current) setLoading(false); }
  }, [base, path]);
  useEffect(() => {
    setData(null); setError(''); setLoading(true); void refresh();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, 5000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { clearInterval(timer); listener.remove(); generation.current++; };
  }, [refresh]);
  return { data, error, loading, refresh };
}
