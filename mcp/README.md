# Family Organizer — MCP Server

An MCP (Model Context Protocol) server that lets Claude interact with the self-hosted Family Organizer backend. Default transport is stdio (Claude Code locally); HTTP/SSE is available behind an env flag for Tailscale / remote use.

## What it exposes (15 tools)

| Tool | Reads | Writes |
|------|-------|--------|
| `get_today_summary` | tasks, chores, events, inventory, grocery | – |
| `list_tasks` / `create_task` / `update_task` | tasks | tasks |
| `list_chores` / `update_chore_assignment` | chores | chore assignments |
| `list_grocery_lists` / `list_grocery_items` / `add_grocery_item` | grocery | grocery items |
| `list_inventory` | inventory | – |
| `list_calendars` / `list_calendar_events` / `create_calendar_event` | calendars / events | local events |
| `list_reminders` / `create_reminder` | reminders | reminders |

Outputs are lean projections — id/title/state-style fields only — so Claude burns minimal context per call.

## One-time setup

1. **Create a `claude-bot` user** in the running Family Organizer app (Settings → Users → Add User). Role `MEMBER` is sufficient. Note its password.
2. **Install + build** the MCP:

   ```powershell
   cd mcp
   npm install
   npm run build
   ```

   The `preinstall` script refuses to run if the lockfile ever resolves to `axios@1.14.1` or `axios@0.30.4` (the versions compromised in the March 31, 2026 supply-chain attack). `npm run build` also runs `npm audit --omit=dev --audit-level=high` so a future advisory fails the build loudly.

3. **Configure env**: copy `mcp/.env.example` to `mcp/.env`, set `ORGANIZER_USERNAME=claude-bot` and the password. *Do not commit `.env`.*

4. **Restart Claude Code** in the repo. The committed `.mcp.json` at the repo root wires up the server. You may need to set `ORGANIZER_PASSWORD` in your shell environment first so the substitution `${env:ORGANIZER_PASSWORD}` resolves:

   ```powershell
   $env:ORGANIZER_PASSWORD = '...'
   ```

5. **Verify**: in Claude Code, run `/mcp`. Expect `family-organizer` listed with 15 tools. Try "what's on my plate today?" — Claude should call `get_today_summary`.

   You can also run the standalone stdio smoke test which spawns the server, performs an MCP handshake, and lists tools (no backend required):

   ```powershell
   node mcp/smoke-test.mjs
   ```

## Transports

### stdio (default — Claude Code locally)

The committed `.mcp.json` spawns `node mcp/dist/index.js` as a child process. Nothing else to do.

### HTTP/SSE (Tailscale / remote — opt in)

```powershell
$env:MCP_TRANSPORT = 'http'
$env:MCP_HTTP_HOST = '0.0.0.0'      # or your Tailscale IP
$env:MCP_HTTP_PORT = '3100'
$env:MCP_HTTP_BEARER = '<random-token>'  # required in practice
npm run start
```

Smoke-test the SSE endpoint:

```powershell
curl.exe -N -H "Authorization: Bearer <token>" http://127.0.0.1:3100/sse
# expect: event: endpoint
#         data: /messages?sessionId=...
```

**Important caveat**: claude.ai's web custom-connector flow today expects OAuth-style auth (Dynamic Client Registration), not a static bearer header. The HTTP transport works for **Claude Code on a remote machine** connecting over Tailscale; it is **not** sufficient for claude.ai-web/mobile yet.

Default `MCP_HTTP_HOST` is `127.0.0.1` so misconfiguration alone cannot expose the server beyond loopback. Set `0.0.0.0` (or your Tailscale-assigned address) only when paired with a `MCP_HTTP_BEARER`.

## Security notes

- The MCP holds a household login. Use a dedicated `claude-bot` user, not your personal admin account, so audit logs separate human and bot writes.
- All runtime deps are exact-pinned (no `^`/`~`) given the recent axios npm supply-chain attack. Existing project lockfiles in `frontend/` resolve to `axios@1.13.5` (pre-1.14.x, unaffected); the new MCP package pins to `axios@1.15.2` (clean post-breach release with SLSA provenance).
- The `preinstall` lockfile guard prevents accidentally installing a compromised axios in the future.
- The MCP makes **no** outbound calls except to `ORGANIZER_BASE_URL`.
- Credentials are never logged. The error-formatting helper deliberately surfaces only the backend's `{ code, message }` envelope.

### Compromise rotation runbook

If a future advisory implicates a dep we ship:

1. `cd mcp; rm -rf node_modules package-lock.json` — start clean.
2. Bump the affected dep to a confirmed-clean version in `package.json`.
3. `npm install && npm run build` — preinstall guard + `npm audit` must both pass.
4. In the running app: change the `claude-bot` user's password (Admin → Users → Reset password).
5. Update `mcp/.env` with the new password and restart Claude Code.

## Layout

```
mcp/
  src/
    index.ts                 transport selector + bootstrap
    server.ts                builds McpServer, registers all tools
    config/env.ts            zod-validated env loader
    client/api.ts            OrganizerApiClient — axios + cookie jar + auto-login
    client/types.ts          lean local API response types
    client/users-cache.ts    1-min TTL cache of /auth/users
    tools/
      context.ts             ToolContext, ok/fail helpers
      dashboard.ts           get_today_summary
      tasks.ts               list_tasks, create_task, update_task
      chores.ts              list_chores, update_chore_assignment
      grocery.ts             list_grocery_lists, list_grocery_items, add_grocery_item
      inventory.ts           list_inventory
      calendar.ts            list_calendars, list_calendar_events, create_calendar_event
      reminders.ts           list_reminders, create_reminder
    util/
      errors.ts              axios error → human string (preserves backend's {code,message})
      format.ts              date helpers, lean projection helpers
```

## Troubleshooting

- **"family-organizer-mcp: invalid environment"** — fill out `mcp/.env` (see `.env.example`).
- **`401 UNAUTHORIZED` on every tool call** — backend is not running, or `claude-bot` was deleted, or the password no longer matches. Verify in a browser: `POST /api/v1/auth/login` with the same creds.
- **`429 RATE_LIMITED`** — backend's 200/min limit; back off and retry. `get_today_summary` makes 5 parallel GETs, so a tight loop of summaries can approach the cap.
- **"Multiple linked calendars exist; pass linkedCalendarId."** — call `list_calendars` first and pass the chosen id explicitly to `create_calendar_event`.
- **HTTP mode shows `WARNING — running HTTP transport without MCP_HTTP_BEARER`** — set `MCP_HTTP_BEARER` and restart. Do not deploy without it.
