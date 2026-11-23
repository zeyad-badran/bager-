#!/usr/bin/env bash
# =============================================================================
# AT-09: two employees act on the same order at the same time, over TWO database
# connections. Exactly one transition succeeds; the other gets the conflict error
# (PT409) and then sees the latest state. READY is enqueued once (AT-05).
#
# Serves:   AT-09, AT-05, FR-10 · blueprint §5.1 (optimistic concurrency), §7.4
# Why a script and not a .sql test: the two sessions must be separate connections,
#           and a connection only sees another's work after COMMIT, so this test
#           commits a fixture order and removes it again at the end.
# How the race is forced (no timing luck involved):
#   session A (kitchen)  begin -> transition_order(v2 -> ready) -> holds the row lock 3 s -> commit
#   session B (cashier)  starts 1 s later with the same expected version; its
#                        SELECT ... FOR UPDATE must WAIT for A, then re-reads the row,
#                        finds version 3 and raises PT409.
#   The script also checks that B really waited (>= 1 s), which proves the two calls overlapped.
# Leaves behind: the fixture's audit rows (audit_logs is append-only by design).
#
# Usage:    DB_URL=postgresql://... bash supabase/tests/concurrency/at09_two_sessions_race.sh
#           (called by scripts/test-db.sh after the SQL tests; needs tests/support/10_helpers.sql)
# =============================================================================
set -euo pipefail

: "${DB_URL:?DB_URL must point at the test database}"
PSQL=(psql -X -q -tA -v ON_ERROR_STOP=1 "$DB_URL")

# A fresh fixture id every run: audit rows of earlier runs stay behind (append-only),
# so a fixed id would make the audit count below depend on how often the test has run.
ORDER_ID="$("${PSQL[@]}" -c "select gen_random_uuid()")"
KITCHEN="00000000-0000-4000-8000-000000000004"     # alpha_kitchen  (Downtown)
CASHIER="00000000-0000-4000-8000-000000000003"     # alpha_cashier  (Downtown)
HOLD_LOCK_SECONDS=3                                # how long session A keeps its transaction open
START_GAP_SECONDS=1                                # B starts this long after A
MIN_WAIT_MS=900                                    # B must have waited about START_GAP..HOLD for the lock

fail() { echo "   FAIL: $*" >&2; exit 1; }
pass() { echo "   PASS: $*"; }

cleanup() {
  "${PSQL[@]}" -c "delete from public.outbox_events where order_id = '$ORDER_ID'" \
               -c "delete from public.orders where id = '$ORDER_ID'" >/dev/null
}
trap cleanup EXIT

# Fixture: a preparing order (version 2) in Alpha Downtown, committed so both sessions see it.
cleanup
"${PSQL[@]}" -c "insert into public.orders (id, restaurant_id, branch_id, ticket_number, status, version)
                 values ('$ORDER_ID', '10000000-0000-4000-8000-000000000001',
                         '20000000-0000-4000-8000-000000000001', 'RACE', 'preparing', 2)" >/dev/null

out_a="$(mktemp)"; out_b="$(mktemp)"

# Session A: wins the lock and holds it.
psql -X -q -tA -v ON_ERROR_STOP=1 "$DB_URL" >"$out_a" 2>&1 <<SQL &
begin;
select tests.login_as('$KITCHEN');
select status || '/' || version from public.transition_order('$ORDER_ID', 2, 'ready');
select pg_sleep($HOLD_LOCK_SECONDS);
commit;
SQL
pid_a=$!

sleep "$START_GAP_SECONDS"

# Session B: same expected version, started while A holds the lock.
start_ms=$(date +%s%3N)
set +e
psql -X -q -tA -v ON_ERROR_STOP=1 "$DB_URL" >"$out_b" 2>&1 <<SQL
\set VERBOSITY verbose
begin;
select tests.login_as('$CASHIER');
select status || '/' || version from public.transition_order('$ORDER_ID', 2, 'ready');
commit;
SQL
status_b=$?
set -e
waited_ms=$(( $(date +%s%3N) - start_ms ))

wait "$pid_a" || { cat "$out_a" >&2; fail "AT-09 session A should have succeeded"; }

grep -q '^ready/3$' "$out_a" || { cat "$out_a" >&2; fail "AT-09 session A did not return ready/3"; }
pass "AT-09 session A (kitchen) wins: preparing -> ready, version 3"

[[ $status_b -ne 0 ]] || { cat "$out_b" >&2; fail "AT-09 session B must not succeed"; }
grep -q 'PT409' "$out_b" || { cat "$out_b" >&2; fail "AT-09 session B failed, but not with the conflict code PT409"; }
pass "AT-09 session B (cashier) is refused with the conflict code PT409"

(( waited_ms >= MIN_WAIT_MS )) || fail "AT-09 session B returned after ${waited_ms} ms: it did not wait for A's lock, so the calls did not overlap"
pass "AT-09 session B waited ${waited_ms} ms for A's row lock (the two calls really overlapped)"

latest="$("${PSQL[@]}" <<SQL
begin;
select tests.login_as('$CASHIER');
select status || '/' || version from public.orders where id = '$ORDER_ID';
commit;
SQL
)"
latest="$(grep -v '^$' <<<"$latest")"   # tests.login_as() returns void, which prints an empty line
[[ "$latest" == "ready/3" ]] || fail "AT-09 after the conflict session B should read ready/3, got '$latest'"
pass "AT-09 after the conflict, session B reads the latest state (ready/3)"

counts="$("${PSQL[@]}" -c "select (select count(*) from public.outbox_events where order_id = '$ORDER_ID')
                                 || '/' ||
                                 (select count(*) from public.audit_logs
                                   where entity_table = 'orders' and action = 'UPDATE' and entity_id = '$ORDER_ID')")"
[[ "$counts" == "1/1" ]] || fail "AT-09/AT-05 expected 1 outbox event and 1 audit UPDATE, got '$counts'"
pass "AT-05 the race produced exactly one order.ready event and one audited update"

rm -f "$out_a" "$out_b"
