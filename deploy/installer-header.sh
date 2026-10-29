#!/usr/bin/env bash
# Office Board installer (@VERSION@).
#
# Copy this file to a Raspberry Pi running Raspberry Pi OS (64-bit, desktop) and run:
#   bash officeboard-installer.sh
#
# It unpacks the app into ~/officeBoard and runs deploy/setup-pi.sh. Running a newer installer
# later updates the app in place; the data folder (database, photos, settings) is kept.
#
# Options:
#   --dir PATH        install location (default: ~/officeBoard)
#   --port N          web server port (default: 8080)
#   --no-1080p        don't force the HDMI output to 1920x1080
#   --with-ir PIN     enable an IR receiver on this GPIO pin (e.g. 17)
#   --reboot          reboot automatically when finished
#   --no-reboot       don't offer to reboot
#   --unpack-only     only unpack/update the files; skip system setup
set -euo pipefail

INSTALL_DIR="$HOME/officeBoard"
REBOOT="ask"
UNPACK_ONLY=0
SETUP_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir) INSTALL_DIR="${2:?--dir needs a path}"; shift ;;
    --port) SETUP_ARGS+=(--port "${2:?--port needs a value}"); shift ;;
    --with-ir) SETUP_ARGS+=(--with-ir "${2:?--with-ir needs a GPIO pin}"); shift ;;
    --no-1080p) SETUP_ARGS+=(--no-1080p) ;;
    --reboot) REBOOT="yes" ;;
    --no-reboot) REBOOT="no" ;;
    --unpack-only) UNPACK_ONLY=1 ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 1 ;;
  esac
  shift
done

say() { printf '\n\033[1;32m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }

[[ "$(id -u)" -ne 0 ]] || fail "Run this as your normal user, without sudo. It will ask for your password when needed."
[[ "$(uname -s)" == "Linux" ]] || fail "This installer is for Raspberry Pi OS (Linux)."

if [[ "$UNPACK_ONLY" -eq 0 ]]; then
  command -v apt-get >/dev/null || fail "apt-get not found; this installer needs Raspberry Pi OS or another Debian-based system."
  sudo -v || fail "This user needs sudo rights."
  ARCH="$(uname -m)"
  if [[ "$ARCH" != "aarch64" ]]; then
    echo "Warning: this is a $ARCH system. Office Board is tested on 64-bit Raspberry Pi OS (aarch64)." >&2
    echo "Re-flash with the 64-bit image if the install fails." >&2
  fi
  if [[ -z "${XDG_CURRENT_DESKTOP:-}${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]] && ! systemctl is-enabled -q lightdm 2>/dev/null; then
    echo "Note: no desktop session detected. The kiosk needs the desktop version of Raspberry Pi OS." >&2
  fi
fi

PAYLOAD_LINE="$(awk '/^__OFFICEBOARD_PAYLOAD__$/ { print NR + 1; exit }' "$0")"
[[ -n "$PAYLOAD_LINE" ]] || fail "This installer file is damaged (payload missing). Re-copy it and try again."

say "Office Board @VERSION@: unpacking into $INSTALL_DIR"
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT
tail -n +"$PAYLOAD_LINE" "$0" | base64 -d | tar -xz -C "$STAGING"

mkdir -p "$INSTALL_DIR"
if [[ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]]; then
  echo "Existing install found; updating code and keeping $INSTALL_DIR/data"
  # Remove the old code (but not data/ or installed dependencies) so deleted files don't linger.
  find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 ! -name data ! -name node_modules -exec rm -rf {} +
fi
cp -a "$STAGING"/. "$INSTALL_DIR"/

# Files may have been edited on Windows; make sure scripts have Unix line endings and are executable.
find "$INSTALL_DIR/deploy" -type f \( -name '*.sh' -o -name '*.service' \) -exec sed -i 's/\r$//' {} +
chmod +x "$INSTALL_DIR"/deploy/*.sh

if [[ "$UNPACK_ONLY" -eq 1 ]]; then
  say "Unpacked to $INSTALL_DIR. Run $INSTALL_DIR/deploy/setup-pi.sh to finish setup."
  exit 0
fi

say "Running setup (installs system packages, Node.js, builds the app; about 10-15 minutes)"
"$INSTALL_DIR/deploy/setup-pi.sh" "${SETUP_ARGS[@]}"

if [[ "$REBOOT" == "yes" ]]; then
  sudo reboot
elif [[ "$REBOOT" == "ask" && -t 0 ]]; then
  read -r -p $'\nReboot now to start the kiosk display? [Y/n] ' answer
  [[ "${answer:-Y}" =~ ^[Yy] ]] && sudo reboot
fi
exit 0
