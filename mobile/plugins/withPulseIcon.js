const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = function withPulseIcon(config) {
  config = withAndroidManifest(config, config => {
    const application = config.modResults.manifest.application[0];
    application.$['android:icon'] = '@drawable/pulse_icon';
    application.$['android:roundIcon'] = '@drawable/pulse_icon';
    return config;
  });
  return withDangerousMod(config, ['android', async config => {
    const directory = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/drawable');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'pulse_icon.xml'), `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
  <path android:fillColor="#173D32" android:pathData="M0,0h108v108h-108z" />
  <path android:fillColor="@android:color/transparent" android:strokeColor="#D5EF96" android:strokeWidth="6" android:strokeLineCap="round" android:strokeLineJoin="round" android:pathData="M22,54h17l9,-23 14,45 9,-22h15" />
</vector>
`);
    return config;
  }]);
};
