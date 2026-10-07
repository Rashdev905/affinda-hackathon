import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { request, validateServer } from './api';

const key = 'pulse.api-url.v1';
type Connection = { url: string; ready: boolean; save: (url: string) => Promise<void> };
const Context = createContext<Connection>({ url: '', ready: false, save: async () => {} });

function defaultUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const host = Constants.expoConfig?.hostUri;
  if (!host || host.includes('exp.direct') || host.includes('expo.dev')) return '';
  try { return `http://${new URL(`http://${host}`).hostname}:8000`; }
  catch { return ''; }
}

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [url, setUrl] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(key).then(saved => {
      if (mounted) setUrl(saved || defaultUrl());
    }).catch(() => { if (mounted) setUrl(defaultUrl()); })
      .finally(() => { if (mounted) setReady(true); });
    return () => { mounted = false; };
  }, []);
  async function save(value: string) {
    const next = validateServer(value, Constants.expoConfig?.extra?.allowHttp !== false);
    const health = await request<{ status: string; service: string }>(next, '/health');
    if (health.status !== 'ok' || health.service !== 'pulse') throw new Error('This address is not a healthy Pulse backend.');
    await AsyncStorage.setItem(key, next);
    setUrl(next);
  }
  return <Context.Provider value={{ url, ready, save }}>{children}</Context.Provider>;
}

export const useConnection = () => useContext(Context);
