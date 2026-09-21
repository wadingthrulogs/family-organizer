---
name: fo-display
description: Switch the Family Organizer wall display between the family dashboard, kiosk, and private/guest mode (no household data shown). Use when the user says "switch the display to guest/private mode", "guests are coming", "hide our calendar on the wall", "put the display back to normal", "what's the display showing".
---

# Family Organizer — wall display mode

Use the `fo` CLI (`~/.local/bin/fo`). It is signed in as the household's `claude-bot` account.

```
fo display guest        # private mode: clock, weather, Wi-Fi QR, drink fridge, reading list — no household data
fo display dashboard    # the normal family dashboard
fo display kiosk        # the read-only family display
fo display              # show what it's currently set to
```

Aliases accepted: `private` → guest, `family`/`normal` → dashboard.

- "Private", "guest", "company's coming", "hide our stuff" → `guest`.
- "Back to normal", "family mode", "show the dashboard again" → `dashboard`.
- The wall display polls every 20 seconds, so tell the user it takes up to about 20 seconds to switch. Only devices flagged as the wall display follow the command; phones and laptops are unaffected.
- Switching *out* of guest mode this way bypasses the display PIN — that's intended (the command needs a signed-in household account, which is a stronger check than the PIN).

Relay the CLI's confirmation line.
