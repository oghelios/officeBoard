import { buildServer, createContext, startBackground, stopBackground } from './app.js';
import { config, ensureDataDirs } from './config.js';

ensureDataDirs();
const ctx = createContext();
const app = await buildServer(ctx);

try {
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
startBackground(ctx);

if (!ctx.auth.hasPassword()) {
  app.log.warn('No admin password set yet. Open /admin from your local network to create one.');
}

let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info(`${signal} received, shutting down`);
    stopBackground(ctx);
    await app.close();
    process.exit(0);
  });
}
