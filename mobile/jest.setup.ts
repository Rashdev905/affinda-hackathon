import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';
import { NativeModules } from 'react-native';

NativeModules.PulseAlerts = {
  start: jest.fn().mockResolvedValue(undefined), stop: jest.fn().mockResolvedValue(undefined),
  status: jest.fn().mockResolvedValue({ enabled: true, notificationsAllowed: true, vibrationEnabled: true,
    batteryAllowed: true, fullScreenAllowed: true, base: 'http://pc:8000', volunteerId: 'VOL-002' }),
  syncInbox: jest.fn().mockResolvedValue(undefined), silenceAlert: jest.fn().mockResolvedValue(undefined),
  getSilenced: jest.fn().mockResolvedValue([]), wakeSettings: jest.fn().mockResolvedValue(undefined),
  notificationSettings: jest.fn().mockResolvedValue(undefined),
  batterySettings: jest.fn().mockResolvedValue(undefined),
};

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-audio', () => {
  const recorder = {
    uri: 'file:///voice-report.m4a',
    prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
    record: jest.fn(), stop: jest.fn().mockResolvedValue(undefined),
  };
  return {
    __recorder: recorder,
    AudioModule: { requestRecordingPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }) },
    RecordingPresets: { HIGH_QUALITY: {} },
    setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
    useAudioRecorder: () => recorder,
    useAudioRecorderState: () => ({ durationMillis: 2000, isRecording: false }),
  };
});
jest.mock('expo-file-system', () => ({ File: jest.fn().mockImplementation(() => ({ exists: true, delete: jest.fn() })) }));
