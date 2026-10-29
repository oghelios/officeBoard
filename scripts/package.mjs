// Builds release/officeboard-installer.sh: a single self-extracting installer for a Raspberry Pi.
// It contains the project source (no node_modules, builds or data); the Pi installs and builds.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(root, 'release');
const outFile = path.join(releaseDir, 'officeboard-installer.sh');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13).replace('T', '.');
const version = `${pkg.version}+${stamp}`;

// Tracked and untracked files, minus anything git-ignored (node_modules, dist, data, release).
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\0')
  .filter((f) => f && fs.existsSync(path.join(root, f)) && !/^scratch-/.test(path.basename(f)));

for (const required of ['pnpm-lock.yaml', 'deploy/setup-pi.sh', 'apps/server/drizzle/0000_init.sql']) {
  if (!files.includes(required)) throw new Error(`Missing ${required}; is the project complete?`);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'officeboard-pkg-'));
const listFile = path.join(tmp, 'files.txt');
const tarFile = path.join(tmp, 'payload.tar.gz');
fs.writeFileSync(listFile, files.join('\n') + '\n');
execFileSync('tar', ['-czf', tarFile, '-T', listFile], { cwd: root, stdio: 'inherit' });

const header = fs
  .readFileSync(path.join(root, 'deploy', 'installer-header.sh'), 'utf8')
  .replace(/\r\n/g, '\n')
  .replaceAll('@VERSION@', version);
const payload = fs.readFileSync(tarFile).toString('base64').replace(/(.{76})/g, '$1\n');

fs.mkdirSync(releaseDir, { recursive: true });
fs.writeFileSync(outFile, `${header.trimEnd()}\n__OFFICEBOARD_PAYLOAD__\n${payload}\n`, { mode: 0o755 });
fs.rmSync(tmp, { recursive: true, force: true });

const kb = Math.round(fs.statSync(outFile).size / 1024);
console.log(`Packaged ${files.length} files, version ${version}`);
console.log(`Installer: ${path.relative(root, outFile)} (${kb} KB)`);
console.log('On the Pi: bash officeboard-installer.sh');
