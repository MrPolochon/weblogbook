const { execFileSync } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
if (process.platform !== 'win32') { console.log('Windows PTT helper: built on Windows only.'); process.exit(0); }
const root = path.resolve(__dirname, '..');
mkdirSync(path.join(root, 'native-bin'), { recursive: true });
const compiler = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
execFileSync(compiler, ['/nologo', '/optimize+', '/target:exe', '/platform:anycpu',
  '/out:' + path.join(root, 'native-bin', 'PttKey.exe'), path.join(root, 'native', 'PttKey.cs')], { stdio: 'inherit', windowsHide: true });
