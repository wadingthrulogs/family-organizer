# Recipe image-analysis watcher (headless Claude Code, subscription-billed)

Watches a directory on the Pi for new images and runs **Claude Code in headless
mode** (`claude -p`) to read each image and emit structured JSON. The prompt
extracts kitchen-inventory items from a photo of a recipe / ingredient list:
`{ "title", "items": [ { "name", "quantity", "unit", "category" } ] }`. The
family-organizer app drops uploaded photos here and reads `.items` back to add
them to inventory (see the app's `POST /api/v1/inventory/extract-from-image`).

## Billing — read this first
- Runs on the **Claude subscription credit** via the account logged into
  `~/.claude`. It does **not** use the pay-as-you-go API.
- `ANTHROPIC_API_KEY` must be **absent**. If it's set, `watch-recipes.sh` exits
  immediately with a `FATAL` message (it would otherwise bill the Console
  account). There is **no API-key fallback** — missing subscription auth fails
  loudly instead of silently switching billing.
- The systemd unit sets `UnsetEnvironment=ANTHROPIC_API_KEY` as a second guard.

## Files
| File | Deployed to | Purpose |
|------|-------------|---------|
| `watch-recipes.sh` | `/home/wade/recipe-watcher/watch-recipes.sh` | inotify watch loop + `claude -p` invocation |
| `parse-envelope.mjs` | `/home/wade/recipe-watcher/parse-envelope.mjs` | parses the `claude` JSON envelope, writes `<name>.json` |
| `recipe-image-watcher.service` | `/etc/systemd/system/recipe-image-watcher.service` | runs the watcher as `wade`, survives reboot, restarts on crash |

Defaults (override via env in the unit): `WATCH_DIR=/home/wade/uploads`,
`OUTPUT_DIR=/home/wade/recipe-output`, `CLAUDE_BIN=/home/wade/.local/bin/claude`.

## One-time setup on the Pi
```bash
# 1. Tooling (inotify-tools; node already present, jq NOT required)
sudo apt-get install -y inotify-tools

# 2. Confirm SUBSCRIPTION login (not API). Run interactively once:
/home/wade/.local/bin/claude
#   then inside: /status
#   verify "Login Method: Claude Pro/Max subscription" (NOT an API key),
#   and check the plan isn't an expiring trial (claudeCodeTrialEndsAt).
#   For durable headless auth you may instead run: claude setup-token

# 3. Dirs + deploy
mkdir -p /home/wade/uploads /home/wade/recipe-output /home/wade/recipe-watcher
cp watch-recipes.sh parse-envelope.mjs /home/wade/recipe-watcher/
chmod +x /home/wade/recipe-watcher/watch-recipes.sh

# 4. Install + enable the service
sudo cp recipe-image-watcher.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now recipe-image-watcher
```

## Verify before relying on it
```bash
# No API key in the service environment:
systemctl show recipe-image-watcher -p Environment   # must NOT list ANTHROPIC_API_KEY

# Service is up:
systemctl status recipe-image-watcher

# Live test: drop an image in and watch the logs + output
cp /path/to/recipe.jpg /home/wade/uploads/
journalctl -u recipe-image-watcher -f
cat /home/wade/recipe-output/recipe.jpg.json

# Negative test (proves no API fallback): must exit immediately with FATAL
ANTHROPIC_API_KEY=dummy /home/wade/recipe-watcher/watch-recipes.sh
```

## Operating notes
- Images are processed **serially** (one `claude` run at a time) to avoid
  bursting subscription rate limits.
- A result is written to `OUTPUT_DIR/<imagename>.json`. Re-runs skip images that
  already have output (restart-safe). Non-JSON model output is saved as
  `<imagename>.raw.txt` and logged.
- Per-image cost/usage is logged to the journal (`journalctl -u recipe-image-watcher`).
- Subscription OAuth tokens refresh automatically; if a refresh ever needs an
  interactive re-login, the service will fail loudly — re-run `claude /login`.

## App integration (built)
The family-organizer backend bind-mounts `/home/wade/uploads` →
`/host-recipe-uploads` and `/home/wade/recipe-output` → `/host-recipe-output`.
The Inventory page's **Upload recipe** button posts a photo to
`POST /api/v1/inventory/extract-from-image`, which drops the image here, waits
for this watcher to write `<name>.json`, and returns `.items` for an editable
preview before adding them to inventory. The app never runs `claude` or holds an
API key — all AI stays in this subscription-billed watcher.

The app may also drop a sidecar `<image>.ctx.json` (e.g. `{ "categories": [...] }`)
next to the image. If present, the watcher folds those existing household
categories into the prompt so items are labeled consistently with how the family
already categorizes inventory.
