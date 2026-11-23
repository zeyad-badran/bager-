#!/usr/bin/env bash
# =============================================================================
# Runs the database checks: migrations -> seed -> verify scripts -> SQL tests ->
# concurrency tests (supabase/tests/concurrency/*.sh, several connections at once, AT-09).
#
# Two modes (DB_MODE):
#   plain     (default) Builds a throwaway database on a plain PostgreSQL server,
#             loads a tiny Supabase imitation, applies every migration in order,
#             then seeds. Used by CI and for quick local runs.
#   supabase  Assumes `supabase db reset` has already applied migrations + seed
#             to the local Supabase stack. Only runs the verify scripts and tests.
#
# Environment:
#   DATABASE_URL_ADMIN  plain mode: admin connection used to (re)create the scratch DB
#                       default postgresql://postgres:postgres@127.0.0.1:5432/postgres
#   DATABASE_URL        supabase mode: the local stack's database
#                       (default postgresql://postgres:postgres@127.0.0.1:54322/postgres)
#
# Safety: plain mode DROPS and recreates the database named `bager_test`.
# Never point DATABASE_URL_ADMIN at a server that holds data you care about.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${DB_MODE:-plain}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1)

step() { printf '\n== %s\n' "$1"; }

case "$MODE" in
  plain)
    ADMIN_URL="${DATABASE_URL_ADMIN:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"
    TEST_DB="bager_test"
    # Swap the database name at the end of the URL (everything after the last slash).
    DB_URL="${ADMIN_URL%/*}/${TEST_DB}"

    step "Create scratch database ${TEST_DB}"
    "${PSQL[@]}" "$ADMIN_URL" -c "drop database if exists ${TEST_DB} with (force)" \
                              -c "create database ${TEST_DB}"

    step "Load Supabase stand-in (plain PostgreSQL only)"
    "${PSQL[@]}" "$DB_URL" -f supabase/tests/support/00_stub_supabase.sql

    step "Apply migrations in order"
    for f in $(ls supabase/migrations/*.sql | sort); do
      echo "  $f"
      "${PSQL[@]}" "$DB_URL" -f "$f"
    done

    step "Load synthetic seed"
    "${PSQL[@]}" "$DB_URL" -f supabase/seed.sql
    ;;
  supabase)
    DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
    ;;
  *)
    echo "Unknown DB_MODE '$MODE' (use plain or supabase)" >&2
    exit 2
    ;;
esac

# ---------------------------------------------------------------------------
# Verify scripts: read-only queries returning (check_name, ok). Any ok = false fails.
# These are the same scripts handed to Antigravity after a push.
# ---------------------------------------------------------------------------
step "Verify scripts"
for f in $(ls supabase/verify/*.sql | sort); do
  out="$("${PSQL[@]}" "$DB_URL" -tA -F '|' -f "$f")"
  if grep -q '|f$' <<<"$out"; then
    echo "  FAIL $f"; echo "$out" | sed 's/^/    /'; exit 1
  fi
  echo "  ok   $f ($(grep -c '|t$' <<<"$out") checks)"
done

# ---------------------------------------------------------------------------
# SQL tests. Each file runs in its own transaction and rolls back, so tests
# cannot affect each other. A failed assertion makes psql exit non-zero.
# ---------------------------------------------------------------------------
step "Load test helpers"
"${PSQL[@]}" "$DB_URL" -f supabase/tests/support/10_helpers.sql

step "Run tests"
for f in $(ls supabase/tests/*.sql | sort); do
  echo "-- $f"
  # Capture output AND the exit status: a failed assertion must fail the run.
  if out="$("${PSQL[@]}" "$DB_URL" -f "$f" 2>&1)"; then
    grep -E "PASS" <<<"$out" | sed 's/^psql:[^ ]* //; s/^/   /' || true
  else
    grep -E "PASS|FAIL|ERROR" <<<"$out" | sed 's/^psql:[^ ]* //; s/^/   /' || true
    echo "TEST FILE FAILED: $f" >&2
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# Concurrency tests: shell scripts that open SEVERAL connections at once (AT-09).
# They commit their own fixture rows and delete them again, so they run after the
# rolled-back SQL tests above. A non-zero exit fails the run.
# ---------------------------------------------------------------------------
step "Run concurrency tests"
for f in $(ls supabase/tests/concurrency/*.sh 2>/dev/null | sort); do
  echo "-- $f"
  if ! DB_URL="$DB_URL" bash "$f"; then
    echo "TEST FILE FAILED: $f" >&2
    exit 1
  fi
done

printf '\nAll database checks passed (mode: %s).\n' "$MODE"
