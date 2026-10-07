// Expo's direct-dependency check misses incompatible auto-installed peer packages.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const mobile = path.resolve(process.argv[2] || path.join(__dirname, '../mobile'));
const requireMobile = createRequire(path.join(mobile, 'package.json'));
const semver = requireMobile('semver');
const expo = requireMobile('expo/package.json');
const expected = { ...requireMobile('expo/bundledNativeModules.json'), 'expo-modules-core': expo.dependencies['expo-modules-core'] };
const lock = JSON.parse(fs.readFileSync(path.join(mobile, 'package-lock.json'), 'utf8'));
const failures = [];
let checked = 0;
for (const [location, entry] of Object.entries(lock.packages)) {
  const name = location.match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)$/)?.[1];
  if (!name || !expected[name]) continue;
  const installed = JSON.parse(fs.readFileSync(path.join(mobile, location, 'package.json'), 'utf8'));
  checked++;
  if (installed.version !== entry.version || !semver.satisfies(installed.version, expected[name], { includePrerelease: true })) {
    failures.push(`${location}: installed ${installed.version}, lock ${entry.version}, SDK expects ${expected[name]}`);
  }
}
if (failures.length) {
  console.error(`Incompatible native dependencies for Expo ${expo.version}:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`Native dependency compatibility passed (${checked} packages, including transitive dependencies).`);
