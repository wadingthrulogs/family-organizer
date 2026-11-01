# Recipe image-analysis + book lookup watcher (headless Claude Code, subscription-billed)

This watcher monitors a directory on the host (the Pi) for new images. For each one it runs **Claude Code in headless mode** (`claude -p`) to read the image and write structured JSON.

The prompt pulls kitchen-inventory items out of a photo of a recipe, ingredient list, receipt or groceries, in this shape:

```json
{ "title": "...", "items": [ { "name": "...", "quantity": 1.5, "unit": "cup", "category": "Baking" } ] }
```

The Family Organizer backend drops uploaded photos into the watched directory and reads the results back. See [App integration](#app-integration) below.

## Billing — read this first

- The watcher runs on the **Claude subscription** of the account logged into `~/.claude`. It does **not** use the pay-as-you-go API.
- `ANTHROPIC_API_KEY` must be **absent**. If it's set, `watch-recipes.sh` exits immediately with a `FATAL` message, because it would otherwise bill the Console account.
- There is **no API-key fallback**. If subscription auth is missing, the job fails loudly instead of quietly switching billing.
- The systemd unit also sets `UnsetEnvironment=ANTHROPIC_API_KEY` as a second guard.

## Files

| File | Deployed to | Purpose |
|------|-------------|---------|
| `watch-recipes.sh` | `~/recipe-watcher/watch-recipes.sh` | inotify watch loop + `claude -p` invocation |
| `parse-envelope.mjs` | `~/recipe-watcher/parse-envelope.mjs` | parses the `claude` JSON envelope, writes `<name>.json` (or `<name>.raw.txt`) |
| `finish-book.mjs` | `~/recipe-watcher/finish-book.mjs` | book lookups: downloads the cover, writes `<id>.book.result.json` |
| `recipe-image-watcher.service` | `/etc/systemd/system/recipe-image-watcher.service` | runs the watcher as `wade`, survives reboot, restarts on crash |
| `make-test-image.mjs` | not deployed | writes a tiny test PNG for smoke tests: `node make-test-image.mjs ~/uploads/testcard.png` |

### Watcher environment variables

Override these with `Environment=` lines in the unit.

| Var | Default |
|-----|---------|
| `WATCH_DIR` | `/home/wade/uploads` |
| `OUTPUT_DIR` | `/home/wade/recipe-output` |
| `CLAUDE_BIN` | `/home/wade/.local/bin/claude` |
| `CREDENTIALS_FILE` | `$HOME/.claude/.credentials.json` |
| `MAX_TURNS` | `3` |
| `STDERR_LOG` | `$OUTPUT_DIR/.claude-stderr.log` |

> The shipped script and unit hard-code `/home/wade` and `User=wade`. On a different host or user, edit `User`/`Group`, `HOME`, `PATH` and `ExecStart` in the unit, and set `WATCH_DIR`, `OUTPUT_DIR` and `CLAUDE_BIN`.

## One-time setup on the host

```bash
# 1. Tooling (inotify-tools; node already present, jq NOT required)
sudo apt-get install -y inotify-tools

# 2. Confirm SUBSCRIPTION login (not API). Run interactively once:
~/.local/bin/claude
#   then inside: /status
#   verify "Login Method: Claude Pro/Max subscription" (NOT an API key),
#   and check the plan isn't an expiring trial (claudeCodeTrialEndsAt).
#   For durable headless auth you may instead run: claude setup-token

# 3. Dirs + deploy. Create the dirs yourself BEFORE `make up`: if Docker
#    creates the bind-mount sources first they are owned by root and the
#    watcher cannot write its output.
mkdir -p ~/uploads ~/recipe-output ~/recipe-watcher
cp watch-recipes.sh parse-envelope.mjs finish-book.mjs ~/recipe-watcher/
chmod +x ~/recipe-watcher/watch-recipes.sh

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
node make-test-image.mjs ~/uploads/testcard.png      # or copy a real recipe photo
journalctl -u recipe-image-watcher -f
cat ~/recipe-output/testcard.png.json

# Negative test (proves no API fallback): must exit immediately with FATAL
ANTHROPIC_API_KEY=dummy ~/recipe-watcher/watch-recipes.sh
```

## Operating notes

- **What triggers processing:** the watcher only reacts to `close_write` and `moved_to` events for `.jpg`, `.jpeg`, `.png` and `.webp` files. The app writes `<uuid>.part` and then renames it, so the watcher never reads a half-written file.
- **No catch-up on startup:** the watcher does not scan existing files when it starts. An image dropped while the service is down or restarting is **never processed**, and in that case the app request times out (see below).
- **Skipping:** an image that already has `OUTPUT_DIR/<name>.json` is skipped if it's seen again.
- **One at a time:** images are processed **serially**, one `claude` run at a time, to avoid bursting subscription rate limits.
- **Results:** results go to `OUTPUT_DIR/<imagename>.json`. Output that isn't JSON is saved as `<imagename>.raw.txt` and logged, and the app reports it as `422 EXTRACTION_PARSE_FAILED`.
- **Failed runs:** if `claude` exits non-zero, the image is left unprocessed. Details go to `STDERR_LOG`.
- **Logs:** per-image cost and usage are logged to the journal (`journalctl -u recipe-image-watcher`).
- **Auth refresh:** subscription OAuth tokens refresh automatically. If a refresh ever needs an interactive re-login, the service fails loudly; re-run `claude /login`.

## App integration

`docker-compose.yml` bind-mounts two host directories into the backend container. Change them in the root `.env` if your host paths differ from the defaults.

| Root `.env` var | Default (host) | Container path | Backend env var |
|-----------------|----------------|----------------|-----------------|
| `RECIPE_UPLOADS_HOST_DIR` | `${HOME}/uploads` | `/host-recipe-uploads` | `RECIPE_EXTRACT_UPLOAD_DIR` |
| `RECIPE_OUTPUT_HOST_DIR` | `${HOME}/recipe-output` | `/host-recipe-output` | `RECIPE_EXTRACT_OUTPUT_DIR` |
| `RECIPE_EXTRACT_TIMEOUT_MS` | `75000` | – | `RECIPE_EXTRACT_TIMEOUT_MS` |

The host directories must match the watcher's `WATCH_DIR` and `OUTPUT_DIR`.

What happens when someone uploads a photo:

1. On the Inventory page, **Upload recipe** lets the user take a photo or pick an existing one. The page posts it to `POST /api/v1/inventory/extract-from-image`.
   - The upload is a multipart `image` field, at most 10 MB, JPG/PNG/WebP, checked by magic bytes.
   - nginx allows a 12 MB body and a 120 s proxy timeout for this request.
2. The backend writes `<uuid>.part`. Next to it, it writes a sidecar `<uuid>.<ext>.ctx.json` containing `{ "categories": [...] }`, the household's existing inventory categories. Then it renames the `.part` file to the image name.
3. The watcher folds those categories into the prompt so items are labelled the way the family already categorises inventory, and writes `<image>.json`.
4. The backend polls once a second for `<image>.json` or `<image>.raw.txt`, up to `RECIPE_EXTRACT_TIMEOUT_MS`, and returns `{ title, items }`. When the request finishes, the backend deletes the image, the sidecar and the result files.
5. The UI shows an editable preview. Confirming the preview calls `POST /api/v1/inventory/bulk-items`.

Errors the endpoint can return:

| Response | Cause |
|----------|-------|
| `501 EXTRACTION_NOT_CONFIGURED` | either `RECIPE_EXTRACT_*_DIR` is unset |
| `415 INVALID_IMAGE` | unsupported type, or the magic bytes don't match |
| `422 EXTRACTION_PARSE_FAILED` | the model output wasn't JSON |
| `504 EXTRACTION_TIMEOUT` | the watcher didn't respond in time (often because the service isn't running) |

