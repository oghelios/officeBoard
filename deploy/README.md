# Deploying Office Board on a Raspberry Pi

These steps assume a Raspberry Pi 4 running **Raspberry Pi OS (64-bit, with desktop; Bookworm or newer)**,
connected to the TV over HDMI, and logged in to the desktop automatically (the default).

## 1. Install

### Prepare the SD card

In Raspberry Pi Imager, choose **Raspberry Pi OS (64-bit)** (the desktop version, not Lite). In the
customisation settings, set a hostname (e.g. `officeboard`), your username and password, Wi-Fi, and
enable **SSH**. Boot the Pi with the TV connected to the HDMI port next to the power connector.

### Option A: single installer file (no git needed)

On your PC, build the installer:

```bash
pnpm package          # writes release/officeboard-installer.sh
```

Copy it to the Pi (USB stick, or `scp release/officeboard-installer.sh <user>@officeboard.local:~`),
then on the Pi (in a terminal or over `ssh`):

```bash
bash officeboard-installer.sh
```

It unpacks the app into `~/officeBoard`, runs the setup below, and offers to reboot. To update later,
package a new installer and run it the same way: code is replaced, `~/officeBoard/data` is kept, and the
TV reloads itself onto the new version. Run `bash officeboard-installer.sh --help` for options
(`--port`, `--no-1080p`, `--with-ir PIN`, `--reboot`, `--dir`, `--unpack-only`).

### Option B: from a git repository

```bash
sudo apt install -y git
git clone <your repo URL> ~/officeBoard
cd ~/officeBoard
chmod +x deploy/*.sh
./deploy/setup-pi.sh
sudo reboot
```

Update with `./deploy/update.sh`.

### What setup does

`setup-pi.sh` (run by the installer, and safe to re-run) does the following:

- Installs Node.js 24 LTS, pnpm, Chromium, `cec-utils` and `ir-keytable`, then installs dependencies and builds the app.
- Installs `officeboard.service` (systemd) so the server starts on boot and restarts if it crashes.
- Adds `deploy/kiosk.sh` to the desktop autostart. It waits for the server, then opens
  `http://localhost:8080/display` in Chromium kiosk mode and relaunches Chromium if it ever exits.
- Turns off screen blanking.
- Forces HDMI to **1920x1080@60** (`video=HDMI-A-1:1920x1080@60` in `/boot/firmware/cmdline.txt`; a
  backup is saved as `cmdline.txt.bak`). The TV upscales to 4K, which keeps a Pi 4 smooth.

Options: `--no-1080p` to leave the resolution alone, `--port 8090` to use another port,
`--with-ir 17` to enable an IR receiver on GPIO 17 (see section 4).

After the reboot, open `http://<pi-ip>:8080/admin` from any device on your network and create the
admin password. First-time setup is only allowed from the local network.

### Day-to-day

| Task | Command |
| --- | --- |
| Server status / logs | `systemctl status officeboard` / `journalctl -u officeboard -f` |
| Restart the server | `sudo systemctl restart officeboard` |
| Update to the latest code | Run a newer `officeboard-installer.sh`, or `./deploy/update.sh` for git installs |
| Reset a forgotten password | `node apps/server/dist/cli/set-password.js` |
| Reload the TV browser | Admin panel, Dashboard, "Reload display" |

Data (SQLite database, uploaded photos, encryption key) lives in `~/officeBoard/data`. Back up that
folder to keep everything.

## 2. Remote access with Cloudflare Tunnel

The tunnel makes an outbound connection from the Pi to Cloudflare, so **no router ports are opened**.
Cloudflare Access adds a login (email one-time code, Google, etc.) in front of the app, and the app's
own password sits behind that.

You need a domain on Cloudflare (free plan is fine).

### Option A: dashboard-managed tunnel (simplest)

1. In the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/), go to
   **Networks > Tunnels > Create a tunnel**, choose **Cloudflared**, and name it `officeboard`.
2. Choose **Debian / arm64**. Run the install command it shows on the Pi; it ends with
   `sudo cloudflared service install <TOKEN>` and sets cloudflared up as a systemd service.
3. Under **Public hostnames**, add `board.example.com` (your subdomain) pointing to
   `HTTP` `localhost:8080`.

### Option B: locally-managed tunnel

