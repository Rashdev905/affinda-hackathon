const fs = require('node:fs');
const oldPackages = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).packages;
const newPackages = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')).packages;
console.log(JSON.stringify(Object.keys(oldPackages).filter(location =>
  location.startsWith('node_modules/') && oldPackages[location].version !== newPackages[location]?.version
)));
