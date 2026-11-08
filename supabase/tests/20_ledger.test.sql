-- The ledger: who can log what, immutability, voiding, players and roles.
begin;

\set u1 '00000000-0000-0000-0000-0000000000b1'
\set u2 '00000000-0000-0000-0000-0000000000b2'
\set u3 '00000000-0000-0000-0000-0000000000b3'

select tests.make_user(:'u1', 'olga@example.com', '{"full_name":"Olga","avatar_url":"https://img/o.png"}');
select tests.make_user(:'u2', 'gil@example.com', '{"full_name":"Gil","avatar_url":"https://img/g.png"}');
select tests.make_user(:'u3', 'sam@example.com', '{"full_name":"Sam"}');

select tests.as_user(:'u1');
select public.create_game() as game \gset
select public.create_game() as other_game \gset
select join_code from public.games where id = :'game' \gset
select tests.add_player(:'game', 'Ben', 'guest');
select tests.add_player(:'game', 'Dana', 'guest');
select tests.add_player(:'other_game', 'Elsewhere', 'guest');
select tests.pid(:'other_game', 'Elsewhere') as foreign_pid \gset

select tests.as_user(:'u2');
select public.join_game(:'join_code');

-- ---------------------------------------------------------------- logging
-- any member can log for any player; created_by is always the caller
select tests.tx(:'game', 'Ben', 'buy_in', 100);
select tests.eq('log: created_by is the caller, name snapshot taken, timestamp set',
  (select created_by::text || '|' || player_name || '|' || (created_at is not null)::text
     from public.transactions order by created_at limit 1), :'u2' || '|Ben|true');

select tests.as_user(:'u1');
select tests.tx(:'game', 'Ben', 'rebuy', 50);
select tests.tx(:'game', 'Olga', 'buy_in', 100);
select tests.eq('log: owner entry carries the owner''s avatar snapshot',
  (select player_avatar from public.transactions where player_name = 'Olga'), 'https://img/o.png');
select tests.eq('log: three entries visible to the owner', tests.rows('select 1 from public.transactions'), 3::bigint);

-- not allowed on insert: spoofing audit columns / voiding on insert
select tests.pid(:'game', 'Ben') as ben \gset
select tests.throws(
  format('insert into public.transactions (game_id, player_id, type, amount, created_by) values (%L, %L, ''buy_in'', 10, %L)', :'game', :'ben', :'u2'),
  'permission denied');
select tests.throws(
  format('insert into public.transactions (game_id, player_id, type, amount, voided_at) values (%L, %L, ''buy_in'', 10, now())', :'game', :'ben'),
  'permission denied');
select tests.throws(
  format('insert into public.transactions (game_id, player_id, type, amount, player_name) values (%L, %L, ''buy_in'', 10, ''Fake'')', :'game', :'ben'),
  'permission denied');

-- amount rules: buy-ins/rebuys positive, cash-out may be 0 (busted)
select tests.throws(format('insert into public.transactions (game_id, player_id, type, amount) values (%L, %L, ''buy_in'', 0)', :'game', :'ben'), 'tx_amount_ck');
select tests.throws(format('insert into public.transactions (game_id, player_id, type, amount) values (%L, %L, ''rebuy'', -50)', :'game', :'ben'), 'tx_amount_ck');
select tests.throws(format('insert into public.transactions (game_id, player_id, type, amount) values (%L, %L, ''cash_out'', -1)', :'game', :'ben'), 'tx_amount_ck');
select tests.tx(:'game', 'Dana', 'cash_out', 0);
select tests.eq('cash-out of 0 (busted) is accepted',
  (select amount from public.transactions where player_name = 'Dana' and type = 'cash_out'), 0);

-- player must belong to the same game
select tests.throws(
  format('insert into public.transactions (game_id, player_id, type, amount) values (%L, %L, ''buy_in'', 10)', :'game', :'foreign_pid'),
  'tx_player_game_fk');

-- one active cash-out per player
select tests.tx(:'game', 'Ben', 'cash_out', 130);
select tests.throws(
  format('insert into public.transactions (game_id, player_id, type, amount) values (%L, %L, ''cash_out'', 140)', :'game', :'ben'),
  'tx_one_active_cash_out');

-- stranger cannot log
select tests.as_user(:'u3');
select tests.throws(
  format('insert into public.transactions (game_id, player_id, type, amount) values (%L, %L, ''buy_in'', 10)', :'game', :'ben'),
  'row-level security');

-- ---------------------------------------------------------------- immutability
select tests.as_user(:'u1');
select tests.throws($$update public.transactions set amount = 1$$, 'permission denied');
select tests.throws($$update public.transactions set voided_at = now()$$, 'permission denied');
select tests.throws($$delete from public.transactions$$, 'permission denied');

