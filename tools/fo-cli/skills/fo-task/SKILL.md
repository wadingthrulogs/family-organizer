---
name: fo-task
description: Add a task to the Family Organizer (the household app on the Pi) or list open tasks. Use when the user says things like "add a task", "remind the family to…", "put X on the task list", "what tasks are open".
---

# Family Organizer — tasks

Use the `fo` CLI (installed at `~/.local/bin/fo`; source in `~/family-organizer/tools/fo-cli/`). It is signed in as the household's `claude-bot` account.

## Adding a task

```
fo task add "<title>" [--due today|tomorrow|YYYY-MM-DD] [--priority 0-5] [--assign <username>] [--notes "<details>"]
```

- Turn the user's words into a short, imperative title ("Replace furnace filter", not "the user wants the furnace filter replaced").
- Dates: relative phrases → `today` / `tomorrow` / an ISO date. "next Friday" → work out the date. No date mentioned → omit `--due`.
- Priority only if the user signals urgency (urgent/ASAP → 4–5, "when you get a chance" → 1). Otherwise omit.
- `--assign` takes a username; only use it when the user names a person. If the CLI says assignment needs an ADMIN bot, create the task without it and tell the user.
- Extra context the user gave (which store, why, a link) goes in `--notes`.

## Listing

```
fo task list [--status OPEN|IN_PROGRESS|BLOCKED|DONE]
```

## Reporting back

Relay the CLI's confirmation line (it includes the task number and due date). Don't invent details the CLI didn't return. If `fo` prints an error, show it and stop — don't retry with guessed arguments.
