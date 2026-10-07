import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ReportScreen } from '../screens/ReportScreen';
import { IncidentScreen } from '../screens/IncidentScreen';
import { ConnectionScreen } from '../screens/ConnectionScreen';
import type { Incident, Resource } from '../types';

const mockSave = jest.fn().mockResolvedValue(undefined);
jest.mock('../connection', () => ({ useConnection: () => ({ url: 'http://pc:8000', ready: true, save: mockSave }) }));

const resource: Resource = { id: 'VOL-002', name: 'Jamie Chen', role: 'First-aid volunteer', zone: 'Lawn Stage', skills: ['first_aid'], qualifications: [], available: true, current_assignment: null, status: 'available' };

function initial(): Incident {
  return {
    id: 'INC-TEST', type: 'medical', summary: 'Person collapsed and appears dizzy', location: 'Lawn Stage Toilets',
    urgency: 'high', status: 'awaiting_clarification', observations: ['Person reportedly conscious'],
    missing_information: ['breathing_status'], follow_up_question: 'Is the person breathing normally?',
    reported_by: 'VOL-014', created_at: '2026-10-07T01:00:00Z', updated_at: '2026-10-07T01:00:00Z',
    recommendation: { recommended_responders: ['VOL-002'], alternatives: [], actions: ['Ask Jamie to attend.'], reasoning: ['Available and qualified.'], conflicts: [], requires_human_approval: true },
    timeline: [], last_decision: null, assigned_responders: [], resolution_note: null, draft_report: null, parser_mode: 'mock',
  };
}

let incident: Incident;
let calls: { path: string; body: any }[];
beforeEach(() => {
  incident = initial(); calls = [];
  global.fetch = jest.fn(async (url, options) => {
    const path = String(url).replace('http://pc:8000', '');
    const body = options?.body ? JSON.parse(String(options.body)) : null;
    if (body) calls.push({ path, body });
    if (path.endsWith('/updates')) incident = { ...incident, status: 'awaiting_approval', missing_information: [], follow_up_question: null };
    if (path.endsWith('/decision')) incident = {
      ...incident, status: body.decision === 'reject' ? 'awaiting_approval' : 'response_dispatched',
      last_decision: body.decision, assigned_responders: body.decision === 'reject' ? [] : body.responder_ids ?? ['VOL-002'],
    };
    if (path.endsWith('/resolve')) incident = { ...incident, status: 'resolved', assigned_responders: [], draft_report: `DRAFT ${body.note}` };
    const data = path === '/api/resources' ? [resource] : path === '/api/incidents' ? [incident] : incident;
    return { ok: true, json: async () => data } as Response;
  });
});

test('native report form submits a fixture, answers clarification, and opens the incident', async () => {
  const open = jest.fn();
  render(<ReportScreen onOpen={open} />);
  fireEvent.press(screen.getByRole('button', { name: 'Medical +' }));
  fireEvent.press(screen.getByRole('button', { name: 'Submit incident' }));
  await screen.findByText('Your report is with the safety lead.');
  expect(calls[0].body.text).toContain('Someone collapsed');
  fireEvent.changeText(screen.getByLabelText('Is the person breathing normally?'), 'Yes, breathing normally.');
  fireEvent.press(screen.getByRole('button', { name: 'Send update' }));
  await screen.findByText('Update sent to the safety lead.');
  expect(calls[1].path).toBe('/api/incidents/INC-TEST/updates');
  fireEvent.press(screen.getByRole('button', { name: 'View incident' }));
  expect(open).toHaveBeenCalledWith('INC-TEST');
});

test('native approval and resolution send the reviewed IDs and the outcome', async () => {
  render(<IncidentScreen id="INC-TEST" onBack={jest.fn()} />);
  fireEvent.press(await screen.findByRole('button', { name: 'Approve response' }));
  await screen.findByText('Approved response');
  expect(calls[0].body).toEqual({ decision: 'approve', responder_ids: ['VOL-002'] });
  fireEvent.press(screen.getByRole('button', { name: 'Resolve incident' }));
  fireEvent.changeText(screen.getByLabelText('Resolution note'), 'Team completed the response.');
  fireEvent.press(screen.getByRole('button', { name: 'Confirm resolution' }));
  await screen.findByText('Draft incident report');
  expect(calls.at(-1)?.body.note).toBe('Team completed the response.');
  expect(screen.getByRole('button', { name: 'Share draft report' })).toBeTruthy();
});

test('native rejection and modified approval require a reason', async () => {
  render(<IncidentScreen id="INC-TEST" onBack={jest.fn()} />);
  fireEvent.press(await screen.findByRole('button', { name: 'Reject suggestion' }));
  expect(screen.getByRole('button', { name: 'Confirm rejection' })).toBeDisabled();
  fireEvent.changeText(screen.getByLabelText('Reason for this decision'), 'Need a revised response.');
  fireEvent.press(screen.getByRole('button', { name: 'Confirm rejection' }));
  await screen.findByText('Suggestion rejected. No new resources assigned.');
  fireEvent.press(screen.getByRole('button', { name: 'Modify response' }));
  fireEvent.changeText(screen.getByLabelText('Reason for this decision'), 'Confirmed availability by radio.');
  fireEvent.changeText(screen.getByLabelText('Response actions (one per line)'), 'Attend the toilets and report to the safety lead.');
  fireEvent.press(screen.getByRole('button', { name: 'Approve modified response' }));
  await screen.findByText('Modified response approved.');
  expect(calls.at(-1)?.body).toMatchObject({ decision: 'modify', responder_ids: ['VOL-002'], actions: ['Attend the toilets and report to the safety lead.'] });
});

test('connection screen verifies and saves the phone server address', async () => {
  render(<ConnectionScreen />);
  fireEvent.changeText(screen.getByLabelText('Python server address'), 'http://192.168.1.42:8000');
  fireEvent.press(screen.getByRole('button', { name: 'Test & save connection' }));
  await waitFor(() => expect(mockSave).toHaveBeenCalledWith('http://192.168.1.42:8000'));
  await screen.findByText('Connected to Pulse. You can now report and review incidents.');
});
