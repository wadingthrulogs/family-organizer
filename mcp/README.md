# Family Organizer — MCP Server

An MCP (Model Context Protocol) server that lets Claude read and write Family Organizer data through the normal REST API. The default transport is **stdio**, for Claude Code running on the same machine. **HTTP/SSE** is opt-in for remote Claude Code clients, for example over Tailscale.

The server is a plain API client. It logs in as a household user, keeps the session cookie, and calls `/api/v1/*`. It has no direct database access.

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

Outputs are lean projections, mostly id, title and state fields, so each call uses little of Claude's context.

## Configuration

The server reads **only `process.env`** (`src/config/env.ts`). It does **not** load a `.env` file. `mcp/.env.example` is just a reference list of variables. Set them in your shell, a systemd unit, or the `env` block of `.mcp.json`.

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `ORGANIZER_BASE_URL` | no | `http://localhost:3000` | Base URL of the app (no `/api/v1`). See below. |
| `ORGANIZER_USERNAME` | **yes** | – | Use a dedicated bot user, e.g. `claude-bot`. |
| `ORGANIZER_PASSWORD` | **yes** | – | |
| `MCP_TRANSPORT` | no | `stdio` | `stdio` or `http` |
| `MCP_HTTP_HOST` | no | `127.0.0.1` | HTTP mode only |
| `MCP_HTTP_PORT` | no | `3100` | HTTP mode only |
| `MCP_HTTP_BEARER` | no, but set it | – | HTTP mode only; every request must send `Authorization: Bearer <value>` |

### Which `ORGANIZER_BASE_URL`?

- **Docker deployment (the normal case):** the backend container's port 3000 is only `expose`d inside the Compose network. It is **not** published on the host, so `http://localhost:3000` won't connect. Point at nginx instead:
  - HTTP mode: `http://localhost` (or `http://<host>:<HTTP_PORT>`)
  - HTTPS / Tailscale mode: `https://<your-host>.<tailnet>.ts.net`
- **Local dev (`npm run dev` in `backend/`):** the default `http://localhost:3000` works.

## One-time setup

1. **Create a `claude-bot` user** in the running app (Settings → Users → Add User). Role `MEMBER` is enough. Note its password.
2. **Install and build:**

   ```bash
   cd mcp
   npm install
   npm run build
   ```

   - The `preinstall` script refuses to run if the lockfile ever resolves to `axios@1.14.1` or `axios@0.30.4`. Those are the versions compromised in the March 31, 2026 supply-chain attack.
   - `npm run build` also runs `npm audit --omit=dev --audit-level=high`, so a future advisory fails the build loudly.
   - `mcp/dist/` is not committed. If you skip this step, Claude Code reports the server as failing to connect.

3. **Export credentials** in the shell you start Claude Code from:

   ```bash
   export ORGANIZER_BASE_URL=https://familyorganizer.<tailnet>.ts.net   # or http://localhost
   export ORGANIZER_USERNAME=claude-bot
   export ORGANIZER_PASSWORD='...'
   ```

   The committed `.mcp.json` at the repo root passes these through to the server process.

4. **Restart Claude Code** in the repo root.

5. **Verify:** run `/mcp` in Claude Code. `family-organizer` should be listed with 15 tools. Try "what's on my plate today?"; Claude should call `get_today_summary`.

   The standalone smoke test spawns the server over stdio, does an MCP handshake and lists the tools. It doesn't need a running backend.

   ```bash
   node mcp/smoke-test.mjs
   ```

## Scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | `tsx watch src/index.ts` |
| `npm run build` | `tsc` + `npm audit` |
| `npm run start` | `node dist/index.js` (transport from `MCP_TRANSPORT`) |
| `npm run start:http` | same, with `MCP_TRANSPORT=http` forced |
| `npm run typecheck` | `tsc --noEmit` |

## Transports

### stdio (default)

`.mcp.json` launches `node mcp/dist/index.js` as a child process of Claude Code. You don't need to do anything else.

### HTTP/SSE (opt in)

