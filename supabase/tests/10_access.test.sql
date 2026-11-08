-- Profiles, game creation / joining, visibility (RLS), column grants, anon lockout.
begin;

\set u1 '00000000-0000-0000-0000-0000000000a1'
\set u2 '00000000-0000-0000-0000-0000000000a2'
\set u3 '00000000-0000-0000-0000-0000000000a3'
\set u4 '00000000-0000-0000-0000-0000000000a4'

select tests.make_user(:'u1', 'olga@example.com', '{"full_name":"Olga Owner","avatar_url":"https://img/o.png"}');
select tests.make_user(:'u2', 'gil@example.com', '{"name":"Gil Guest","picture":"https://img/g.png"}');
select tests.make_user(:'u3', 'sam@example.com', '{}');
select tests.make_user(:'u4', null, '{}');

-- profiles are created from the Google metadata, with fallbacks
select tests.eq('profile: google full_name + avatar_url',
  (select display_name || '|' || avatar_url from public.profiles where id = :'u1'), 'Olga Owner|https://img/o.png');
select tests.eq('profile: falls back to name + picture',
  (select display_name || '|' || avatar_url from public.profiles where id = :'u2'), 'Gil Guest|https://img/g.png');
select tests.eq('profile: falls back to email local part',
  (select display_name from public.profiles where id = :'u3'), 'sam');
select tests.eq('profile: last resort',
  (select display_name from public.profiles where id = :'u4'), 'שחקן');

-- ---------------------------------------------------------------- create_game
select tests.as_user(:'u1');
select public.create_game(date '2026-11-05') as game \gset
select tests.eq('create_game: status is open',
  (select status::text from public.games where id = :'game'), 'open');
select tests.eq('create_game: owner is seated as a guest using the profile snapshot',
  (select role::text || '|' || display_name || '|' || avatar_url from public.game_players
    where game_id = :'game' and user_id = :'u1'), 'guest|Olga Owner|https://img/o.png');
select join_code from public.games where id = :'game' \gset
select tests.ok('join code is 8 upper-case hex chars', :'join_code' ~ '^[0-9A-F]{8}$');
select tests.ok('owner can read the game', tests.rows('select 1 from public.games') = 1);

select public.create_game(date '2026-11-06', false) as bench_game \gset
select tests.eq('create_game(join_as_player=false): owner is not seated',
  tests.rows(format('select 1 from public.game_players where game_id = %L', :'bench_game')), 0::bigint);

-- ---------------------------------------------------------------- strangers see nothing
select tests.as_user(:'u3');
select tests.eq('stranger: cannot see games', tests.rows('select 1 from public.games'), 0::bigint);
select tests.eq('stranger: cannot see players', tests.rows('select 1 from public.game_players'), 0::bigint);
select tests.eq('stranger: cannot see ledger', tests.rows('select 1 from public.transactions'), 0::bigint);
select tests.eq('stranger: cannot see settlements', tests.rows('select 1 from public.settlements'), 0::bigint);
select tests.eq('stranger: cannot see other profiles (only their own)',
  tests.rows('select 1 from public.profiles'), 1::bigint);

select tests.as_user(:'u1');
select tests.pid(:'game', 'Olga Owner') as owner_pid \gset
select tests.as_user(:'u3');
select tests.throws(
  format('insert into public.transactions (game_id, player_id, type, amount) values (%L, %L, ''buy_in'', 100)',
    :'game', :'owner_pid'),
  'row-level security');
select tests.throws(
  format('insert into public.game_players (game_id, display_name) values (%L, ''Intruder'')', :'game'),
  'row-level security');
select tests.eq('stranger: cannot edit the game',
  tests.affected(format('update public.games set played_on = date ''2030-01-01'' where id = %L', :'game')), 0::bigint);
select tests.throws(format('select public.close_game(%L, ''{}''::jsonb, ''x'')', :'game'), 'NOT_TABLE_MANAGER');

