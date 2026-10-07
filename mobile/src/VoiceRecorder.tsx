import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { File } from 'expo-file-system';
import { errorMessage, transcribeRecording } from './api';
import { Button, Icon, Notice, palette, s } from './ui';

type Phase = 'idle' | 'starting' | 'recording' | 'stopping' | 'transcribing';
type Props = { base: string; active: boolean; disabled?: boolean; onTranscript: (text: string) => void; onBusyChange: (busy: boolean) => void };

function deleteRecording(uri: string | null) {
  if (!uri) return;
  try { const file = new File(uri); if (file.exists) file.delete(); } catch { /* OS cache cleanup is a fallback. */ }
}

export function VoiceRecorder({ base, active, disabled, onTranscript, onBusyChange }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const phaseRef = useRef<Phase>('idle');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [savedUri, setSavedUri] = useState<string | null>(null);
  const uriRef = useRef<string | null>(null);
  const activeRecording = useRef<string | null>(null);
  const mounted = useRef(true);
  const activeRef = useRef(active);
  activeRef.current = active;
  const callbacks = useRef({ onTranscript, onBusyChange });
  callbacks.current = { onTranscript, onBusyChange };
  const uploadController = useRef<AbortController | null>(null);
  const stopRef = useRef<(send: boolean) => Promise<void>>(async () => {});
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64000 }, status => {
    if (status.hasError && mounted.current) {
      setError('Recording was interrupted. Please try again or type your report.');
      changePhase('idle');
      void setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    } else if (status.isFinished && phaseRef.current === 'recording') {
      void stopRef.current(false);
    }
  });
  const state = useAudioRecorderState(recorder, 200);

  function changePhase(value: Phase) {
    phaseRef.current = value;
    if (mounted.current) { setPhase(value); callbacks.current.onBusyChange(value !== 'idle'); }
  }
  function saveUri(value: string | null) { uriRef.current = value; if (mounted.current) setSavedUri(value); }

  async function upload(uri: string) {
    if (phaseRef.current !== 'idle') return;
    changePhase('transcribing'); setError(''); setNote('');
    const controller = new AbortController();
    uploadController.current = controller;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 90000);
    try {
      const transcript = await transcribeRecording(base, uri, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      callbacks.current.onTranscript(transcript);
      deleteRecording(uri); saveUri(null);
      setNote('Transcript ready. Check the details, then submit.');
    } catch (err) {
      if (mounted.current && (!controller.signal.aborted || timedOut)) {
        setError(timedOut ? 'Transcription took too long. Your recording is saved here; retry or type your report.' : errorMessage(err));
      }
    } finally {
      clearTimeout(timer);
      if (uploadController.current === controller) { uploadController.current = null; changePhase('idle'); }
    }
  }

  async function start() {
    if (phaseRef.current !== 'idle' || !active || disabled) return;
    changePhase('starting'); setError(''); setNote('');
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setPermissionDenied(true);
        throw new Error('Microphone access is off. Enable it in Settings, or type your report.');
      }
      setPermissionDenied(false);
      if (!mounted.current || !activeRef.current || AppState.currentState !== 'active') { changePhase('idle'); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false });
      await recorder.prepareToRecordAsync();
      activeRecording.current = recorder.uri;
      if (!mounted.current || !activeRef.current || AppState.currentState !== 'active') {
        await recorder.stop();
        deleteRecording(recorder.uri);
        activeRecording.current = null;
        await setAudioModeAsync({ allowsRecording: false });
        changePhase('idle'); return;
      }
      deleteRecording(uriRef.current); saveUri(null);
      recorder.record({ forDuration: 115 });
      changePhase('recording');
    } catch (err) {
      if (mounted.current) setError(errorMessage(err));
      void setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      changePhase('idle');
    }
  }

  async function stop(send: boolean) {
    if (phaseRef.current !== 'recording') return;
    changePhase('stopping');
    try {
      await recorder.stop();
      const uri = recorder.uri;
      await setAudioModeAsync({ allowsRecording: false });
      if (!mounted.current) { deleteRecording(uri); return; }
      if (!uri) throw new Error('The recording could not be saved. Please try again.');
      saveUri(uri); activeRecording.current = null; changePhase('idle');
      if (send && activeRef.current && AppState.currentState === 'active') await upload(uri);
      else setNote('Recording stopped. Tap Transcribe recording when you are ready.');
    } catch (err) { if (mounted.current) setError(errorMessage(err)); changePhase('idle'); }
  }
  stopRef.current = stop;

  useEffect(() => {
    if (!active) void stopRef.current(false);
  }, [active]);
  useEffect(() => {
    if (phase === 'recording' && state.durationMillis >= 110000) void stopRef.current(true);
  }, [phase, state.durationMillis]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', next => { if (next !== 'active') void stopRef.current(false); });
    return () => listener.remove();
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      uploadController.current?.abort();
      deleteRecording(uriRef.current);
      // useAudioRecorder releases/stops native capture on unmount. Its cleanup
      // runs first, so do not call methods on that released native object here.
      deleteRecording(activeRecording.current);
      void setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      callbacks.current.onBusyChange(false);
    };
  }, [recorder]);

  function discard() {
    uploadController.current?.abort(); uploadController.current = null;
    deleteRecording(uriRef.current); saveUri(null); changePhase('idle'); setError(''); setNote('');
  }
  const recording = phase === 'recording';
  const working = ['starting', 'stopping', 'transcribing'].includes(phase);
  const seconds = Math.floor(state.durationMillis / 1000);
  return <View style={{ gap: 12 }}>
    <Text style={s.kicker}>SPEAK YOUR REPORT</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={recording ? 'Stop and transcribe' : 'Record voice message'}
      accessibilityState={{ disabled: working || disabled || !base }} disabled={working || disabled || !base}
      onPress={() => void (recording ? stop(true) : start())}
      style={[styles.record, recording && styles.recording, (working || disabled || !base) && { opacity: 0.6 }]}>
      {working ? <ActivityIndicator size="large" color="#fff" /> : <Icon name={recording ? 'stop' : 'mic'} color="#fff" size={38} />}
      <Text style={styles.recordTitle}>{recording ? 'Stop & transcribe' : phase === 'transcribing' ? 'Transcribing your message…' : phase === 'stopping' ? 'Finishing recording…' : working ? 'Preparing microphone…' : 'Tap to record'}</Text>
      <Text style={styles.recordHint}>{recording ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} · Recording` : 'Say what happened and where you are'}</Text>
    </Pressable>
    <Text style={s.small}>Tap once to start, again to finish. Up to 1 min 50 sec. English transcription.</Text>
    <Notice text={error} kind="error" /><Notice text={note} />
    {permissionDenied && <Button title="Open microphone settings" secondary onPress={() => void Linking.openSettings()} />}
    {savedUri && phase === 'idle' && <Button title="Transcribe recording" icon="refresh" disabled={!base || disabled} onPress={() => void upload(savedUri)} />}
    {savedUri && <Button title={phase === 'transcribing' ? 'Cancel transcription' : 'Discard recording'} secondary onPress={discard} />}
  </View>;
}

const styles = StyleSheet.create({
  record: { minHeight: 174, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: palette.green, borderRadius: 16, padding: 20 },
  recording: { backgroundColor: palette.red },
  recordTitle: { color: '#fff', fontSize: 21, fontWeight: '700', textAlign: 'center' },
  recordHint: { color: '#e3eddc', fontSize: 14, textAlign: 'center' },
});
