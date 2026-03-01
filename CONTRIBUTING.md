# Contributing to Family Organizer

Thank you for your interest in contributing! This guide covers how to get your development environment running, coding conventions, and the PR process.

---

## Table of Contents
- [Development Setup](#development-setup)
- [Running Tests](#running-tests)
- [Code Style](#code-style)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Requesting Features](#requesting-features)

---

## Development Setup

**Prerequisites:** Node.js 20 LTS, Git

```bash
# 1. Clone the repo
git clone https://github.com/your-org/family-organizer.git
cd family-organizer

# 2. Backend
cd backend
cp .env.example .env        # edit .env with your local values
npm install
npx prisma migrate dev      # creates dev.db and runs migrations
npx prisma generate         # regenerates Prisma client
npm run dev                 # starts API on http://localhost:3000

# 3. Frontend (separate terminal)
cd frontend
npm install
npm run dev                 # starts Vite dev server on http://localhost:5173
```

The frontend dev server proxies `/api` to `http://localhost:3000` automatically — no extra config needed.

---

## Running Tests

```bash
# Backend integration tests (Vitest)
cd backend && npm test

# Frontend build smoke test
cd frontend && npm run build
```

---

## Code Style

- **TypeScript strict mode** — no `any` without justification
- **ESLint + Prettier** — run `npm run lint` and `npm run format` before committing; CI enforces this
- **Backend:** ESM modules, Zod for all input validation, Prisma for DB access — no raw SQL
- **Frontend:** React functional components only, TanStack Query for server state, Tailwind utility classes
- **No new dependencies** without discussion — open an issue first for anything non-trivial

---

## Commit Messages

Use the conventional commits format:

```
type(scope): short description

Optional longer body explaining why, not what.
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:
```
feat(chores): add streak tracking to assignment view
fix(auth): prevent session fixation on login
docs: update deployment guide for reverse proxy section
```

---

## Pull Request Process

1. Fork the repo and create a branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```
2. Make your changes with tests where applicable
3. Ensure `npm test` passes in `backend/` and `npm run build` passes in `frontend/`
4. Open a PR against `main` — the PR template will guide you through the checklist
5. A maintainer will review within a few days; address any feedback
6. PRs are squash-merged once approved

**Keep PRs focused.** One feature or fix per PR makes review faster and history cleaner.

---

## Reporting Bugs

Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) issue template. Include:
- Steps to reproduce
- Expected vs. actual behavior
- Environment (OS, Docker version, browser)

---

## Requesting Features

Use the [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md) issue template. Describe the problem you're solving, not just the solution you have in mind.
