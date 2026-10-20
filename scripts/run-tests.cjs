const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const tests = fs.readdirSync(__dirname).filter(name => /^test-.*\.cjs$/.test(name)).sort().map(name => path.join(__dirname, name));
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=2', ...tests], { cwd: root, stdio: 'inherit' });
if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
