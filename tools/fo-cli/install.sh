#!/usr/bin/env bash
# Installs the fo CLI and its Claude Code skills for the current user.
#   ~/.local/bin/fo                → wrapper for tools/fo-cli/fo.mjs
#   ~/.claude/skills/fo-*          → symlinks to tools/fo-cli/skills/*
# Credentials go in ~/.config/family-organizer/cli.env (see fo.mjs header).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$HOME/.local/bin" "$HOME/.claude/skills"
printf '#!/usr/bin/env bash\nexec node "%s/fo.mjs" "$@"\n' "$HERE" > "$HOME/.local/bin/fo"
chmod +x "$HOME/.local/bin/fo"
for d in "$HERE"/skills/*/; do
  name="$(basename "$d")"
  ln -sfn "$d" "$HOME/.claude/skills/$name"
done
echo "fo → $HOME/.local/bin/fo"
echo "skills → $(ls -d "$HOME"/.claude/skills/fo-* | xargs -n1 basename | tr '\n' ' ')"
if [ ! -f "$HOME/.config/family-organizer/cli.env" ]; then
  echo "NOTE: create $HOME/.config/family-organizer/cli.env with FO_BASE_URL, FO_USERNAME, FO_PASSWORD (chmod 600)"
fi