```bash
# Install cloudflared (see https://pkg.cloudflare.com/ for the apt repo), then:
cloudflared tunnel login
cloudflared tunnel create officeboard
cloudflared tunnel route dns officeboard board.example.com
sudo mkdir -p /etc/cloudflared
sudo cp ~/.cloudflared/<TUNNEL-ID>.json /etc/cloudflared/
sudo cp deploy/cloudflared-config.example.yml /etc/cloudflared/config.yml   # edit the ID and hostname
sudo cloudflared service install
```

### Protect it with Cloudflare Access

1. Zero Trust dashboard, **Access > Applications > Add an application > Self-hosted**.
2. Application domain: `board.example.com`.
3. Add a policy: **Action: Allow**, **Include: Emails** - your email address.
4. Save. Visiting `https://board.example.com` now asks for a Cloudflare login first, then the app password.

How the app treats tunnel traffic:

- Requests arriving through the tunnel are never treated as "local network", even though cloudflared
  connects from localhost. The app identifies them by Cloudflare's `CF-Connecting-IP` / `CF-Ray` headers.
- `/display` and the photo files need an admin session over the tunnel; on the LAN they are open so the TV
  works without a login.
- Login is rate limited to 5 attempts per minute per client IP.
- WebSockets work through the tunnel and Access with no extra configuration.

### Google Calendar over the tunnel

Google only accepts `http://localhost` or HTTPS redirect URIs. Once the tunnel works:

1. In the admin panel, **Integrations**, set **Public URL** to `https://board.example.com`.
2. Add `https://board.example.com/api/google/callback` as an authorized redirect URI on your Google
   OAuth client.
3. Click **Connect Google account**.

(Without a tunnel, connect from a browser on the Pi itself at `http://localhost:8080/admin`, and register
`http://localhost:8080/api/google/callback` with Google.)

## 3. Remote control

**Keyboard-style remotes** (USB 2.4 GHz dongles, Bluetooth remotes, "air mice") need no setup. They type
arrow keys, Enter, Esc and media keys into Chromium, which the display maps to commands. See
Settings > Remote control > Button mapping in the admin panel.

**TV remote over HDMI-CEC**: enable CEC on the TV (Samsung "Anynet+", LG "SimpLink", Sony "Bravia Sync"),
then turn on **Settings > Remote control > HDMI-CEC** in the admin panel. Arrow keys, OK, Back, Play/Pause
and the number keys are forwarded. The same CEC link powers the TV on and off on the **TV power schedule**.

## 4. IR receiver (optional)

1. Wire a 38 kHz IR receiver (e.g. TSOP38238 / VS1838B) to 3.3V, GND and GPIO 17.
2. Run `./deploy/setup-pi.sh --with-ir 17` (or add `dtoverlay=gpio-ir,gpio_pin=17` to
   `/boot/firmware/config.txt`) and reboot.
3. Find your remote's protocol and scancodes: `sudo ir-keytable -c -p all -t`.
4. Copy `deploy/ir-keymap.example.toml` to `/etc/rc_keymaps/officeboard.toml`, put in your scancodes,
   and load it with `sudo ir-keytable -c -w /etc/rc_keymaps/officeboard.toml`. To load it on boot, add
   `*  *  /etc/rc_keymaps/officeboard.toml` to `/etc/rc_maps.cfg`.
5. In the admin panel, turn on **Settings > Remote control > IR receiver**. The device is auto-detected;
   the "last input" readout confirms key presses are arriving.

The IR receiver also shows up as a keyboard to the desktop, so arrow keys reach Chromium directly. The
server drops a duplicate command that arrives from a second input within 250 ms, so a key press never
counts twice.

## Troubleshooting

- **Black screen / no browser**: `journalctl -u officeboard -n 50` for the server; run `deploy/kiosk.sh`
  from a terminal on the Pi to see Chromium errors.
- **"Reconnecting..." badge on the TV**: the display lost its WebSocket to the server; it retries
  automatically. Check the server is running.
- **Wrong resolution**: check `cat /proc/cmdline` contains `video=HDMI-A-1:1920x1080@60`. If your TV is
  on the second HDMI port, change it to `HDMI-A-2`.
- **CEC does nothing**: `echo scan | cec-client -s -d 1` should list the TV. Some TVs need CEC enabled
  in their settings and a Pi on HDMI port 0 (next to the power connector).
