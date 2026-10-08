const { withAndroidManifest, withMainApplication, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = function withPulseAlerts(config) {
  config = withAndroidManifest(config, config => {
    const manifest = config.modResults.manifest;
    manifest['uses-permission'] ??= [];
    for (const name of ['VIBRATE', 'POST_NOTIFICATIONS', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_SPECIAL_USE', 'WAKE_LOCK', 'REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', 'USE_FULL_SCREEN_INTENT']) {
      if (!manifest['uses-permission'].some(p => p.$['android:name'] === `android.permission.${name}`)) {
        manifest['uses-permission'].push({ $: { 'android:name': `android.permission.${name}` } });
      }
    }
    const app = manifest.application[0];
    app.activity ??= [];
    app.activity = app.activity.filter(a => a.$['android:name'] !== '.PulseAlarmActivity');
    app.activity.push({ $: { 'android:name': '.PulseAlarmActivity', 'android:exported': 'false',
      'android:showWhenLocked': 'true', 'android:turnScreenOn': 'true', 'android:excludeFromRecents': 'true',
      'android:launchMode': 'singleTop', 'android:theme': '@android:style/Theme.Material.NoActionBar' } });
    app.service ??= [];
    app.service = app.service.filter(s => s.$['android:name'] !== '.PulseAlertService');
    app.service.push({ $: { 'android:name': '.PulseAlertService', 'android:exported': 'false',
      'android:stopWithTask': 'false', 'android:foregroundServiceType': 'specialUse' },
      property: [{ $: { 'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
        'android:value': 'User-enabled on-duty festival emergency alert monitoring from a local coordination server.' } }] });
    return config;
  });
  config = withMainApplication(config, config => {
    if (!config.modResults.contents.includes('add(PulseAlertsPackage())')) {
      const marker = 'PackageList(this).packages.apply {';
      if (!config.modResults.contents.includes(marker)) throw new Error('Cannot register PulseAlertsPackage in MainApplication.');
      config.modResults.contents = config.modResults.contents.replace(marker, `${marker}\n              add(PulseAlertsPackage())`);
    }
    return config;
  });
  return withDangerousMod(config, ['android', async config => {
    const root = path.join(config.modRequest.platformProjectRoot, 'app/src/main');
    const directory = path.join(root, 'java/com/riverside/pulse');
    await fs.mkdir(directory, { recursive: true });
    for (const file of ['PulseAlertService.kt', 'PulseAlertsModule.kt', 'PulseAlarm.kt', 'PulseAlarmActivity.kt', 'PulseManagerUpdates.kt']) {
      await fs.copyFile(path.join(__dirname, 'android', file), path.join(directory, file));
    }
    await fs.mkdir(path.join(root, 'res/drawable'), { recursive: true });
    await fs.writeFile(path.join(root, 'res/drawable/pulse_notification.xml'),
      '<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"><path android:fillColor="#FFFFFFFF" android:pathData="M1,11h5l3,-8 6,17 3,-7h5v-2h-6l-2,4 -6,-17 -4,11h-4z" /></vector>');
    return config;
  }]);
};
