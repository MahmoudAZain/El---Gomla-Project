#!/usr/bin/env bash
#
# What a hosted Supabase project looks like after `supabase db push`.
#
# Every other SQL suite applies the migrations *and* `seed.sql`, which is what
# `supabase db reset` does locally. Production is not built that way: `db push`
# applies migrations only, and never the seed. That gap hid a real deployment
# bug — the 27 governorates lived in the seed, so a freshly pushed production
# database had none, and with no governorate there is no checkout and no
# delivery-pricing screen to enter fees into.
#
# This builds a database exactly the way a deploy does and asserts that what the
# shop needs on day one is actually there.
#
# Usage:  PGHOST=127.0.0.1 PGPORT=54322 ./scripts/test-deploy-path.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-54322}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-postgres}"
export PGHOST PGPORT PGUSER PGPASSWORD

PSQL=(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -v ON_ERROR_STOP=1 -q)
DB="elgomala_deploy_path"

pass=0
fail=0

check() {
  local name="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  ✓ ${name}"
    pass=$((pass + 1))
  else
    echo "  ✗ ${name} — expected ${expected}, got ${actual}"
    fail=$((fail + 1))
  fi
}

"${PSQL[@]}" -d postgres -c "drop database if exists ${DB};" >/dev/null 2>&1
"${PSQL[@]}" -d postgres -c "create database ${DB};" >/dev/null 2>&1

# The harness supplies the pieces Supabase provides but a plain Postgres does
# not (the auth schema, auth.uid()). It contains no application data.
if ! "${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/tests/_harness.sql" >/dev/null 2>&1; then
  echo "✗ harness failed to apply"
  exit 1
fi

# Migrations only. No seed — that is the whole point.
for migration in "$ROOT"/supabase/migrations/*.sql; do
  if ! out=$("${PSQL[@]}" -d "$DB" -f "$migration" 2>&1); then
    echo "✗ migration $(basename "$migration") failed"
    echo "$out" | head -5
    exit 1
  fi
done

echo "after \`supabase db push\` (migrations only, no seed):"

q() { "${PSQL[@]}" -d "$DB" -At -c "$1" 2>/dev/null; }

# 1. The delivery-pricing screen has rows to show. Without these the admin
#    console cannot be used to set a fee, because there is nothing to set it on.
check "all 27 governorates present" \
  "$(q 'select count(*) from public.governorates')" "27"

# 2. Coverage and pricing are business decisions, so a deploy must not smuggle
#    any in. The business activates the first governorate from the admin.
check "none is active until the business says so" \
  "$(q 'select count(*) from public.governorates where is_active')" "0"

check "no delivery fee is set in code" \
  "$(q 'select count(*) from public.governorates where delivery_fee <> 0 or min_order_value <> 0')" "0"

# 3. Sample data belongs to local development and must never ship.
check "no sample products" "$(q 'select count(*) from public.products')" "0"
check "no sample categories" "$(q 'select count(*) from public.categories')" "0"
check "no sample brands" "$(q 'select count(*) from public.brands')" "0"
check "no promotions" "$(q 'select count(*) from public.promotions')" "0"

# 4. No account exists yet, and in particular no privileged one. The first admin
#    is created deliberately with scripts/bootstrap-admin.mjs, against a
#    password the operator chooses — never a default that ships in the repo.
check "no profiles, so no default credentials" \
  "$(q 'select count(*) from public.profiles')" "0"

# 5. The guarantees the storefront rests on are migration-resident, so they must
#    survive a push with no seed to help them.
check "RLS is enabled on orders" \
  "$(q "select relrowsecurity::text from pg_class where oid = 'public.orders'::regclass")" "true"

check "orders still have no INSERT policy for any role" \
  "$(q "select count(*) from pg_policies where schemaname='public' and tablename='orders' and cmd='INSERT'")" "0"

check "place_order() exists" \
  "$(q "select count(*) from pg_proc where proname = 'place_order'")" "1"

"${PSQL[@]}" -d postgres -c "drop database if exists ${DB};" >/dev/null 2>&1

echo
echo "──────────────────────────────────────────"
if [ "$fail" -gt 0 ]; then
  echo "  ${pass} passed, ${fail} FAILED — a deploy would come up broken"
  exit 1
fi
echo "  ${pass} passed — a pushed database is ready for launch configuration"
