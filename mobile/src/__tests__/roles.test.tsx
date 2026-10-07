import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../../App';
import type { Incident, Resource } from '../types';

const mockConnection = { url: 'http://pc:8000', ready: true, save: jest.fn().mockResolvedValue(undefined) };
jest.mock('../connection', () => ({
  useConnection: () => mockConnection,
  ConnectionProvider: ({ children }: any) => children,
}));
const recorder = require('expo-audio').__recorder;
const volunteer: Resource = {
  id: 'VOL-002', name: 'Jamie Chen', role: 'First-aid volunteer', zone: 'Lawn Stage',
  skills: ['first_aid'], qualifications: [], available: true, current_assignment: null, status: 'available',
};
let incident: Incident;
let posts: { path: string; body: any }[];

beforeEach(async () => {
  await AsyncStorage.clear();
  mockConnection.url = 'http://pc:8000';
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  incident = {
    id: 'INC-MERGED', type: 'medical', summary: 'Person collapsed', location: 'Lawn Stage Toilets',
    urgency: 'high', status: 'awaiting_clarification', observations: ['Person is awake'],
    missing_information: ['breathing_status'], follow_up_question: 'Is the person breathing normally?',
    reported_by: 'VOL-014', created_at: '2026-10-07T01:00:00Z', updated_at: '2026-10-07T01:00:00Z',
    recommendation: { recommended_responders: ['VOL-002'], alternatives: [], actions: ['Attend the toilets.'],
      reasoning: ['Available first aider.'], conflicts: [], requires_human_approval: true },
    timeline: [], last_decision: null, assigned_responders: [], resolution_note: null, draft_report: null, parser_mode: 'mock',
  };
  posts = [];
  global.fetch = jest.fn(async (url, options) => {
    const path = String(url).replace('http://pc:8000', '');
    const body = options?.body instanceof FormData ? options.body : options?.body ? JSON.parse(String(options.body)) : null;
    if (options?.method === 'POST') posts.push({ path, body });
    if (path === '/api/reports') incident = { ...incident, reported_by: body.reported_by };
    if (path.endsWith('/updates')) incident = { ...incident, missing_information: [], follow_up_question: null, status: 'awaiting_approval' };
    if (path.endsWith('/decision')) incident = { ...incident, status: 'response_dispatched', assigned_responders: ['VOL-002'], last_decision: 'approve' };
    if (path.endsWith('/alerts')) incident = { ...incident, timeline: [{ id: 'alert-1', kind: 'volunteer_alert', actor: 'Manager', message: body.message, timestamp: incident.updated_at }] };
    const data = path === '/health' ? { status: 'ok', service: 'pulse' }
      : path === '/api/volunteers/0002' ? volunteer
      : path === '/api/resources' ? [volunteer]
      : path === '/api/incidents' ? [incident]
      : path === '/api/transcriptions' ? { text: 'Someone collapsed near the lawn stage toilets.' } : incident;
    return { ok: true, json: async () => data } as Response;
  });
});

async function signIn() {
  fireEvent.press(await screen.findByRole('button', { name: 'Continue as volunteer' }));
  fireEvent.changeText(screen.getByLabelText('4-digit volunteer ID'), '0002');
  fireEvent.press(screen.getByRole('button', { name: 'Log in' }));
  await screen.findByText('0002 · Jamie Chen');
}

async function returnToMenu() {
  fireEvent.press(screen.getByRole('tab', { name: 'Settings' }));
  fireEvent.press(screen.getByRole('button', { name: 'Return to main menu' }));
  await screen.findByRole('button', { name: 'Continue as manager' });
}

