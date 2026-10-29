import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Walks up from this module (src/ in dev, a dist/ chunk in production) to the server package. */
function findServerRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg) && JSON.parse(fs.readFileSync(pkg, 'utf8')).name === '@officeboard/server') {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('Could not locate the @officeboard/server package root');
    dir = parent;
  }
}

const serverRoot = findServerRoot();
const repoRoot = path.resolve(serverRoot, '..', '..');

const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(repoRoot, 'data'));

export const config = {
  isProduction: process.env.NODE_ENV === 'production',
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 8080),
  dataDir,
  dbFile: path.join(dataDir, 'officeboard.db'),
  photosDir: path.join(dataDir, 'photos'),
  secretKeyFile: path.join(dataDir, 'secret.key'),
  migrationsDir: path.join(serverRoot, 'drizzle'),
  webDist: path.resolve(process.env.WEB_DIST ?? path.join(repoRoot, 'apps', 'web', 'dist')),
  /** Max photo upload size in bytes. */
  maxUploadBytes: 40 * 1024 * 1024,
  sessionTtlDays: 30,
};

/** Identifies the deployed web build (its index.html timestamp); "dev" when Vite serves the app. */
export function webBuildId(): string {
  try {
    return String(Math.round(fs.statSync(path.join(config.webDist, 'index.html')).mtimeMs));
  } catch {
    return 'dev';
  }
}

export function ensureDataDirs(): void {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.photosDir, { recursive: true });
}
