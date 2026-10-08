import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { errorMessage, request } from './api';
import type { DutyAlerts } from './alerts';
import { Button, Notice, s } from './ui';

type ManagerUpdate = { id: number; incident_id: string; volunteer_name: string; location: string; message: string; kind?: 'report' | 'update' };
type Feed = { cursor: number; updates: ManagerUpdate[] };
let consumedInitialLink: string | null = null;

export function managerIncidentLink(link: string, base: string): string | null {
  try {
    const url = new URL(link);
    if (url.protocol !== 'pulse:' || url.hostname !== 'incident' || url.searchParams.get('server') !== base) return null;
    const id = decodeURIComponent(url.pathname.slice(1));
    return /^INC-[A-Za-z0-9-]+$/.test(id) ? id : null;
  } catch { return null; }
}

export function ManagerUpdates({ base, duty, onOpen }: { base: string; duty: DutyAlerts; onOpen: (id: string) => void }) {
  const [pending, setPending] = useState<ManagerUpdate[]>([]);
  const [error, setError] = useState('');
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  useEffect(() => {
    let stopped = false;
    function open(link: string) {
      const id = managerIncidentLink(link, base);
      if (!stopped && id) {
        openRef.current(id);
        setPending(items => items.filter(item => item.incident_id !== id));
      }
    }
    void Linking.getInitialURL().then(link => {
      if (!stopped && link && link !== consumedInitialLink && managerIncidentLink(link, base)) {
        consumedInitialLink = link;
        open(link);
      }
    }).catch(() => {});
    const listener = Linking.addEventListener('url', event => open(event.url));
    return () => { stopped = true; listener.remove(); };
  }, [base]);
  useEffect(() => {
    let stopped = false, inFlight = false, restored = false;
    let cursor: number | null = null;
    const key = `pulse.manager.updateCursor:${base}`;
    setPending([]); setError('');
    async function poll() {
      if (stopped || inFlight || !base || AppState.currentState === 'background') return;
      inFlight = true;
      try {
        if (!restored) {
          const saved = await AsyncStorage.getItem(key);
          if (saved !== null && Number.isSafeInteger(Number(saved)) && Number(saved) >= 0) cursor = Number(saved);
          restored = true;
        }
        if (stopped) return;
        const feed = await request<Feed>(base, `/api/manager/updates${cursor === null ? '' : `?after=${cursor}`}`);
        if (stopped) return;
        if (!Number.isSafeInteger(feed.cursor) || !Array.isArray(feed.updates)) throw new Error('Restart the updated backend to enable manager notifications.');
        if (feed.updates.length) setPending(items => {
          const byId = new Map(items.map(item => [item.id, item]));
          for (const item of feed.updates) byId.set(item.id, item);
          return [...byId.values()].slice(-20);
        });
        cursor = feed.cursor;
        await AsyncStorage.setItem(key, String(cursor));
        if (!stopped) setError('');
      } catch (err) { if (!stopped) setError(errorMessage(err)); }
      finally { inFlight = false; }
    }
    void poll();
    const timer = setInterval(() => void poll(), 3000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void poll(); });
    return () => { stopped = true; clearInterval(timer); listener.remove(); };
  }, [base]);
  const update = pending[0];
  return <View>
    <Notice text={error || duty.error || undefined} />
    {duty.supported && duty.status && (!duty.status.enabled || !duty.status.notificationsAllowed) &&
      <Button title="Enable manager notifications" onPress={() => void (duty.status?.notificationsAllowed ? duty.start() : duty.settings())} />}
    {update && <View accessibilityLiveRegion="polite" style={{ padding: 12, backgroundColor: '#eaf1df' }}>
      <Text style={s.label}>{update.volunteer_name} {update.kind === 'report' ? 'sent a new report' : 'sent an update'}{pending.length > 1 ? ` (${pending.length} unread)` : ''}</Text>
      <Text numberOfLines={2} style={s.body}>{update.location}: {update.message}</Text>
      <Button title="View volunteer update" onPress={() => {
        onOpen(update.incident_id);
        setPending(items => items.filter(item => item.incident_id !== update.incident_id));
      }} />
    </View>}
  </View>;
}
