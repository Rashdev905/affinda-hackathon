import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { AudioModule } from 'expo-audio';
import { VoiceRecorder } from '../VoiceRecorder';
import { ReportScreen } from '../screens/ReportScreen';

jest.mock('../connection', () => ({ useConnection: () => ({ url: 'http://pc:8000', ready: true }) }));
const recorder = require('expo-audio').__recorder;
const permission = AudioModule.requestRecordingPermissionsAsync as jest.Mock;
beforeEach(() => {
  permission.mockResolvedValue({ granted: true });
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
});

async function recordAndStop() {
  fireEvent.press(screen.getByRole('button', { name: 'Record voice message' }));
  fireEvent.press(await screen.findByRole('button', { name: 'Stop and transcribe' }));
}

test('voice is the primary input and the editable transcript is never submitted automatically', async () => {
  const posts: { url: string; body: any }[] = [];
  global.fetch = jest.fn(async (url, options) => {
    const isTranscription = String(url).endsWith('/transcriptions');
    if (options?.method === 'POST') posts.push({ url: String(url), body: options.body });
    const data = isTranscription ? { text: 'Someone fell at the lawn stage.' }
      : String(url).endsWith('/api/reports') ? {
        id: 'INC-VOICE', summary: 'Person fell', location: 'Lawn Stage Toilets',
        status: 'awaiting_clarification', urgency: 'high', observations: [],
        follow_up_question: 'Is the person breathing normally?',
      } : [];
    return { ok: true, json: async () => data } as Response;
  });
  render(<ReportScreen onOpen={jest.fn()} volunteerId="VOL-002" volunteerName="Jamie Chen" />);
  expect(screen.queryByLabelText('What’s happening?')).toBeNull();
  expect(screen.getByRole('button', { name: 'Submit incident' })).toBeDisabled();
  await recordAndStop();
  const field = await screen.findByDisplayValue('Someone fell at the lawn stage.');
  expect(posts).toHaveLength(1);
  expect(posts[0].url).toBe('http://pc:8000/api/transcriptions');
  expect(posts[0].body).toBeInstanceOf(FormData);
  fireEvent.changeText(field, 'Someone fell at the Lawn Stage toilets.');
  fireEvent.press(screen.getByRole('button', { name: 'Submit incident' }));
  await waitFor(() => expect(posts).toHaveLength(2));
  await screen.findByText('Your report is with the safety lead.');
  expect(JSON.parse(posts[1].body).text).toBe('Someone fell at the Lawn Stage toilets.');
  expect(JSON.parse(posts[1].body).reported_by).toBe('VOL-002');
});

test('denied microphone permission leaves typing available', async () => {
  permission.mockResolvedValue({ granted: false });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] });
  render(<ReportScreen onOpen={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: 'Record voice message' }));
  await screen.findByText('Microphone access is off. Enable it in Settings, or type your report.');
  expect(recorder.record).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Type a report instead' }));
  expect(screen.getByLabelText('What’s happening?')).toBeTruthy();
});

test('failed uploads preserve the recording and can be retried without re-recording', async () => {
  const onTranscript = jest.fn();
  global.fetch = jest.fn().mockRejectedValueOnce(new TypeError('offline'))
    .mockResolvedValueOnce({ ok: true, json: async () => ({ text: 'Help at North Gate.' }) });
  render(<VoiceRecorder base="http://pc:8000" active onTranscript={onTranscript} onBusyChange={jest.fn()} />);
  await recordAndStop();
  await screen.findByText(/Your recording is still here/);
  fireEvent.press(screen.getByRole('button', { name: 'Transcribe recording' }));
  await waitFor(() => expect(onTranscript).toHaveBeenCalledWith('Help at North Gate.'));
  expect(recorder.record).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Transcribe recording' })).toBeNull();
});

test('leaving the reporting tab stops recording without uploading it', async () => {
  const props = { base: 'http://pc:8000', onTranscript: jest.fn(), onBusyChange: jest.fn() };
  global.fetch = jest.fn();
  const view = render(<VoiceRecorder {...props} active />);
  fireEvent.press(screen.getByRole('button', { name: 'Record voice message' }));
  await screen.findByRole('button', { name: 'Stop and transcribe' });
  view.rerender(<VoiceRecorder {...props} active={false} />);
  await screen.findByText('Recording stopped. Tap Transcribe recording when you are ready.');
  expect(recorder.stop).toHaveBeenCalledTimes(1);
  expect(global.fetch).not.toHaveBeenCalled();
});

test('cancelling transcription aborts the upload and does not insert a late result', async () => {
  let complete: (response: any) => void = () => {};
  const onTranscript = jest.fn();
  global.fetch = jest.fn(() => new Promise(resolve => { complete = resolve; }));
  render(<VoiceRecorder base="http://pc:8000" active onTranscript={onTranscript} onBusyChange={jest.fn()} />);
  await recordAndStop();
  fireEvent.press(await screen.findByRole('button', { name: 'Cancel transcription' }));
  await act(async () => { complete({ ok: true, json: async () => ({ text: 'Late transcript' }) }); });
  expect(onTranscript).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Record voice message' })).toBeEnabled();
});
