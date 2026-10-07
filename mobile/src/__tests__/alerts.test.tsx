import { act, fireEvent, render, renderAsync, screen, waitFor } from '@testing-library/react-native';
import { AppState, NativeModules, Text, Vibration, View } from 'react-native';
import { EmergencyAlert } from '../EmergencyAlert';
import { useDutyAlerts, useVolunteerAlerts } from '../alerts';
import { Button } from '../ui';
import type { VolunteerAlert } from '../types';

let alerts: VolunteerAlert[];
let failAck = false;
let appState: (state: any) => void;
let locallyStopped: string[];
const onOpen = jest.fn();
const sample = (id: string): VolunteerAlert => ({ id, incident_id: `INC-${id}`, volunteer_id: 'VOL-002',
  source: 'automatic', urgency: 'high', location: 'Lawn Stage Toilets', message: `Emergency ${id}`,
  instructions: ['Keep access clear.', 'Contact your supervisor.'], created_at: `2026-10-07T01:00:0${id}Z`,
  acknowledged_at: null, active: true });

function Harness({ volunteerId = 'VOL-002' }: { volunteerId?: string }) {
  const inbox = useVolunteerAlerts('http://pc:8000', volunteerId);
  return <View><Text>Any volunteer tab</Text><Button title="Refresh alerts" onPress={() => void inbox.refresh()} />
    <EmergencyAlert inbox={inbox} onOpen={onOpen} /></View>;
}

beforeEach(() => {
  jest.clearAllMocks();
  alerts = [sample('1')]; failAck = false;
  locallyStopped = [];
  NativeModules.PulseAlerts.getSilenced.mockImplementation(async () => locallyStopped);
  NativeModules.PulseAlerts.silenceAlert.mockImplementation(async (_base: string, _volunteer: string, id: string) => { locallyStopped.push(id); });
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, callback: any) => {
    appState = callback;
    return { remove: jest.fn() };
  });
  jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
  jest.spyOn(Vibration, 'cancel').mockImplementation(() => {});
  global.fetch = jest.fn(async (url, options) => {
    if (options?.method === 'POST') {
      if (failAck) return { ok: false, json: async () => ({ detail: 'Connection interrupted. Try again.' }) } as Response;
      const id = String(url).split('/').at(-2);
      alerts = alerts.map(alert => alert.id === id ? { ...alert, acknowledged_at: '2026-10-07T02:00:00Z' } : alert);
      return { ok: true, json: async () => alerts.find(alert => alert.id === id) } as Response;
    }
    return { ok: true, json: async () => alerts.map(alert => ({ ...alert })) } as Response;
  });
});
afterEach(() => jest.restoreAllMocks());

test('an incoming alert starts the native alarm; polling and opening the screen never silence it', async () => {
  await renderAsync(<Harness />);
  await screen.findByText('EMERGENCY ALERT');
  expect(screen.getByText('1. Keep access clear.')).toBeTruthy();
  expect(NativeModules.PulseAlerts.syncInbox).toHaveBeenCalledWith('http://pc:8000', 'VOL-002', JSON.stringify(alerts));
  expect(NativeModules.PulseAlerts.silenceAlert).not.toHaveBeenCalled();
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Refresh alerts' })); });
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  expect(NativeModules.PulseAlerts.silenceAlert).not.toHaveBeenCalled();
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Stop alert & open incident' })); });
  await waitFor(() => expect(onOpen).toHaveBeenCalledWith('INC-1'));
  expect(screen.queryByText('EMERGENCY ALERT')).toBeNull();
  expect(alerts[0].acknowledged_at).toBeTruthy();
  expect(NativeModules.PulseAlerts.silenceAlert).toHaveBeenCalledWith('http://pc:8000', 'VOL-002', '1');
});

test('each queued alert can be stopped offline and stays stopped after reopening the app', async () => {
  alerts.push(sample('2')); failAck = true;
  const view = await renderAsync(<Harness />);
  await screen.findByText('Emergency 1');
  expect(screen.getByText('1 more alerts waiting')).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Stop alert' })); });
  await screen.findByText('Emergency 2');
  expect(locallyStopped).toEqual(['1']);
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Stop alert' })); });
  await waitFor(() => expect(screen.queryByText('EMERGENCY ALERT')).toBeNull());
  expect(locallyStopped).toEqual(['1', '2']);
  expect(alerts.every(alert => alert.acknowledged_at === null)).toBe(true);
  await view.unmountAsync();
  await renderAsync(<Harness />);
  expect(screen.queryByText('EMERGENCY ALERT')).toBeNull();
});

test('acknowledged, resolved, and other volunteers alerts do not vibrate', async () => {
  alerts = [{ ...sample('1'), acknowledged_at: '2026-10-07T02:00:00Z' },
    { ...sample('2'), active: false }, { ...sample('3'), volunteer_id: 'VOL-003' }];
  await renderAsync(<Harness />);
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  expect(screen.queryByText('EMERGENCY ALERT')).toBeNull();
  expect(Vibration.vibrate).not.toHaveBeenCalled();
});

test('backgrounding leaves the native alarm active; returning fetches new alerts', async () => {
  await renderAsync(<Harness />);
  await screen.findByText('Emergency 1');
  act(() => {
    Object.defineProperty(AppState, 'currentState', { value: 'background', configurable: true });
    appState('background');
  });
  expect(screen.queryByText('EMERGENCY ALERT')).toBeNull();
  expect(NativeModules.PulseAlerts.silenceAlert).not.toHaveBeenCalled();
  expect(Vibration.cancel).not.toHaveBeenCalled();
  alerts = [{ ...sample('1'), active: false }, sample('2')];
  await act(async () => {
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
    appState('active');
  });
  await screen.findByText('Emergency 2');
});

test('a failed local stop stays visible rather than falsely claiming the alarm is off', async () => {
  NativeModules.PulseAlerts.silenceAlert.mockRejectedValueOnce(new Error('Could not stop the alarm. Try again.'));
  await renderAsync(<Harness />);
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Stop alert' })); });
  expect(screen.getByText('Could not stop the alarm. Try again.')).toBeTruthy();
  expect(screen.getByText('EMERGENCY ALERT')).toBeTruthy();
  expect(locallyStopped).toEqual([]);
});

test('wake-up setup opens Android special access settings', async () => {
  function Settings() {
    const duty = useDutyAlerts('http://pc:8000', 'VOL-002');
    return <Button title="Allow wake-up" onPress={() => void duty.wakeSettings()} />;
  }
  await renderAsync(<Settings />);
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Allow wake-up' })); });
  expect(NativeModules.PulseAlerts.wakeSettings).toHaveBeenCalledTimes(1);
});

test('background service survives UI unmount and stops only when explicitly requested', async () => {
  function Duty() {
    const duty = useDutyAlerts('http://pc:8000', 'VOL-002');
    return <Button title="Stop duty" onPress={() => void duty.stop()} />;
  }
  const first = render(<Duty />);
  await waitFor(() => expect(NativeModules.PulseAlerts.start).toHaveBeenCalledWith('http://pc:8000', 'VOL-002'));
  first.unmount();
  expect(NativeModules.PulseAlerts.stop).not.toHaveBeenCalled();
  render(<Duty />);
  fireEvent.press(screen.getByRole('button', { name: 'Stop duty' }));
  await waitFor(() => expect(NativeModules.PulseAlerts.stop).toHaveBeenCalledTimes(1));
});