-- ---------------------------------------------------------------- join_game
select tests.as_user(:'u2');
select tests.throws($$select public.join_game('NOPE1234')$$, 'INVALID_JOIN_CODE');
select public.join_game(' ' || lower(:'join_code') || ' ') as joined \gset
select tests.eq('join_game: case/space-insensitive, returns the game id', :'joined'::uuid, :'game'::uuid);
select public.join_game(:'join_code');
select tests.eq('join_game: idempotent (one seat)',
  tests.rows(format('select 1 from public.game_players where game_id = %L and user_id = %L', :'game', :'u2')), 1::bigint);
select tests.eq('member: sees the game', tests.rows('select 1 from public.games'), 1::bigint);
select tests.eq('member: sees both players', tests.rows('select 1 from public.game_players'), 2::bigint);
select tests.eq('member: seat uses profile snapshot',
  (select display_name from public.game_players where user_id = :'u2'), 'Gil Guest');
select tests.eq('member: still sees only their own profile', tests.rows('select 1 from public.profiles'), 1::bigint);
select tests.eq('member: cannot edit the game',
  tests.affected(format('update public.games set played_on = date ''2030-01-01'' where id = %L', :'game')), 0::bigint);
select tests.throws(
  format('insert into public.game_players (game_id, display_name) values (%L, ''Extra'')', :'game'),
  'row-level security');

-- ---------------------------------------------------------------- column grants / direct writes
select tests.as_user(:'u1');
select tests.throws($$update public.games set status = 'closed'$$, 'permission denied');
select tests.throws($$update public.games set owner_id = owner_id$$, 'permission denied');
select tests.throws($$update public.games set join_code = 'AAAAAAAA'$$, 'permission denied');
select tests.eq('owner: can edit played_on while open',
  tests.affected(format('update public.games set played_on = date ''2026-11-07'' where id = %L', :'game')), 1::bigint);
select tests.throws($$delete from public.games$$, 'permission denied');
select tests.throws(format('insert into public.games (owner_id) values (%L)', :'u1'), 'permission denied');
select tests.throws(format('insert into public.settlements (game_id, closed_by, snapshot, whatsapp_text) values (%L, %L, ''{}'', ''x'')', :'game', :'u1'), 'permission denied');
select tests.throws(format('insert into public.game_players (game_id, user_id, display_name) values (%L, %L, ''X'')', :'game', :'u3'), 'permission denied');
select tests.throws($$update public.game_players set role = 'host'$$, 'permission denied');
select tests.throws($$update public.game_players set user_id = null$$, 'permission denied');

-- profiles: own display name/avatar only
select tests.eq('profile: user can rename themselves',
  tests.affected(format('update public.profiles set display_name = ''Olga O.'' where id = %L', :'u1')), 1::bigint);
select tests.eq('profile: cannot touch somebody else''s profile',
  tests.affected(format('update public.profiles set display_name = ''Hacked'' where id = %L', :'u2')), 0::bigint);
select tests.throws(format('update public.profiles set id = %L where id = %L', :'u3', :'u1'), 'permission denied');
select tests.throws($$delete from public.profiles$$, 'permission denied');
select tests.throws(format('insert into public.profiles (id) values (%L)', gen_random_uuid()), 'permission denied');

-- ---------------------------------------------------------------- anon is locked out of everything
select tests.as_anon();
select tests.throws('select * from public.games', 'permission denied');
select tests.throws('select * from public.game_players', 'permission denied');
select tests.throws('select * from public.transactions', 'permission denied');
select tests.throws('select * from public.settlements', 'permission denied');
select tests.throws('select * from public.profiles', 'permission denied');
select tests.throws('select * from public.game_balances', 'permission denied');
select tests.throws('select * from public.game_check', 'permission denied');
select tests.throws('select public.create_game()', 'permission denied');
select tests.throws(format('select public.join_game(%L)', :'join_code'), 'permission denied');
select tests.throws(format('select public.close_game(%L, ''{}''::jsonb, ''x'')', :'game'), 'permission denied');
select tests.throws(format('select public.void_transaction(%L)', gen_random_uuid()), 'permission denied');
select tests.throws(format('select public.set_player_role(%L, ''host'')', gen_random_uuid()), 'permission denied');
select tests.throws(format('select public.is_game_member(%L)', :'game'), 'permission denied');

rollback;
