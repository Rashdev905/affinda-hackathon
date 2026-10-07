import type { ExpoConfig } from 'expo/config';

const production = process.env.APP_VARIANT === 'production';

const config: ExpoConfig = {
  name: 'Pulse',
  slug: 'pulse-riverside',
  version: '0.5.2',
  scheme: 'pulse',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  platforms: ['ios', 'android'],
  newArchEnabled: true,
  splash: { backgroundColor: '#173d32' },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.riverside.pulse',
    infoPlist: {
      NSLocalNetworkUsageDescription: 'Pulse connects to your festival coordination server on the local network.',
      NSAppTransportSecurity: production ? {} : { NSAllowsArbitraryLoads: true, NSAllowsLocalNetworking: true },
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: { package: 'com.riverside.pulse', versionCode: 8 },
  plugins: [
    'expo-asset',
    ['expo-audio', { microphonePermission: 'Allow Pulse to record your voice report.', recordAudioAndroid: true }],
    ['expo-build-properties', { android: { usesCleartextTraffic: !production } }],
    './plugins/withPulseIcon',
    './plugins/withPulseAlerts',
  ],
  extra: { allowHttp: !production },
};

export default config;
