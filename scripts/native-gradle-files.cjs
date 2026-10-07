// Do not descend into generated native output: older Windows builds can leave
// paths there that PowerShell cannot enumerate even when the files are excluded.
const fs = require('node:fs');
const path = require('node:path');
const skip = new Set(['.cxx', '.gradle', 'build', '.git']);
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const location = path.join(directory, entry.name);
    if (entry.isDirectory() && !skip.has(entry.name)) walk(location);
    else if (entry.isFile() && /^build\.gradle(?:\.kts)?$/.test(entry.name)) console.log(location);
  }
}
walk(process.argv[2]);