-- the trigger also protects against privileged edits (e.g. service role / a future grant)
select tests.as_super();
select tests.throws($$update public.transactions set amount = amount + 1$$, 'LEDGER_IMMUTABLE');
select tests.throws($$update public.transactions set player_name = 'X'$$, 'LEDGER_IMMUTABLE');

-- ---------------------------------------------------------------- voiding (table manager only)
select tests.as_user(:'u1');
select t.id as rebuy_id from public.transactions t where type = 'rebuy' \gset
select t.id as ben_cash_out from public.transactions t where type = 'cash_out' and player_name = 'Ben' \gset

select tests.as_user(:'u2');
select tests.throws(format('select public.void_transaction(%L)', :'rebuy_id'), 'NOT_TABLE_MANAGER');

select tests.as_user(:'u1');
select tests.throws(format('select public.void_transaction(%L)', gen_random_uuid()), 'TX_NOT_FOUND');
select public.void_transaction(:'rebuy_id');
select tests.eq('void: stamps voided_by and voided_at, keeps the row',
  (select voided_by::text || '|' || (voided_at is not null)::text from public.transactions where id = :'rebuy_id'),
  :'u1' || '|true');
select tests.throws(format('select public.void_transaction(%L)', :'rebuy_id'), 'ALREADY_VOIDED');

-- a voided cash-out can be entered again
select public.void_transaction(:'ben_cash_out');
select tests.tx(:'game', 'Ben', 'cash_out', 120);
select tests.eq('cash-out can be re-entered after voiding',
  (select amount from public.transactions where player_name = 'Ben' and type = 'cash_out' and voided_at is null), 120);

-- ---------------------------------------------------------------- players
select tests.eq('owner: can rename a player',
  tests.affected(format('update public.game_players set display_name = ''Benny'' where id = %L', :'ben')), 1::bigint);
select tests.eq('audit log keeps the name at the time of the entry',
  (select player_name from public.transactions where id = :'rebuy_id'), 'Ben');
select tests.throws(format('delete from public.game_players where id = %L', :'ben'), 'tx_player_game_fk');

select tests.add_player(:'game', 'Temp');
select tests.eq('owner: can remove a player that has no ledger entries',
  tests.affected(format('delete from public.game_players where id = %L', tests.pid(:'game', 'Temp'))), 1::bigint);

select tests.as_user(:'u2');
select tests.eq('member: cannot rename players',
  tests.affected(format('update public.game_players set display_name = ''Hax'' where id = %L', :'ben')), 0::bigint);
select tests.eq('member: cannot remove players',
  tests.affected(format('delete from public.game_players where id = %L', tests.pid(:'game', 'Dana'))), 0::bigint);

-- ---------------------------------------------------------------- roles
select tests.as_user(:'u1');
select tests.pid(:'game', 'Dana') as dana \gset
select public.set_player_role(:'ben', 'host');
select tests.eq('role: Ben is host', (select role::text from public.game_players where id = :'ben'), 'host');
select public.set_player_role(:'dana', 'host');
select tests.eq('role: making Dana host atomically demotes Ben',
  (select string_agg(display_name || '=' || role, ',' order by display_name) from public.game_players
    where game_id = :'game' and display_name in ('Benny', 'Dana')), 'Benny=guest,Dana=host');
select public.set_player_role(:'ben', 'host_spouse');
select tests.pid(:'game', 'Olga') as olga \gset
select public.set_player_role(:'olga', 'host_spouse');
select tests.eq('role: making Olga spouse demotes the previous spouse',
  (select string_agg(display_name || '=' || role, ',' order by display_name) from public.game_players
    where game_id = :'game' and display_name in ('Benny', 'Olga')), 'Benny=guest,Olga=host_spouse');
select public.set_player_role(:'dana', 'guest');
select tests.eq('role: host can be removed (0 hosts is allowed)',
  (select count(*) from public.game_players where game_id = :'game' and role = 'host'), 0::bigint);

select tests.throws(
  format('insert into public.game_players (game_id, display_name, role) values (%L, ''Second spouse'', ''host_spouse'')', :'game'),
  'game_players_one_spouse');
select tests.add_player(:'game', 'The Host', 'host');
select tests.throws(
  format('insert into public.game_players (game_id, display_name, role) values (%L, ''Second host'', ''host'')', :'game'),
  'game_players_one_host');
select tests.throws(format('select public.set_player_role(%L, ''host'')', gen_random_uuid()), 'PLAYER_NOT_FOUND');

select tests.as_user(:'u2');
select tests.throws(format('select public.set_player_role(%L, ''host'')', :'ben'), 'NOT_TABLE_MANAGER');

rollback;
