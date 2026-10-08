#!/usr/bin/env sh
# Render start command for the API: bring the database up to date, then serve.
# Migrations and the seed are both idempotent (the seed never overwrites admin edits or the
# admin's password), so running them on every start keeps a fresh deploy and a restart identical.
set -eu
cd "$(dirname "$0")/../../apps/api"
export NODE_ENV=production
node dist/db/migrate.js
node dist/db/seed/index.js
exec node dist/server.js
