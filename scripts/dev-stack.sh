#!/usr/bin/env bash
# Bring up the whole local stack: Supabase (Postgres, Auth, Studio) and the
# self-hosted PowerSync service, and write .env.local if it is missing.
# Idempotent; safe to re-run. `--reset` re-applies migrations + seed and
# clears PowerSync's bucket storage so it re-snapshots from scratch.
set -euo pipefail
cd "$(dirname "$0")/.."

RESET=0
[[ "${1:-}" == "--reset" ]] && RESET=1

echo "▸ supabase start"
npx supabase start >/dev/null
if [[ $RESET == 1 ]]; then
  echo "▸ supabase db reset (migrations + seed)"
  docker compose -f powersync/docker-compose.yml stop >/dev/null 2>&1 || true
  npx supabase db reset
fi

PG_EXEC=(docker exec supabase_db_Sparehour psql -U postgres -d postgres -Atc)

echo "▸ ensuring logical replication and the PowerSync storage database"
"${PG_EXEC[@]}" "show wal_level" | grep -q logical \
  || { echo "wal_level is not logical; set it in supabase/config.toml"; exit 1; }
if [[ $RESET == 1 ]]; then
  "${PG_EXEC[@]}" "drop database if exists powersync_storage"
fi
"${PG_EXEC[@]}" "select 1 from pg_database where datname = 'powersync_storage'" | grep -q 1 \
  || "${PG_EXEC[@]}" "create database powersync_storage"

echo "▸ .env.local"
if [[ -f .env.local ]]; then
  echo "  exists, leaving it alone"
else
  eval "$(npx supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
  printf 'NEXT_PUBLIC_SUPABASE_URL=%s\nNEXT_PUBLIC_SUPABASE_ANON_KEY=%s\nSUPABASE_SERVICE_ROLE_KEY=%s\nNEXT_PUBLIC_POWERSYNC_URL=http://localhost:8080\n' \
    "$API_URL" "$ANON_KEY" "$SERVICE_ROLE_KEY" > .env.local
  echo "  written (local keys only; never commit it)"
fi

echo "▸ powersync (docker compose)"
docker compose -f powersync/docker-compose.yml up -d

echo "▸ waiting for PowerSync to be healthy"
for _ in $(seq 1 40); do
  if curl -fs http://localhost:8080/probes/liveness >/dev/null 2>&1; then
    echo "  PowerSync is up at http://localhost:8080"
    echo "▸ next: npm run dev, then sign in as dev@sparehour.local / sparehour"
    exit 0
  fi
  sleep 2
done
echo "PowerSync did not become healthy; see: docker compose -f powersync/docker-compose.yml logs"
exit 1
