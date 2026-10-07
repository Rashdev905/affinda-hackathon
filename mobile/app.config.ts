import type { ExpoConfig } from 'expo/config';

const production = process.env.APP_VARIANT === 'production';

const config: ExpoConfig = {
  name: 'Pulse',
  slug: 'pulse-riverside',
  version: '0.1.0',
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
  android: { package: 'com.riverside.pulse' },
  plugins: [
    ['expo-build-properties', { android: { usesCleartextTraffic: !production } }],
    './plugins/withPulseIcon',
  ],
  extra: { allowHttp: !production },
};

export default config;
