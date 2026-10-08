import { fireEvent, render, screen } from '@testing-library/react-native';
import { MapScreen } from '../screens/MapScreen';
import { ReportScreen } from '../screens/ReportScreen';
import { festivalZones, locationZone, responderPositions } from '../festivalMap';
import type { Incident, Resource } from '../types';

jest.mock('../connection', () => ({ useConnection: () => ({ url: 'http://pc:8000', ready: true }) }));

const alex: Resource = { id: 'VOL-001', name: 'Alex Morgan', role: 'General volunteer', zone: 'Lawn Stage',
  skills: ['communication'], qualifications: [], available: true, current_assignment: null, status: 'available' };
const security: Resource = { ...alex, id: 'SEC-001', name: 'Security North', role: 'Security staff', zone: 'North Gate', skills: ['security'] };
const ops: Resource = { ...alex, id: 'OPS-001', name: 'Site Operations', role: 'Site operations team', zone: 'Food Village', skills: ['site_operations'] };
const incident: Incident = {
  id: 'INC-MAP', type: 'medical', summary: 'Person needs help', location: 'North Gate Toilets',
  status: 'awaiting_approval', urgency: 'high', priority_score: 90, observations: [],
  reported_by: alex.id, created_at: '', updated_at: '', missing_information: [], follow_up_question: null,
  recommendation: { recommended_responders: [], alternatives: [], actions: [], reasoning: [], conflicts: [], requires_human_approval: true },
  timeline: [], last_decision: null, assigned_responders: [], resolution_note: null, draft_report: null, parser_mode: 'mock',
};
let resources: Resource[];
let incidents: Incident[];
let posts: any[];

beforeEach(() => {
  resources = [alex, security, ops];
  incidents = [incident, { ...incident, id: 'INC-DONE', status: 'resolved' }];
  posts = [];
  global.fetch = jest.fn(async (url, options) => {
    const path = String(url).replace('http://pc:8000', '');
    if (options?.method === 'POST') posts.push(JSON.parse(String(options.body)));
    const data = path === '/api/resources' ? resources : path === '/api/incidents' ? incidents : incident;
    return { ok: true, json: async () => data } as Response;
  });
});

test('mock coordinates are repeatable within the stored zone, independent of fetch order', () => {
  const first = responderPositions([alex, security, ops]);
  expect(responderPositions([ops, security, alex])).toEqual(first);
  for (const point of first) {
    const zone = festivalZones.find(zone => zone.name === point.resource.zone)!;
    expect(point.x).toBeGreaterThan(zone.x);
    expect(point.x).toBeLessThan(zone.x + 41);
    expect(point.y).toBeGreaterThan(zone.y);
    expect(point.y).toBeLessThan(zone.y + 24);
  }
  expect(locationZone('north gate Toilets')).toBe('North Gate');
  expect(locationZone('Location to confirm')).toBeUndefined();
  expect(responderPositions([{ ...alex, zone: 'Unknown area' }])).toEqual([]);
});

test('manager can inspect responders and switch zone filters', async () => {
  render(<MapScreen onOpen={jest.fn()} />);
  await screen.findByRole('button', { name: 'Select Alex Morgan' });
  expect(screen.getByText('Mock positions')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: /Security North, Security staff, North Gate/ }));
  expect(screen.getByText('Selected responder')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Select Alex Morgan' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Show Lawn Stage' }));
  expect(screen.getByRole('button', { name: 'Select Alex Morgan' })).toBeTruthy();
});

test('manager map opens active incidents and omits resolved markers', async () => {
  const open = jest.fn();
  render(<MapScreen onOpen={open} />);
  await screen.findByRole('button', { name: '1 active incidents at North Gate' });
  expect(screen.queryByRole('button', { name: 'Find my position' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Show North Gate' }));
  fireEvent.press(screen.getByRole('button', { name: 'View map incident INC-MAP' }));
  expect(open).toHaveBeenCalledWith('INC-MAP');
  expect(screen.queryByRole('button', { name: 'View map incident INC-DONE' })).toBeNull();
});

test('unknown locations stay in the lists instead of getting invented coordinates', async () => {
  resources = [{ ...alex, zone: 'Off-site' }];
  incidents = [{ ...incident, location: 'Location to confirm' }];
  render(<MapScreen onOpen={jest.fn()} />);
  await screen.findByText(/1 responders and 1 incidents have locations outside this layout/);
  expect(screen.getByRole('button', { name: 'Select Alex Morgan' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'View map incident INC-MAP' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Alex Morgan, General volunteer/ })).toBeNull();
});

test('connection failure leaves the schematic usable and shows the failure', async () => {
  global.fetch = jest.fn().mockRejectedValue(new TypeError('offline'));
  render(<MapScreen onOpen={jest.fn()} />);
  await screen.findByText(/Cannot reach the Python server/);
  expect(screen.getByTestId('festival-map')).toBeTruthy();
  expect(screen.getByText('Connect to the server to load responders.')).toBeTruthy();
});

test('report displays the stored zone and submits the unaltered text and volunteer ID', async () => {
  render(<ReportScreen volunteerId={alex.id} volunteerName={alex.name} onOpen={jest.fn()} />);
  await screen.findByText('Reporting from Lawn Stage · assigned demo zone');
  fireEvent.press(screen.getByRole('button', { name: 'Type a report instead' }));
  fireEvent.changeText(screen.getByLabelText('What’s happening?'), 'Someone is dying');
  fireEvent.press(screen.getByRole('button', { name: 'Submit incident' }));
  await screen.findByText('Your report is with the safety lead.');
  expect(posts).toEqual([{ text: 'Someone is dying', reported_by: alex.id }]);
});
