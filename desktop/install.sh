#!/usr/bin/env bash
# Install the Family Organizer desktop shell on this Pi and start it at login.
#
#   ./install.sh                          # install + autostart, keep default URL
#   ./install.sh --url https://host.tld   # point this display at another server
#   ./install.sh --no-autostart           # menu entry only, no launch at login
#   ./install.sh --no-respawn             # don't auto-restart, so Alt+F4 really closes it
#   ./install.sh --no-osk                 # skip the on-screen keyboard autostart
#
# Run `npm run build` first — this script installs the .deb that produces.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_NAME="family-organizer-desktop"
AUTOSTART=1
RESPAWN=1
OSK=1
URL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)          URL="${2:?--url needs a value}"; shift 2 ;;
    --no-autostart) AUTOSTART=0; shift ;;
    --no-respawn)   RESPAWN=0; shift ;;
    --no-osk)       OSK=0; shift ;;
    -h|--help)      sed -n '2,11p' "$0"; exit 0 ;;
    *)              echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

# ── 1. Install the package ──
DEB="$(ls -t "$SCRIPT_DIR"/src-tauri/target/release/bundle/deb/*.deb 2>/dev/null | head -1 || true)"
if [[ -z "$DEB" ]]; then
  echo "No .deb found. Run 'npm run build' in $SCRIPT_DIR first." >&2
  exit 1
fi
echo "Installing $(basename "$DEB")…"
# dpkg -i, not apt install: rebuilds keep the same version number, and apt
# treats that as "already the newest version" and silently installs nothing.
sudo dpkg -i "$DEB"
sudo apt-get -f install -y

# ── 2. Record which server this display targets ──
if [[ -n "$URL" ]]; then
  mkdir -p "$HOME/.config/family-organizer"
  printf '%s\n' "$URL" > "$HOME/.config/family-organizer/url"
  echo "Server URL set to $URL"
fi

# ── 3. Launch at login ──
# The Pi's labwc session runs lxsession-xdg-autostart, which reads this dir.
#
# lwrespawn relaunches the shell about a second after it exits, which is what you
# want for an unattended wall display — but it also means Alt+F4 does NOT close
# the window, it just bounces. Use --no-respawn if you'd rather be able to close it.
if [[ "$AUTOSTART" -eq 1 ]]; then
  if [[ "$RESPAWN" -eq 1 ]]; then
    EXEC_LINE="/usr/bin/lwrespawn /usr/bin/$BIN_NAME"
  else
    EXEC_LINE="/usr/bin/$BIN_NAME"
  fi
  mkdir -p "$HOME/.config/autostart"
  cat > "$HOME/.config/autostart/family-organizer.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Family Organizer
Comment=Household organizer, fullscreen
Exec=$EXEC_LINE
Icon=$BIN_NAME
Terminal=false
X-GNOME-Autostart-enabled=true
DESKTOP
  echo "Autostart entry written to ~/.config/autostart/family-organizer.desktop"
fi

# ── 4. On-screen keyboard ──
# This display is a touchscreen with no physical keyboard, so text fields are
# unusable without an OSK. squeekboard shows and hides itself automatically via
# the Wayland text-input protocol — it only needs to be running. Nothing on a
# stock Pi image starts it, so we add our own autostart entry.
if [[ "$OSK" -eq 1 ]]; then
  if command -v squeekboard >/dev/null 2>&1; then
    mkdir -p "$HOME/.config/autostart"
    cat > "$HOME/.config/autostart/squeekboard.desktop" <<'DESKTOP'
[Desktop Entry]
Type=Application
Name=On-screen keyboard
Comment=Appears automatically when a text field is focused
Exec=/usr/bin/squeekboard
Terminal=false
X-GNOME-Autostart-enabled=true
DESKTOP
    echo "On-screen keyboard autostart written (squeekboard)"
    if ! pgrep -x squeekboard >/dev/null 2>&1; then
      echo "  (not running yet — starts at next login, or run 'squeekboard &' now)"
    fi
  else
    echo "WARNING: squeekboard not found; touch typing will not work." >&2
    echo "         Install it with: sudo apt install squeekboard" >&2
  fi
fi

echo
echo "Done. Start it now with:  $BIN_NAME"
echo "It will also open fullscreen at your next login."
if [[ "$AUTOSTART" -eq 1 && "$RESPAWN" -eq 1 ]]; then
  echo
  echo "Note: it auto-restarts, so Alt+F4 only bounces the window. To stop it:"
  echo "  pkill -f 'lwrespawn /usr/bin/$BIN_NAME'"
  echo "  pkill -x family-organize"
else
  echo "Close the window with Alt+F4."
fi
