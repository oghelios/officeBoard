import readline from 'node:readline/promises';
import { ensureDataDirs } from '../config.js';
import { createDb } from '../db/index.js';
import { AuthService, MIN_PASSWORD_LENGTH } from '../services/auth.js';
import { SettingsService } from '../services/settings.js';

/** Resets the admin password from the Pi's terminal, e.g. if it was forgotten. */
async function main() {
  ensureDataDirs();
  let password = process.argv[2];
  if (!password) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question(`New admin password (min ${MIN_PASSWORD_LENGTH} chars): `);
    rl.close();
  }
  const db = createDb();
  const auth = new AuthService(db, new SettingsService(db));
  await auth.setPassword(password.trim());
  auth.deleteAllSessions();
  console.log('Admin password updated. All existing sessions were signed out.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
