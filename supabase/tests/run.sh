#!/usr/bin/env bash
# Applies the migrations to a throwaway local Postgres database and runs the SQL tests.
# Usage: npm run test:sql      (needs a local PostgreSQL server; no Supabase project involved)
set -euo pipefail
shopt -s nullglob

HERE="$(cd "$(dirname "$0")" && pwd)"
DB="${PGTEST_DB:-poker_sql_test}"
PGVER="${PGVER:-16}"

# Postgres refuses to run as root, so as root we go through the `postgres` OS user.
# SQL is fed over stdin, so that user needs no access to this checkout.
as_pg() {
  if [ "$(id -u)" -eq 0 ]; then su postgres -c "$1"; else bash -c "$1"; fi
}
psql_db() { as_pg "PGOPTIONS='-c client_min_messages=notice' psql -X -q -v ON_ERROR_STOP=1 -d $1"; }

# run <db> <file>: notices are shown compactly; any SQL error aborts with a non-zero exit.
run() {
  psql_db "$1" < "$2" 2>&1 >/dev/null | sed -E 's/^psql:[^ ]+ NOTICE:  /  /; s/^psql:[^ ]+ //'
}

fresh_db() { # fresh_db <db>: stub + migrations + helpers
  as_pg "psql -X -q -v ON_ERROR_STOP=1 -d postgres -c 'drop database if exists $1' -c 'create database $1'" 2>/dev/null
  run "$1" "$HERE/00_stub.sql"
  for m in "$HERE"/../migrations/*.sql; do run "$1" "$m"; done
  run "$1" "$HERE/01_helpers.sql"
}

if command -v pg_lsclusters >/dev/null && ! pg_lsclusters | grep -q online; then
  pg_ctlcluster "$PGVER" main start
  sleep 2
fi

echo "▶ stub + migrations"
fresh_db "$DB"

for t in "$HERE"/*.test.sql; do
  echo "▶ $(basename "$t")"
  run "$DB" "$t"
done

# --- concurrency: a buy-in racing close_game() must not slip into a closed game --------------
# Needs two real sessions, so it cannot live in a single-transaction .test.sql file.
echo "▶ concurrency: late buy-in vs close_game"
CDB="${DB}_conc"
fresh_db "$CDB"
U=00000000-0000-0000-0000-0000000000e1
psql_db "$CDB" <<SQL >/dev/null
select tests.make_user('$U', 'o@example.com', '{"full_name":"O"}');
begin;
select tests.as_user('$U');
select public.create_game();
select tests.tx((select id from public.games limit 1), 'O', 'buy_in', 100);
select tests.tx((select id from public.games limit 1), 'O', 'cash_out', 100);
commit;
SQL
GID=$(as_pg "psql -X -At -d $CDB -c 'select id from public.games'")

# session A: closes the game, then keeps the transaction open for 3s before committing
psql_db "$CDB" >/dev/null <<SQL &
begin;
select tests.as_user('$U');
select public.close_game('$GID', '{"x":1}', 't');
select pg_sleep(3);
commit;
SQL
A_PID=$!
sleep 1
START=$(date +%s)
set +e
B_OUT=$(psql_db "$CDB" 2>&1 <<SQL
begin;
select tests.as_user('$U');
select tests.tx('$GID', 'O', 'buy_in', 5);
SQL
)
B_STATUS=$?
set -e
ELAPSED=$(( $(date +%s) - START ))
wait "$A_PID"

if [ "$B_STATUS" -eq 0 ] || ! grep -q GAME_CLOSED <<<"$B_OUT"; then
  echo "FAIL: late buy-in was not rejected with GAME_CLOSED (status=$B_STATUS): $B_OUT"
  exit 1
fi
if [ "$ELAPSED" -lt 2 ]; then
  echo "FAIL: late buy-in did not wait for close_game's lock (${ELAPSED}s)"
  exit 1
fi
echo "  ok - late buy-in waited ${ELAPSED}s for the lock, then failed with GAME_CLOSED"
# --- concurrency: two people grabbing the same seat at the same moment ----------------------
# The loser must get SEAT_TAKEN (a stable key), not a raw unique-violation error.
echo "▶ concurrency: same seat, two sessions"
psql_db "$CDB" <<SQL >/dev/null
begin;
select tests.as_user('$U');
select public.create_game();
select tests.add_player((select id from public.games order by created_at desc limit 1), 'P1');
select tests.add_player((select id from public.games order by created_at desc limit 1), 'P2');
commit;
SQL
P1=$(as_pg "psql -X -At -d $CDB -c \"select id from public.game_players where display_name = 'P1'\"")
P2=$(as_pg "psql -X -At -d $CDB -c \"select id from public.game_players where display_name = 'P2'\"")
psql_db "$CDB" >/dev/null <<SQL &
begin;
select tests.as_user('$U');
select public.set_player_seat('$P1', 5);
select pg_sleep(3);
commit;
SQL
A_PID=$!
sleep 1
START=$(date +%s)
set +e
B_OUT=$(psql_db "$CDB" 2>&1 <<SQL
begin;
select tests.as_user('$U');
select public.set_player_seat('$P2', 5);
SQL
)
B_STATUS=$?
set -e
ELAPSED=$(( $(date +%s) - START ))
wait "$A_PID"
if [ "$B_STATUS" -eq 0 ] || ! grep -q SEAT_TAKEN <<<"$B_OUT" || grep -q "duplicate key" <<<"$B_OUT"; then
  echo "FAIL: the second person to pick seat 5 did not get SEAT_TAKEN (status=$B_STATUS): $B_OUT"
  exit 1
fi
if [ "$ELAPSED" -lt 2 ]; then
  echo "FAIL: the second seat request did not wait for the first transaction (${ELAPSED}s)"
  exit 1
fi
echo "  ok - second request waited ${ELAPSED}s, then failed with SEAT_TAKEN"
as_pg "psql -X -q -d postgres -c 'drop database if exists $CDB'" 2>/dev/null

echo "SQL tests passed"
