#!/bin/sh
set -e

SECRETS_FILE=/data/.secrets.env

# Generate secrets on first boot and persist them to the data volume
if [ ! -f "$SECRETS_FILE" ]; then
  echo "First boot: generating SESSION_SECRET and ENCRYPTION_KEY..."
  GEN_SESSION=$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")
  GEN_ENCRYPTION=$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))")
  printf 'SESSION_SECRET=%s\nENCRYPTION_KEY=%s\n' "$GEN_SESSION" "$GEN_ENCRYPTION" > "$SECRETS_FILE"
  echo "Secrets written to $SECRETS_FILE"
fi

# Load persisted secrets only if not already injected via env_file/environment
if [ -z "$SESSION_SECRET" ] || [ -z "$ENCRYPTION_KEY" ]; then
  . "$SECRETS_FILE"
  export SESSION_SECRET ENCRYPTION_KEY
fi

echo "Running Prisma migrations..."
npx prisma migrate deploy --schema ./prisma/schema.prisma

echo "Starting server..."
exec node dist/index.js
