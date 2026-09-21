---
name: fo-inventory
description: Add or look up pantry/household inventory items in Family Organizer, including tagging drinks for the guest display's drink-fridge board. Use when the user says "add … to inventory", "we have 6 cans of…", "what's in the pantry", "what's low", "put … in the drink fridge".
---

# Family Organizer — inventory

Use the `fo` CLI (`~/.local/bin/fo`). It is signed in as the household's `claude-bot` account.

## Adding an item

```
fo inventory add "<name>" [--qty N] [--unit <unit>] [--category <category>] [--threshold N] [--drinks] [--notes "…"]
```

- One item per command. "6 cans of ginger beer" → `fo inventory add "Ginger beer" --qty 6 --unit cans`.
- `--category`: reuse the household's existing categories when you can (run `fo inventory list` to see them); common ones are Produce, Dairy, Meat, Dry Goods, Canned Goods, Spices, Soda, Beer, Water.
- `--threshold N` sets the low-stock alert level; only when the user asks for one.
- `--drinks` tags the item for the **drink fridge** board on the guest display. Use it when the user says drink fridge, guest drinks, or is clearly stocking beverages for visitors.

## Looking things up

```
fo inventory list [--search <text>] [--drinks] [--low]
```

`--low` shows items at or below their low-stock threshold; `--drinks` shows the drink-fridge board.

## Reporting back

Relay the CLI's confirmation line. To change quantities on an existing item, tell the user to do it in the app — the CLI only adds and lists.
