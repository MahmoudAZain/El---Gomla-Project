#!/usr/bin/env bash
#
# T125 / FR-066 — the service-role key must never reach a browser.
#
# That key bypasses every Row Level Security policy in the system. If it were
# ever bundled into client JavaScript, every isolation guarantee this project
# rests on would be void — not degraded, void. Three things are supposed to
# prevent it (the `server-only` import in lib/supabase/service.ts, the ESLint
# rule restricting who may import that module, and serverEnv() throwing in the
# browser), and this checks that all three actually worked.
#
# It greps the built client chunks rather than reasoning about the module graph,
# because the module graph is exactly the thing that could be wrong.
#
# Run after `npm run build`:  ./scripts/check-client-bundle.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHUNKS="$ROOT/.next/static"

if [ ! -d "$CHUNKS" ]; then
  echo "✗ no client bundle at .next/static — run 'npm run build' first"
  exit 1
fi

fail=0

# 1. The variable name itself. Next.js only inlines NEXT_PUBLIC_* variables, so
#    the mere appearance of this name in a client chunk means something read it
#    from a module that reached the browser.
if grep -rl "SUPABASE_SERVICE_ROLE_KEY" "$CHUNKS" >/dev/null 2>&1; then
  echo "✗ SUPABASE_SERVICE_ROLE_KEY appears in the client bundle:"
  grep -rl "SUPABASE_SERVICE_ROLE_KEY" "$CHUNKS"
  fail=1
else
  echo "✓ SUPABASE_SERVICE_ROLE_KEY is absent from the client bundle"
fi

# 2. The key's actual value, when one is set in the environment. Catches the
#    case where a build inlined the secret without its name surviving.
if [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ] && [ ${#SUPABASE_SERVICE_ROLE_KEY} -ge 16 ]; then
  if grep -rlF "$SUPABASE_SERVICE_ROLE_KEY" "$CHUNKS" >/dev/null 2>&1; then
    echo "✗ the service-role key's value appears in the client bundle"
    fail=1
  else
    echo "✓ the service-role key's value is absent from the client bundle"
  fi
else
  echo "· service-role key not set in this environment — value check skipped"
fi

# 3. CRON_SECRET guards the scheduled endpoints, including the full data export.
if grep -rl "CRON_SECRET" "$CHUNKS" >/dev/null 2>&1; then
  echo "✗ CRON_SECRET appears in the client bundle"
  fail=1
else
  echo "✓ CRON_SECRET is absent from the client bundle"
fi

# 4. Informational only.
#
#    Next.js inlines the *value* of a NEXT_PUBLIC_* variable, not its name, so
#    the absence of the name above proves nothing on its own — hence the value
#    search in check 2.
#
#    Whether the public URL appears at all is a fact worth reporting but not a
#    failure either way. This application reaches Supabase entirely from the
#    server: pages render server-side and mutations go through Server Actions,
#    so the browser bundle may legitimately contain no Supabase configuration.
#    That is a stronger position than the usual one, not a broken build.
if [ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ] && grep -rlF "$NEXT_PUBLIC_SUPABASE_URL" "$CHUNKS" >/dev/null 2>&1; then
  echo "· the public Supabase URL is present in the bundle (expected if any browser client is used)"
else
  echo "· no Supabase configuration in the browser bundle — every call is server-side"
fi

echo
if [ "$fail" -eq 0 ]; then
  echo "──────────────────────────────────────────"
  echo "  client bundle is clean"
  exit 0
fi

echo "──────────────────────────────────────────"
echo "  SECRETS IN THE CLIENT BUNDLE — do not deploy"
exit 1