```bash
export MCP_HTTP_HOST=0.0.0.0          # or your Tailscale IP
export MCP_HTTP_PORT=3100
export MCP_HTTP_BEARER="$(openssl rand -hex 32)"
npm run start:http
```

Endpoints:

| Path | Purpose |
|------|---------|
| `GET /sse` | Opens an SSE session; the first event names the `/messages?sessionId=…` endpoint |
| `POST /messages?sessionId=…` | Client → server JSON-RPC messages |
| `GET /healthz` | `{ status, timestamp }` |

When `MCP_HTTP_BEARER` is set, the bearer check applies to **every** path, `/healthz` included.

```bash
curl -N -H "Authorization: Bearer $MCP_HTTP_BEARER" http://127.0.0.1:3100/sse
# expect: event: endpoint
#         data: /messages?sessionId=...
curl -H "Authorization: Bearer $MCP_HTTP_BEARER" http://127.0.0.1:3100/healthz
```

**Caveat:** claude.ai's web custom-connector flow expects OAuth-style auth (Dynamic Client Registration), not a static bearer header. The HTTP transport works for **Claude Code on a remote machine** connecting over Tailscale. It does **not** yet work for claude.ai on the web or mobile.

`MCP_HTTP_HOST` defaults to `127.0.0.1`, so a misconfiguration alone can't expose the server beyond loopback. Only bind to `0.0.0.0` or your Tailscale address when `MCP_HTTP_BEARER` is set.

## Security notes

- The MCP holds a household login. Use a dedicated `claude-bot` user, not your personal admin account, so audit logs keep human and bot writes apart. A `MEMBER` bot can still write everything a member can, including tasks, grocery items, events and reminders.
- All runtime dependencies are exact-pinned (no `^` or `~`) because of the axios npm supply-chain attack. The MCP pins `axios@1.15.2`.
- The MCP makes **no** outbound calls except to `ORGANIZER_BASE_URL`.
- Credentials are never logged. The error formatter only surfaces the backend's `{ code, message }` envelope.

### Compromise rotation runbook

If a future advisory implicates a dependency we ship:

1. `cd mcp && rm -rf node_modules package-lock.json` to start clean.
2. Bump the affected dependency to a confirmed-clean version in `package.json`.
3. `npm install && npm run build`. The preinstall guard and `npm audit` must both pass.
4. In the app, change the `claude-bot` user's password (Settings → Users → Reset password).
5. Update `ORGANIZER_PASSWORD` wherever you set it, then restart Claude Code.

## Layout

```
mcp/
  smoke-test.mjs             stdio handshake + tools/list (no backend needed)
  src/
    index.ts                 transport selector + bootstrap (stdio or express/SSE)
    server.ts                builds McpServer, registers all tools
    config/env.ts            zod-validated process.env loader
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

- **Claude Code says the server failed to connect:** `mcp/dist/index.js` probably doesn't exist yet. Run `npm run build` in `mcp/`. If it does exist, run `node mcp/dist/index.js` by hand with the env vars set to see the startup error.
- **"family-organizer-mcp: invalid environment":** `ORGANIZER_USERNAME` or `ORGANIZER_PASSWORD` is missing from the process environment. Remember that `mcp/.env` is not read.
- **`ECONNREFUSED` on every call:** `ORGANIZER_BASE_URL` is pointing at `localhost:3000` while the app runs in Docker. Use the nginx URL (see above).
- **`401 UNAUTHORIZED` on every tool call:** `claude-bot` was deleted, or the password no longer matches. Check by logging in with the same credentials in a browser.
- **`429 RATE_LIMITED`:** you've hit the backend's 200 requests/min limit; back off and retry. `get_today_summary` makes 5 parallel GETs, so a tight loop of summaries can approach the cap.
- **"Multiple linked calendars exist; pass linkedCalendarId.":** call `list_calendars` first, then pass the chosen id to `create_calendar_event`.
- **HTTP mode shows `WARNING — running HTTP transport without MCP_HTTP_BEARER`:** set `MCP_HTTP_BEARER` and restart. Don't expose the server without it.
