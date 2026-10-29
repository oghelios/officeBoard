# Office Board

A self-hosted status board for a TV, driven by a Raspberry Pi. It rotates through screens
(Home, Projects, Calendar, Forecast, Clock, Photos, System), any of which can be pinned to stay put,
and is managed from a password-protected web admin panel on your network or over a Cloudflare Tunnel.

- **Home**: clock, current weather, today's Google Calendar events, open reminders, rotating headlines
- **Projects**: project cards with nested to-do lists, managed in the admin panel
- **Calendar**: agenda / week / month views of Google Calendar with local reminders overlaid
- **Forecast**: 7-day and hourly forecast from Open-Meteo (no API key)
- **Clock**: large clock plus world clocks
- **Photos**: slideshow of uploaded photos
- **System**: Pi CPU, temperature, memory, disk, network and internet status

Remote control works with keyboard-style RF/Bluetooth remotes out of the box, plus optional IR
receivers and the TV's own remote over HDMI-CEC (which can also switch the TV on and off on a schedule).

## Layout

```
packages/shared   Types, zod schemas, screen registry metadata, WebSocket protocol
apps/server       Fastify + SQLite (Drizzle) API, WebSocket hub, rotation engine, data providers, input adapters
apps/web          React app: /display (TV) and /admin (management UI)
deploy/           Pi setup script, systemd unit, kiosk launcher, Cloudflare Tunnel guide
```

The server owns all state: it decides which screen is showing, caches data from Open-Meteo, RSS and
Google, and pushes everything to the display over a WebSocket. The display is a thin client, so
changes in the admin panel appear on the TV immediately.

## Development

Requires Node.js 22+ and pnpm.

```bash
pnpm install
pnpm dev
```

- Admin panel: http://localhost:5173/admin (create a password on first visit)
- Display: http://localhost:5173/display (best viewed in a 1920x1080 window)

The API server runs on port 8080 and Vite proxies `/api`, `/ws` and `/media` to it. Data is stored in
`./data` (git-ignored).

Other scripts: `pnpm build`, `pnpm start` (serves the built app on port 8080), `pnpm typecheck`,
`pnpm db:generate` (create a migration after editing `apps/server/src/db/schema.ts`), and
`pnpm package` (build the single-file Raspberry Pi installer in `release/`).

### Adding a screen type

1. Add the type, label, data sources and config fields to `SCREEN_TYPE_INFO` in `packages/shared/src/screens.ts`.
2. Create the component in `apps/web/src/display/screens/` and register it in `registry.ts`.

The admin panel builds the screen's options form from its config fields automatically.

## Deployment

See [deploy/README.md](deploy/README.md) for Raspberry Pi setup, Cloudflare Tunnel with Cloudflare
Access, and remote-control setup.
