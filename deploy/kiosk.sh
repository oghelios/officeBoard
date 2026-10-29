#!/usr/bin/env bash
# Launches Chromium full-screen on the Office Board display and relaunches it if it exits.
# Started from the desktop session's autostart (see setup-pi.sh).
set -u

PORT="${OB_PORT:-8080}"
URL="http://localhost:${PORT}/display"
PROFILE_DIR="$HOME/.config/officeboard-chromium"
LOCK_FILE="${XDG_RUNTIME_DIR:-/tmp}/officeboard-kiosk.lock"

# Only one kiosk loop, even if several autostart mechanisms fire.
exec 9>"$LOCK_FILE"
flock -n 9 || exit 0

BROWSER="$(command -v chromium-browser || command -v chromium)"
if [[ -z "$BROWSER" ]]; then
  echo "Chromium is not installed" >&2
  exit 1
fi

# Belt and braces for 1080p: the kernel cmdline sets it at boot, this covers hot-plugged TVs.
if [[ -n "${WAYLAND_DISPLAY:-}" ]] && command -v wlr-randr >/dev/null; then
  OUTPUT="$(wlr-randr 2>/dev/null | awk '/^HDMI/ {print $1; exit}')"
  [[ -n "$OUTPUT" ]] && wlr-randr --output "$OUTPUT" --mode 1920x1080@60 2>/dev/null || true
elif [[ -n "${DISPLAY:-}" ]] && command -v xrandr >/dev/null; then
  xrandr --output HDMI-1 --mode 1920x1080 --rate 60 2>/dev/null || true
  xset s off -dpms s noblank 2>/dev/null || true
fi

for _ in $(seq 1 120); do
  curl -fsS "http://localhost:${PORT}/api/health" >/dev/null 2>&1 && break
  sleep 1
done

while true; do
  # Suppress Chromium's "restore pages?" bubble after power loss.
  PREFS="$PROFILE_DIR/Default/Preferences"
  if [[ -f "$PREFS" ]]; then
    sed -i 's/"exited_cleanly":false/"exited_cleanly":true/; s/"exit_type":"[^"]*"/"exit_type":"Normal"/' "$PREFS"
  fi

  "$BROWSER" \
    --kiosk "$URL" \
    --user-data-dir="$PROFILE_DIR" \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-features=Translate,TranslateUI \
    --overscroll-history-navigation=0 \
    --disable-pinch \
    --check-for-update-interval=31536000 \
    --password-store=basic \
    --no-first-run \
    --start-fullscreen \
    >/dev/null 2>&1

  sleep 3
done
