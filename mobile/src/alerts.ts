import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, NativeModules, PermissionsAndroid, Platform, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { errorMessage, request } from './api';
import type { VolunteerAlert } from './types';

export const alertVibration = [0, 500, 180, 500, 180, 800];
export type DutyStatus = {
  enabled: boolean; notificationsAllowed: boolean; vibrationEnabled: boolean;
  batteryAllowed: boolean; fullScreenAllowed: boolean; volunteerId: string; base: string;
};
type AlertService = {
  start: (base: string, volunteer: string) => Promise<void>;
  stop: () => Promise<void>;
  status: () => Promise<DutyStatus>;
  syncInbox: (base: string, volunteer: string, json: string) => Promise<void>;
  silenceAlert: (base: string, volunteer: string, id: string) => Promise<void>;
  getSilenced: (base: string, volunteer: string) => Promise<string[]>;
  notificationSettings: () => Promise<void>;
  batterySettings: () => Promise<void>;
  wakeSettings: () => Promise<void>;
};
export const nativeAlerts: AlertService | undefined = NativeModules.PulseAlerts;
let dutyGeneration = 0;
export async function stopBackgroundAlerts() { dutyGeneration++; await nativeAlerts?.stop(); }
export function testVibration() { Vibration.vibrate(alertVibration); }

export function useDutyAlerts(base: string, volunteerId: string | null) {
  const [status, setStatus] = useState<DutyStatus | null>(null);
  const [error, setError] = useState('');
  const identity = useRef({ base, volunteerId });
  identity.current = { base, volunteerId };
  const refresh = useCallback(async () => {
    try { if (nativeAlerts) setStatus(await nativeAlerts.status()); }
    catch (err) { setError(errorMessage(err)); }
  }, []);
  const start = useCallback(async () => {
    if (!nativeAlerts || !base || !volunteerId) return;
    const startingGeneration = dutyGeneration;
    setError('');
    try {
      // Create notification channels before requesting Android 13+ permission.
      await nativeAlerts.status();
      if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('Allow Pulse notifications in Android settings to receive background alerts.');
      }
      if (startingGeneration !== dutyGeneration || identity.current.base !== base || identity.current.volunteerId !== volunteerId) return;
      await nativeAlerts.start(base, volunteerId);
      await refresh();
    } catch (err) { setError(errorMessage(err)); }
  }, [base, volunteerId, refresh]);
  useEffect(() => {
    if (!volunteerId || !base) return;
    void start();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 5000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    // The Android service must survive React activity destruction / swiping away.
    // Only explicit logout, role/server change, or Stop alerts stops the service.
    return () => { clearInterval(timer); subscription.remove(); };
  }, [start, refresh, volunteerId, base]);
  async function stop() { await stopBackgroundAlerts(); await refresh(); }
  async function settings(battery = false) {
    try { await (battery ? nativeAlerts?.batterySettings() : nativeAlerts?.notificationSettings()); }
    catch (err) { setError(errorMessage(err)); }
  }
  async function wakeSettings() {
    try { await nativeAlerts?.wakeSettings(); }
    catch (err) { setError(errorMessage(err)); }
  }
  return { status, error, start, stop, settings, wakeSettings, supported: !!nativeAlerts };
}

export function useVolunteerAlerts(base: string, volunteerId: string | null) {
  const [alerts, setAlerts] = useState<VolunteerAlert[]>([]);
  const [error, setError] = useState('');
  const [ackError, setAckError] = useState('');
  const [busy, setBusy] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const generation = useRef(0);
  const acknowledged = useRef(new Map<string, string>());
  useEffect(() => {
    const currentGeneration = ++generation.current;
    let stopped = false, inFlight = false;
    let restored = false;
    acknowledged.current = new Map();
    setAlerts([]); setError(''); setAckError(''); setBusy(false);
    async function refresh() {
      if (!base || !volunteerId || stopped || inFlight || AppState.currentState === 'background') return;
      inFlight = true;
      try {
        if (!restored) {
          const ids: string[] = nativeAlerts ? await nativeAlerts.getSilenced(base, volunteerId)
            : JSON.parse(await AsyncStorage.getItem(`pulse.stopped:${base}|${volunteerId}`) ?? '[]');
          if (stopped || currentGeneration !== generation.current) return;
          for (const id of ids) acknowledged.current.set(id, new Date().toISOString());
          restored = true;
        }
        const data = await request<VolunteerAlert[]>(base, `/api/volunteers/${volunteerId}/alerts`);
        if (!Array.isArray(data)) throw new Error('Update the Python backend to enable emergency alerts.');
        if (!stopped && generation.current === currentGeneration) {
          if (AppState.currentState === 'active') await nativeAlerts?.syncInbox(base, volunteerId, JSON.stringify(data));
          if (stopped || generation.current !== currentGeneration) return;
          setAlerts(data.filter(item => item.volunteer_id === volunteerId).map(item => ({ ...item,
            acknowledged_at: acknowledged.current.get(item.id) ?? item.acknowledged_at })));
          setError('');
        }
      } catch (err) { if (!stopped) setError(errorMessage(err)); }
      finally { inFlight = false; }
    }
    refreshRef.current = refresh;
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 2000);
    const subscription = AppState.addEventListener('change', state => {
      setForeground(state === 'active');
      if (state === 'active') void refresh();
    });
    return () => { stopped = true; generation.current++; clearInterval(timer); subscription.remove(); };
  }, [base, volunteerId]);
  async function acknowledge(alert: VolunteerAlert) {
    if (busy || !volunteerId) return false;
    const before = generation.current;
    setBusy(true); setAckError('');
    try {
      if (nativeAlerts) await nativeAlerts.silenceAlert(base, volunteerId, alert.id);
      else {
        await AsyncStorage.setItem(`pulse.stopped:${base}|${volunteerId}`, JSON.stringify([...acknowledged.current.keys(), alert.id].slice(-300)));
        Vibration.cancel();
      }
      if (before !== generation.current) return false;
      const saved = { ...alert, acknowledged_at: new Date().toISOString() };
      acknowledged.current.set(alert.id, saved.acknowledged_at);
      setAlerts(items => items.map(item => item.id === alert.id ? saved : item));
      // Stopping the phone must not wait for Wi-Fi. Android durably retries this acknowledgement.
      void request(base, `/api/volunteers/${volunteerId}/alerts/${alert.id}/acknowledge`, {}).catch(() => {
        if (before === generation.current) setError(nativeAlerts
          ? 'Alert stopped on this phone. Acknowledgement will sync when connected.'
          : 'Alert stopped on this phone. The supervisor has not received your acknowledgement.');
      });
      return true;
    } catch (err) { if (before === generation.current) setAckError(errorMessage(err)); return false; }
    finally { if (before === generation.current) setBusy(false); }
  }
  const visible = alerts.filter(item => item.volunteer_id === volunteerId);
  const pending = visible.filter(item => item.active && !item.acknowledged_at).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { alerts: visible, error, ackError, busy, acknowledge, refresh: () => refreshRef.current(),
    current: foreground ? pending[0] : undefined, pendingCount: pending.length };
}

export type AlertInbox = ReturnType<typeof useVolunteerAlerts>;
export type DutyAlerts = ReturnType<typeof useDutyAlerts>;