The app never runs `claude` and never holds an API key. All AI work stays in this subscription-billed watcher.

## Book lookups (guest display reading list)
The same watcher also handles `*.book.json` requests dropped by the app when a
book is added to the guest display's reading list:

```
<id>.book.json           {"id","title","author"}        ← app writes (upload dir)
<id>.book.result.json    {ok,title,author,year,synopsis,coverFile|error}  → app ingests (output dir)
<id>.cover.jpg|png|webp  the downloaded cover                            → app files as an Attachment
```

`claude -p` runs with `--allowedTools "WebFetch,WebSearch"` and `BOOK_MAX_TURNS`
(default 12): Open Library first, Google Books second, web search only if those
fail. The cover is downloaded here on the host by `finish-book.mjs` (https only,
image content-type, ≤ 5 MB) — the app container never fetches arbitrary URLs.
A result file is written even on failure so the app doesn't wait on a dead lookup.

Test one by hand:
```bash
echo '{"id":"test-1","title":"Project Hail Mary","author":""}' > /home/wade/uploads/x.part \
  && mv /home/wade/uploads/x.part /home/wade/uploads/test-1.book.json
journalctl -u recipe-image-watcher -f          # LOOKUP → COST → COVER → WROTE
cat /home/wade/recipe-output/test-1.book.result.json
rm /home/wade/uploads/test-1.book.json /home/wade/recipe-output/test-1.*   # app-less test: clean up yourself
```
