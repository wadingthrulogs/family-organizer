# End-to-end tests (Playwright)

These are browser tests that run against a **running** Family Organizer instance, normally the Docker stack on the Pi. They cover the dashboard grid (edit mode, the undo pill on widget remove, drag stability, layout persistence across navigation), Tasks quick-add, and the Calendar page.

The tests change data on the instance they point at. **Use a dedicated test account**, never a real family member's.

## One-time setup

```bash
cd e2e
npm install
npx playwright install chromium     # add --with-deps on a fresh host
```

In the app, create the test user: Settings → Users → Add User, role `MEMBER`. The defaults the tests expect are `testuser` / `TestPass123!`.

## Running

```bash
cd e2e
npx playwright test                                   # both projects
npx playwright test --project=chromium-portrait       # one project
npx playwright show-report report                     # open the HTML report
```

`npm test` in this folder is a placeholder and doesn't run anything. Use `npx playwright test`.

### Environment variables

| Var | Default | Purpose |
|-----|---------|---------|
| `E2E_BASE_URL` | `http://localhost` | App URL. Use `https://<host>.<tailnet>.ts.net` when the stack runs in HTTPS mode. HTTPS errors are ignored, so self-signed certs work. |
| `E2E_USER` | `testuser` | Login username |
| `E2E_PASS` | `TestPass123!` | Login password |

```bash
E2E_BASE_URL=https://familyorganizer.example.ts.net E2E_USER=e2e E2E_PASS='…' npx playwright test
```

## How it works

- `global-setup.ts` logs in once and resets the test user's `dashboardConfig` and `kioskConfig` to a known 5-widget baseline with `PATCH /api/v1/settings/me`. It also seeds `localStorage` with that config and saves cookies and storage to `auth-state.json`, which every test reuses.
- `playwright.config.ts` runs one worker with two projects:
  - `chromium-landscape`, 1920×1080, the lg breakpoint (12 columns);
  - `chromium-portrait`, 1080×1920, the md breakpoint (8 columns), where the separate `mdLayout` is persisted.
- Output goes to `results/` (traces, kept on failure; screenshots, always) and `report/` (HTML). `auth-state.json`, `results/` and `report/` are gitignored.

If you change `DEFAULT_DASHBOARD_CONFIG` in `frontend/src/types/dashboard.ts`, update the copy in `global-setup.ts` to match.
