# Developer agents

These are two standalone scripts for development. Each runs a Claude agent over this repo with a specialised system prompt. They aren't part of the app and aren't deployed.

| Script | Agent | Focus |
|--------|-------|-------|
| `frontend-expert.ts` | Frontend expert | React/Vite/Tailwind conventions, React Query keys, widgets, touch ergonomics |
| `dashboard-architect.ts` | Dashboard Architect Pro | react-grid-layout v2 grid, edit mode, lg/md layout persistence, local/server config sync |

The long-form version of the dashboard prompt lives in [`.github/agents/dashboard-architect.md`](../.github/agents/dashboard-architect.md). The system prompts are template strings inside each `.ts` file. **Keep them in sync with the code**: widget list, grid config and query keys. Stale facts in a prompt lead to confidently wrong edits.

## Requirements

- Node ≥ 20
- A working Claude Code login on the machine (the scripts use its credentials), or `ANTHROPIC_API_KEY` set. With an API key set, runs are billed to that API account.
- The scripts import `query` from `@anthropic-ai/claude-code`, the SDK package name this folder was written against. It's installed at `latest`, so if `npm install` pulls a version without that export, pin the version or switch the import to the current Claude Agent SDK package.

## Usage

```bash
cd agents
npm install

npm run frontend -- "Add a loading skeleton to the Grocery widget"
npm run frontend:review     # component architecture review
npm run frontend:perf       # bundle size, re-renders, lazy loading
npm run frontend:a11y       # WCAG AA / ARIA / keyboard audit

npm run dashboard -- "Why does the commute widget jump when resized at md?"
npm run dashboard:debug     # drag/resize/persistence/breakpoint issues
npm run dashboard:review    # DashboardPage + KioskPage architecture review
```

- With no argument, each script runs a default review prompt.
- The working directory is the repo root.
- Allowed tools are `Read`, `Glob`, `Grep`, `Edit` and `Bash`, with permission mode `default`, so the agent asks before editing files or running commands.
- Set `MODEL` to override the model. The default is hard-coded in each script.
