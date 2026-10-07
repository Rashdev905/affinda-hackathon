import { request, validateServer } from '../api';

test('validates server URLs and the production HTTPS requirement', () => {
  expect(validateServer(' http://192.168.1.42:8000/ ')).toBe('http://192.168.1.42:8000');
  expect(validateServer('https://pulse.example.com')).toBe('https://pulse.example.com');
  expect(() => validateServer('file:///local')).toThrow();
  expect(() => validateServer('http://name:password@example.com')).toThrow();
  expect(() => validateServer('http://192.168.1.42:8000', false)).toThrow('HTTPS');
});

test('surfaces assignment conflicts without retrying or substituting resources', async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ detail: 'Jamie is no longer available.' }) });
  global.fetch = fetchMock;
  await expect(request('http://pc:8000', '/api/incidents/INC-1/decision', { decision: 'approve', responder_ids: ['VOL-002'] })).rejects.toThrow('Jamie is no longer available.');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('reports offline failures and missing connection', async () => {
  global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
  await expect(request('http://pc:8000', '/health')).rejects.toThrow('Cannot reach the Python server');
  await expect(request('', '/health')).rejects.toThrow('Connection');
});
