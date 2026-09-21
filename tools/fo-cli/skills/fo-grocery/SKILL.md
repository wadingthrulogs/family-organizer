---
name: fo-grocery
description: Add items to a Family Organizer grocery list, or show the lists. Use when the user says "add … to the grocery list", "we need milk", "put eggs on the Costco list", "what's on the shopping list".
---

# Family Organizer — grocery lists

Use the `fo` CLI (`~/.local/bin/fo`). It is signed in as the household's `claude-bot` account.

## Adding items

```
fo grocery add "<item>, <item>, <item>" [--list "<list name>"]
```

- Pass items exactly as the user said them, comma-separated — the app has a natural-language parser that understands quantities and units ("2 gallons milk", "1 dozen eggs", "3 lb apples"). Don't reformat or expand them.
- **Which list:** the household keeps several lists (per store). If the user names a store or list, pass it with `--list` (partial, case-insensitive match is fine: `--list costco`). If they don't and it isn't obvious, run `fo grocery lists` first and ask which one — don't guess when more than one list is active.

## Showing lists

```
fo grocery lists
```

## Reporting back

Relay the CLI's confirmation (it names the list and the items as parsed). If an item parsed oddly, say so — the user can fix it in the app.
