#!/usr/bin/env bash
# Setup for Office Board on Raspberry Pi OS (64-bit, desktop; Bookworm or newer). Safe to re-run.
# Run from the repository root as your normal user (not root):
#   ./deploy/setup-pi.sh [--no-1080p] [--with-ir GPIO_PIN] [--port 8080]
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_USER="$(id -un)"
PORT=8080
FORCE_1080P=1
IR_PIN=""
NODE_MAJOR=24

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-1080p) FORCE_1080P=0 ;;
    --with-ir) IR_PIN="${2:?--with-ir needs a GPIO pin number, e.g. 17}"; shift ;;
    --port) PORT="${2:?--port needs a value}"; shift ;;
    -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

if [[ "$RUN_USER" == "root" ]]; then
  echo "Run this as your desktop user, not root (it uses sudo where needed)." >&2
  exit 1
fi

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

step "Installing system packages"
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg git build-essential python3 cec-utils ir-keytable
if ! command -v chromium-browser >/dev/null && ! command -v chromium >/dev/null; then
  sudo apt-get install -y chromium || sudo apt-get install -y chromium-browser
fi
# Used by kiosk.sh to force 1080p under Wayland; not available on every release.
sudo apt-get install -y wlr-randr 2>/dev/null || true

if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]]; then
  step "Installing Node.js ${NODE_MAJOR}.x"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
fi
# The lockfile is written by pnpm 12; keep the same major.
if ! command -v pnpm >/dev/null || [[ "$(pnpm --version | cut -d. -f1)" != "12" ]]; then
  sudo npm install -g pnpm@12
fi

step "Installing dependencies and building (this takes a few minutes on a Pi)"
cd "$REPO_DIR"
export CI=true
pnpm install --frozen-lockfile
pnpm build

step "Granting access to input devices (IR) and HDMI-CEC"
sudo usermod -aG input,video "$RUN_USER"

step "Installing the officeboard systemd service"
sed -e "s|@USER@|$RUN_USER|g" -e "s|@REPO@|$REPO_DIR|g" -e "s|@PORT@|$PORT|g" \
  "$REPO_DIR/deploy/officeboard.service" | sudo tee /etc/systemd/system/officeboard.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable officeboard.service
# Restart (not just start) so re-running this script after an update picks up the new build.
sudo systemctl restart officeboard.service

step "Configuring the kiosk browser to start with the desktop"
chmod +x "$REPO_DIR/deploy/kiosk.sh"
KIOSK_CMD="$REPO_DIR/deploy/kiosk.sh"
mkdir -p "$HOME/.config/autostart"
cat >"$HOME/.config/autostart/officeboard-kiosk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Office Board kiosk
Exec=env OB_PORT=$PORT $KIOSK_CMD
X-GNOME-Autostart-enabled=true
EOF
# labwc (current Pi OS default) and wayfire (earlier Bookworm images) have their own autostart files.
# kiosk.sh holds a lock, so being started from more than one place is harmless.
mkdir -p "$HOME/.config/labwc"
# A per-user labwc autostart replaces the system one, so start from a copy to keep the desktop intact.
if [[ ! -f "$HOME/.config/labwc/autostart" && -f /etc/xdg/labwc/autostart ]]; then
  cp /etc/xdg/labwc/autostart "$HOME/.config/labwc/autostart"
fi
touch "$HOME/.config/labwc/autostart"
grep -q "officeboard" "$HOME/.config/labwc/autostart" || \
  echo "env OB_PORT=$PORT $KIOSK_CMD &  # officeboard" >>"$HOME/.config/labwc/autostart"
if [[ -f "$HOME/.config/wayfire.ini" ]] && ! grep -q "officeboard" "$HOME/.config/wayfire.ini"; then
  if grep -q '^\[autostart\]' "$HOME/.config/wayfire.ini"; then
    sed -i "/^\[autostart\]/a officeboard = env OB_PORT=$PORT $KIOSK_CMD" "$HOME/.config/wayfire.ini"
  else
    printf '\n[autostart]\nofficeboard = env OB_PORT=%s %s\n' "$PORT" "$KIOSK_CMD" >>"$HOME/.config/wayfire.ini"
  fi
fi

step "Disabling screen blanking"
if command -v raspi-config >/dev/null; then
  sudo raspi-config nonint do_blanking 1 || true
fi

BOOT_DIR=/boot/firmware
[[ -d "$BOOT_DIR" ]] || BOOT_DIR=/boot

if [[ "$FORCE_1080P" == "1" && -f "$BOOT_DIR/cmdline.txt" ]]; then
  step "Forcing HDMI output to 1920x1080@60 (the TV upscales to 4K)"
  if ! grep -q "video=HDMI-A-1:" "$BOOT_DIR/cmdline.txt"; then
    sudo cp "$BOOT_DIR/cmdline.txt" "$BOOT_DIR/cmdline.txt.bak"
    sudo sed -i '1 s|$| video=HDMI-A-1:1920x1080@60|' "$BOOT_DIR/cmdline.txt"
  fi
fi

if [[ -n "$IR_PIN" && -f "$BOOT_DIR/config.txt" ]]; then
  step "Enabling the gpio-ir receiver overlay on GPIO $IR_PIN"
  if ! grep -q "^dtoverlay=gpio-ir" "$BOOT_DIR/config.txt"; then
    echo "dtoverlay=gpio-ir,gpio_pin=$IR_PIN" | sudo tee -a "$BOOT_DIR/config.txt" >/dev/null
  fi
fi

IP="$(hostname -I | awk '{print $1}')"
step "Done"
cat <<EOF
Office Board is running on port $PORT.

  Admin panel: http://$IP:$PORT/admin   (create your password from a device on this network)
  Display:     http://localhost:$PORT/display (opened automatically in kiosk mode)

Reboot to apply the display resolution, group membership and kiosk autostart:
  sudo reboot

Next: see deploy/README.md for Cloudflare Tunnel (remote access) and remote-control setup.
EOF
