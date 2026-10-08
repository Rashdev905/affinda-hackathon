import { act, fireEvent, renderAsync, screen } from '@testing-library/react-native';
import { AppState, Linking, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ManagerUpdates, managerIncidentLink } from '../ManagerUpdates';
import { useDutyAlerts, type DutyAlerts } from '../alerts';

const base = 'http://pc:8000';
const key = `pulse.manager.updateCursor:${base}`;
const update = { id: 1, incident_id: 'INC-123ABC', volunteer_name: 'Alex Morgan', location: 'Lawn Stage', message: 'Person is awake.' };
const duty = { supported: false, status: null, error: '' } as DutyAlerts;
const onOpen = jest.fn();

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  await AsyncStorage.clear();
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ cursor: 0, updates: [] }) });
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test('polls new updates, deduplicates them and opens the matching incident', async () => {
  await renderAsync(<ManagerUpdates base={base} duty={duty} onOpen={onOpen} />);
  expect(global.fetch).toHaveBeenCalledWith(`${base}/api/manager/updates`, expect.anything());
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ cursor: 1, updates: [update] }) });
  await act(async () => { jest.advanceTimersByTime(3000); });
  expect(global.fetch).toHaveBeenLastCalledWith(`${base}/api/manager/updates?after=0`, expect.anything());
  expect(screen.getByText('Alex Morgan sent an update')).toBeTruthy();
  await act(async () => { jest.advanceTimersByTime(3000); });
  expect(screen.queryByText(/unread/)).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'View volunteer update' }));
  expect(onOpen).toHaveBeenCalledWith(update.incident_id);
  expect(screen.queryByText('Alex Morgan sent an update')).toBeNull();
  expect(await AsyncStorage.getItem(key)).toBe('1');
});

test('restores this server cursor and ignores results after switching server', async () => {
  await AsyncStorage.setItem(key, '7');
  let resolveRequest: (value: unknown) => void = () => {};
  (global.fetch as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { resolveRequest = resolve; }));
  const view = await renderAsync(<ManagerUpdates base={base} duty={duty} onOpen={onOpen} />);
  expect(global.fetch).toHaveBeenCalledWith(`${base}/api/manager/updates?after=7`, expect.anything());
  await view.rerenderAsync(<ManagerUpdates base="http://other:8000" duty={duty} onOpen={onOpen} />);
  await act(async () => { resolveRequest({ ok: true, json: async () => ({ cursor: 8, updates: [update] }) }); });
  expect(screen.queryByText('Alex Morgan sent an update')).toBeNull();
  expect(await AsyncStorage.getItem(key)).toBe('7');
});

test('notification deep link opens only the incident on the configured server', async () => {
  const link = `pulse://incident/INC-123ABC?server=${encodeURIComponent(base)}&update=1`;
  expect(managerIncidentLink(link, base)).toBe('INC-123ABC');
  expect(managerIncidentLink(link, 'http://other:8000')).toBeNull();
  expect(managerIncidentLink('https://example.com/INC-123ABC', base)).toBeNull();
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(link);
  await renderAsync(<ManagerUpdates base={base} duty={duty} onOpen={onOpen} />);
  expect(onOpen).toHaveBeenCalledWith('INC-123ABC');
});

test('manager mode starts the native monitor with manager identity', async () => {
  function Harness() { useDutyAlerts(base, 'MANAGER'); return null; }
  await renderAsync(<Harness />);
  expect(NativeModules.PulseAlerts.start).toHaveBeenCalledWith(base, 'MANAGER');
  expect(NativeModules.PulseAlerts.syncInbox).not.toHaveBeenCalled();
});

test('new report notifications are identified separately from updates', async () => {
  await AsyncStorage.setItem(key, '0');
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ cursor: 1, updates: [{ ...update, kind: 'report' }] }) });
  await renderAsync(<ManagerUpdates base={base} duty={duty} onOpen={onOpen} />);
  expect(screen.getByText('Alex Morgan sent a new report')).toBeTruthy();
});
