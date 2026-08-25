# Family Organizer — Desktop Shell

A native desktop app for the Pi, so the household display isn't a browser window.
The web app stays exactly as it is — this is an additional client, not a replacement.

## What it is

A [Tauri v2](https://tauri.app) shell (Rust + the system WebKitGTK webview) that opens
the app the Pi already serves at `https://familyorganizer.tail411eff.ts.net`, fullscreen
and without browser chrome.

**It contains no application code.** The UI and every API call come from the server, so
the desktop app and the browser can never drift out of sync — ship the frontend once and
both update together.

It exists to solve two things a browser window doesn't:

1. **Boot ordering.** At login the Docker stack usually isn't up yet. The shell shows a
   local splash and polls `/api/v1/health` every 2s until the server answers, then loads
   the app. No error page, no manual refresh.
2. **Self-healing.** If the stack restarts under a display nobody is watching, three
   consecutive failed health checks (~45s) drop it back to the splash, and it re-enters
   the app automatically on recovery.

Measured ~175 MB resident on this Pi, against 300–400 MB for an Electron equivalent.

## Layout

```
desktop/
├── ui/index.html          # local splash — the only bundled page
├── install.sh             # installs the .deb + the autostart entry
└── src-tauri/
    ├── src/main.rs        # window, health polling, watchdog
    ├── tauri.conf.json    # window + bundle config
    └── capabilities/      # permissions (remote origins get no IPC access)
```

## Build & install

Prerequisites (already provisioned on this Pi):

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
                 libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Rust must be **1.88 or newer** — Debian's packaged 1.85 is too old for current Tauri.
Use rustup rather than the distro package:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
```

Then:

```bash
npm install
npm run build        # produces src-tauri/target/release/bundle/deb/*.deb
./install.sh         # installs it and enables autostart
```

`install.sh` flags:

| Flag | Effect |
|------|--------|
| `--url https://other-host` | Point this display at a different server |
| `--no-autostart` | Install the menu entry without launching at login |
| `--no-respawn` | Don't auto-restart, so `Alt+F4` genuinely closes the window |
| `--no-osk` | Skip the on-screen-keyboard autostart |

Rebuilds keep the same version number, which makes `apt install` a no-op ("already the
newest version"), so the script uses `dpkg -i` to force the reinstall.

## Configuration

The server URL is resolved in this order:

1. `FAMILY_ORGANIZER_URL` environment variable
2. `~/.config/family-organizer/url` (a file containing one URL)
3. the compiled-in default in `src-tauri/src/main.rs`

So one build works on any household's Pi without recompiling.

## Running it

```bash
family-organizer-desktop
```

Autostart is an XDG entry at `~/.config/autostart/family-organizer.desktop`. The Pi's
labwc session runs `lxsession-xdg-autostart`, which picks that up at login. It launches
via `lwrespawn`, so the shell restarts itself if it ever exits.

### Stopping it

**`Alt+F4` does not close it under `lwrespawn`** — the supervisor relaunches it about a
second later. That's the right behaviour for an unattended wall display, but it surprises
you the first time. To actually stop it:

```bash
pkill -f 'lwrespawn /usr/bin/family-organizer-desktop'   # the supervisor
pkill -x family-organize                                 # then the app itself
```

Note the second command uses `family-organize`, not the full name: Linux truncates process
names to 15 characters, so `pgrep`/`pkill -x` never match the 16-character real name. And
don't `pkill -x lwrespawn` — `pcmanfm-pi` and `wf-panel-pi` run under it too, so that takes
your desktop and panel down with it.

Install with `--no-respawn` if you'd rather `Alt+F4` just worked.

There are deliberately no custom global shortcuts — wlroots compositors don't grant global
hotkey grabs without a portal, so a shortcut registered by the app would silently not work.

## Rendering: DMA-BUF is disabled on purpose

WebKitGTK's DMA-BUF renderer produces **torn, striped output** on this Pi's 270°-rotated
HDMI output — flat fills paint correctly, but text and borders smear into single scanlines.
`main.rs` therefore sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` before the webview starts, which
renders cleanly.

It's only set when the caller hasn't already chosen, so you can override it:

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=0 family-organizer-desktop   # re-enable, e.g. to retest
```

Worth re-testing after a WebKitGTK upgrade — if it's fixed upstream, dropping the override
gets GPU buffer sharing back.

## On-screen keyboard

The display is a touchscreen with no physical keyboard, so text fields need an OSK.
**Nothing on a stock Pi image starts one** — `squeekboard` is installed but never launched,
and the panel has no keyboard widget. Without it, tapping a field gets you a cursor and no
way to type.

`install.sh` therefore writes `~/.config/autostart/squeekboard.desktop`. squeekboard shows
and hides itself automatically through the Wayland `text-input-v3` protocol, so it only
needs to be running — no per-app configuration. Verified working: focusing the login form's
username field pops the keyboard, and dismissing focus hides it again.

Start it in the current session without logging out:

```bash
squeekboard &
```

`wvkbd` and `onboard` are also installed on this Pi. onboard is X11-era and its autostart is
gated to Unity/MATE, so it never runs here; squeekboard is the one that fits labwc.

**Untested:** whether a text field near the bottom of a page stays visible above the
keyboard. In portrait the OSK covers roughly the lower third, and nothing scrolls the
focused field into view. Worth a quick check on a long form like Settings.

## Signing in

The webview keeps its own cookie store, separate from any browser on the Pi, so **the first
launch shows the login page**. The session cookie persists across restarts after that.

## Notes

- Remote content gets **no IPC access**. No capability in `capabilities/` lists a remote
  origin, so the page served from the Pi cannot call into the shell. Keep it that way
  unless you have a specific reason, and add the narrowest permission that covers it.
- The window trusts the Tailscale-issued certificate normally — it's a real Let's Encrypt
  cert for `*.ts.net`, so no TLS exceptions are needed.
- The touchscreen is mapped to `HDMI-A-2` with mouse emulation in `~/.config/labwc/rc.xml`;
  the frontend's mobile layouts are what you get on that display.