test('volunteer voice report, manager approval and alert work together across mode switches', async () => {
  render(<App />);
  await signIn();
  fireEvent.press(screen.getByRole('button', { name: 'Record voice message' }));
  fireEvent.press(await screen.findByRole('button', { name: 'Stop and transcribe' }));
  await screen.findByDisplayValue('Someone collapsed near the lawn stage toilets.');
  expect(posts.map(item => item.path)).toEqual(['/api/transcriptions']);
  fireEvent.press(screen.getByRole('button', { name: 'Submit incident' }));
  await screen.findByText('Your report is with the safety lead.');
  expect(posts.at(-1)?.body.reported_by).toBe('VOL-002');
  fireEvent.changeText(screen.getByLabelText('Is the person breathing normally?'), 'Yes, breathing normally.');
  fireEvent.press(screen.getByRole('button', { name: 'Send update' }));
  await screen.findByText('Update sent to the safety lead.');
  expect(posts.at(-1)?.body.reported_by).toBe('VOL-002');
  fireEvent.press(screen.getByRole('button', { name: 'View incident' }));
  await screen.findByText('Your manager reviews and approves the response.');
  expect(screen.queryByRole('button', { name: 'Approve response' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Modify response' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Resolve incident' })).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Add an incident update'), 'I am staying with them.');
  fireEvent.press(screen.getByRole('button', { name: 'Add update' }));
  await screen.findByText('Update added to the timeline.');
  expect(posts.at(-1)?.body.reported_by).toBe('VOL-002');
  await returnToMenu();
  fireEvent.press(screen.getByRole('button', { name: 'Continue as manager' }));
  fireEvent.press(await screen.findByRole('button', { name: 'Open INC-MERGED: Person collapsed' }));
  fireEvent.press(await screen.findByRole('button', { name: 'Approve response' }));
  await screen.findByText('Alert assigned volunteers');
  fireEvent.changeText(screen.getByLabelText('Message to responders'), 'Please confirm when you arrive.');
  fireEvent.press(screen.getByRole('button', { name: 'Send volunteer alert' }));
  await screen.findByText('Alert sent to assigned volunteers.');
  expect(posts.at(-1)).toEqual({ path: '/api/incidents/INC-MERGED/alerts', body: { message: 'Please confirm when you arrive.', alerted_by: 'Manager' } });
  await returnToMenu();
  await signIn();
  fireEvent.press(screen.getByRole('tab', { name: 'My alerts' }));
  await screen.findByText(/Manager alert.*Please confirm when you arrive/);
  fireEvent.press(screen.getByRole('button', { name: 'Open incident details' }));
  await screen.findByText('Your manager reviews and approves the response.');
  expect(screen.queryByRole('button', { name: 'Resolve incident' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Send volunteer alert' })).toBeNull();
});

test('switching from Report to My alerts stops recording without uploading', async () => {
  render(<App />);
  await signIn();
  fireEvent.press(screen.getByRole('button', { name: 'Record voice message' }));
  await screen.findByRole('button', { name: 'Stop and transcribe' });
  fireEvent.press(screen.getByRole('tab', { name: 'My alerts' }));
  await waitFor(() => expect(recorder.stop).toHaveBeenCalledTimes(1));
  fireEvent.press(screen.getByRole('tab', { name: 'Report' }));
  await screen.findByText('Recording stopped. Tap Transcribe recording when you are ready.');
  expect(posts).toEqual([]);
});

test('volunteer can reach connection setup before logging in', async () => {
  mockConnection.url = '';
  render(<App />);
  fireEvent.press(await screen.findByRole('button', { name: 'Continue as volunteer' }));
  fireEvent.press(screen.getByRole('button', { name: 'Connection settings' }));
  expect(screen.getByLabelText('Python server address')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Back to volunteer login' }));
  expect(screen.getByLabelText('4-digit volunteer ID')).toBeTruthy();
});

test('volunteer existing-report list only contains their own or assigned incidents', async () => {
  render(<App />);
  await signIn();
  fireEvent.press(screen.getByRole('button', { name: 'Update an existing incident' }));
  await screen.findByText('No active incidents reported by or assigned to you.');
  expect(screen.queryByRole('button', { name: 'Update INC-MERGED' })).toBeNull();
});
