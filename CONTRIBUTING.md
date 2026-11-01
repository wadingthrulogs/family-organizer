# Contributing to Family Organizer

Thanks for your interest! This guide covers the dev environment, tests, conventions, and how to send changes.

---

## Table of Contents
- [Repository Layout](#repository-layout)
- [Development Setup](#development-setup)
- [Running Tests](#running-tests)
- [Code Style](#code-style)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs & Requesting Features](#reporting-bugs--requesting-features)

---

## Repository Layout

| Path | What it is |
|------|-----------|
| `backend/` | Express + Prisma + SQLite API |
| `frontend/` | React + Vite SPA; `frontend/nginx/` holds the production nginx templates |
| `mcp/` | MCP server so AI clients can use the organizer — [mcp/README.md](mcp/README.md) |
| `tools/recipe-image-watcher/` | Host service for recipe-photo extraction — [README](tools/recipe-image-watcher/README.md) |
| `agents/` | Claude Agent SDK helper agents for frontend/dashboard work — [agents/README.md](agents/README.md) |
| `e2e/` | Playwright browser tests — [e2e/README.md](e2e/README.md) |
| `docs/` | Architecture, API, data model, deployment, requirements |

`CLAUDE.md` is the condensed AI/developer reference; keep it in sync when you change routes, models, env vars, or widgets.

---

## Development Setup

**Prerequisites:** Node.js 20+, Git. Docker only if you want to run the production stack.

```bash
# 1. Clone the repo
git clone https://github.com/wadingthrulogs/family-organizer.git
cd family-organizer

# 2. Backend
cd backend
cp .env.example .env        # set SESSION_SECRET and ENCRYPTION_KEY; for local dev also
                            # APP_BASE_URL=http://localhost and SESSION_SECURE=false
npm install
npx prisma migrate dev      # creates prisma/dev.db, applies migrations, regenerates the client
npm run dev                 # tsx watch — API on http://localhost:3000

# 3. Frontend (separate terminal)
cd frontend
npm install
npm run dev                 # Vite dev server on http://localhost (port 80)
```

The Vite dev server proxies `/api` and `/ws` to `http://localhost:3000`.

> **Port 80 is privileged.** On Linux / Raspberry Pi run `npm run dev` with `sudo`, or allow Node to bind low ports (`sudo setcap cap_net_bind_service=+ep $(which node)`). On Windows run the terminal as Administrator. If the Docker stack is running on the same machine, `make down` first — both use port 80.

Generate secrets with `openssl rand -hex 32` (session) and `openssl rand -base64 32` (encryption key — must be exactly 32 bytes).

After changing `backend/prisma/schema.prisma`:

```bash
cd backend
npx prisma migrate dev --name <migration-name>
```

---

## Running Tests

```bash
# Backend integration tests (Vitest + Supertest, backend/tests/)
cd backend && npm test        # loads backend/.env via dotenv — SESSION_SECRET / ENCRYPTION_KEY must be set

# Type checks
cd backend  && npx tsc --noEmit
cd frontend && npx tsc --noEmit

# Frontend build smoke test
cd frontend && npm run build

# MCP server
cd mcp && npm run typecheck

# End-to-end (Playwright) — needs a running app and a test account; see e2e/README.md
cd e2e && npx playwright test
```

There is no CI pipeline on `main` yet, so please run these locally before opening a PR.

---

## Code Style

- **TypeScript strict mode** — avoid `any` without a reason
- **ESLint** — `npm run lint` in `backend/` and `frontend/`. There is no Prettier config; match the surrounding formatting.
- **Backend:** ESM modules, Zod for all input validation, Prisma for DB access (no raw SQL), errors in the `{ error: { code, message, details } }` shape
- **Frontend:** function components, TanStack Query for server state (invalidate the right query keys in mutation `onSuccess`), Tailwind with the theme tokens from `tailwind.config.js` — don't hard-code colors
- **No new dependencies** without discussion — open an issue first for anything non-trivial

---

## Commit Messages

Conventional commits:

```
type(scope): short description

Optional longer body explaining why, not what.
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

Examples:
```
feat(chores): add streak tracking to assignment view
fix(auth): prevent session fixation on login
docs: update deployment guide for reverse proxy section
```

---

## Pull Request Process

1. Fork the repo and branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```
2. Make your change, with tests where it makes sense
3. Run the checks in [Running Tests](#running-tests)
4. Update docs (`README.md`, `docs/`, `CLAUDE.md`, `CHANGELOG.md` under `[Unreleased]`) if behaviour, endpoints, env vars, or setup changed
5. Open a PR against `main` describing what changed, why, and how you tested it
6. PRs are squash-merged once approved

**Keep PRs focused.** One feature or fix per PR.

---

## Reporting Bugs & Requesting Features

Open a GitHub issue.

- **Bugs:** steps to reproduce, expected vs. actual behaviour, environment (OS / Pi model, Docker version, browser), and relevant `make logs` output (remove secrets).
- **Features:** describe the problem you're solving, not just the solution you have in mind.

Security issues: see [SECURITY.md](SECURITY.md) — please don't file them publicly.
