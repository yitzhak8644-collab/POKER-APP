-- Seats: who may sit where, conflicts, and the guards around them.
begin;

\set u1 '00000000-0000-0000-0000-0000000000f1'
\set u2 '00000000-0000-0000-0000-0000000000f2'
\set u3 '00000000-0000-0000-0000-0000000000f3'

select tests.make_user(:'u1', 'olga@example.com', '{"full_name":"Olga"}');
select tests.make_user(:'u2', 'gil@example.com', '{"full_name":"Gil"}');
select tests.make_user(:'u3', 'sam@example.com', '{"full_name":"Sam"}');

select tests.as_user(:'u1');
select public.create_game() as game \gset
select join_code from public.games where id = :'game' \gset
select tests.add_player(:'game', 'Ben');
select tests.pid(:'game', 'Olga') as olga \gset
select tests.pid(:'game', 'Ben') as ben \gset
select tests.eq('new players have no seat yet',
  (select count(*) from public.game_players where game_id = :'game' and seat is not null), 0::bigint);

select tests.as_user(:'u2');
select public.join_game(:'join_code');
select tests.pid(:'game', 'Gil') as gil \gset

-- ---------------------------------------------------------------- a player seats themselves
select public.set_player_seat(:'gil', 3);
select tests.eq('player: picks their own seat',
  (select seat::int from public.game_players where id = :'gil'), 3);
select tests.eq('member: sees the owner''s player row and its (empty) seat',
  (select seat from public.game_players where id = :'olga'), null::smallint);

-- ---------------------------------------------------------------- but not anybody else's
select tests.throws(format('select public.set_player_seat(%L, 4)', :'ben'), 'SEAT_FORBIDDEN');
select tests.throws(format('select public.set_player_seat(%L, 4)', :'olga'), 'SEAT_FORBIDDEN');
select tests.throws(format('select public.set_player_seat(%L, 4)', gen_random_uuid()), 'PLAYER_NOT_FOUND');

-- ---------------------------------------------------------------- table manager seats anyone
select tests.as_user(:'u1');
select public.set_player_seat(:'ben', 5);
select tests.eq('owner: seats a player without an account',
  (select seat::int from public.game_players where id = :'ben'), 5);
select public.set_player_seat(:'gil', 4);
select tests.eq('owner: can move another player', (select seat::int from public.game_players where id = :'gil'), 4);
select public.set_player_seat(:'gil', 3);

-- ---------------------------------------------------------------- conflicts, moves, leaving
select tests.throws(format('select public.set_player_seat(%L, 3)', :'olga'), 'SEAT_TAKEN');
select tests.throws(format('select public.set_player_seat(%L, 5)', :'olga'), 'SEAT_TAKEN');
select tests.eq('a failed attempt leaves the player where they were',
  (select seat from public.game_players where id = :'olga'), null::smallint);
select public.set_player_seat(:'olga', 1);

select tests.as_user(:'u2');
select public.set_player_seat(:'gil', 2);
select tests.as_user(:'u1');
select public.set_player_seat(:'olga', 3);
select tests.eq('moving to a new seat frees the old one: Olga can take Gil''s old seat',
  (select seat::int from public.game_players where id = :'olga'), 3);

select tests.as_user(:'u2');
select public.set_player_seat(:'gil', null);
select tests.eq('leaving a seat', (select seat from public.game_players where id = :'gil'), null::smallint);
select tests.as_user(:'u1');
select public.set_player_seat(:'ben', 2);
select tests.eq('a left seat is free again', (select seat::int from public.game_players where id = :'ben'), 2);

select tests.eq('every seat number is unique per game',
  (select count(*) - count(distinct seat) from public.game_players where game_id = :'game' and seat is not null), 0::bigint);

-- ---------------------------------------------------------------- range
select tests.throws(format('select public.set_player_seat(%L, 0)', :'ben'), 'INVALID_SEAT');
select tests.throws(format('select public.set_player_seat(%L, 11)', :'ben'), 'INVALID_SEAT');
select tests.throws(format('select public.set_player_seat(%L, -1)', :'ben'), 'INVALID_SEAT');
select public.set_player_seat(:'ben', 10);
select tests.eq('seat 10 is valid and stored', (select seat::int from public.game_players where id = :'ben'), 10);

-- ---------------------------------------------------------------- seats are per game
select public.create_game() as game2 \gset
select public.set_player_seat(tests.pid(:'game2', 'Olga'), 3);
select tests.eq('the same seat number can be used in another game',
  (select count(*) from public.game_players where seat = 3), 2::bigint);

-- ---------------------------------------------------------------- strangers, anon, direct writes
select tests.as_user(:'u3');
select tests.throws(format('select public.set_player_seat(%L, 6)', :'ben'), 'SEAT_FORBIDDEN');
select tests.eq('stranger sees no seats', tests.rows('select 1 from public.game_players'), 0::bigint);

select tests.as_anon();
select tests.throws(format('select public.set_player_seat(%L, 6)', :'ben'), 'permission denied');

select tests.as_user(:'u1');
select tests.throws($$update public.game_players set seat = 7$$, 'permission denied');
select tests.throws(format('insert into public.game_players (game_id, display_name, seat) values (%L, ''Sneaky'', 7)', :'game'), 'permission denied');
select tests.as_user(:'u2');
select tests.throws($$update public.game_players set seat = 7$$, 'permission denied');

-- backstops, even for a privileged writer
select tests.as_super();
select tests.throws(format('update public.game_players set seat = 3 where id = %L', :'ben'), 'game_players_seat_uq');
select tests.throws(format('update public.game_players set seat = 11 where id = %L', :'ben'), 'game_players_seat_ck');

-- ---------------------------------------------------------------- a closed game keeps its seating frozen
select tests.as_user(:'u1');
select public.create_game() as game3 \gset
select tests.pid(:'game3', 'Olga') as olga3 \gset
select public.set_player_seat(:'olga3', 4);
select tests.tx(:'game3', 'Olga', 'buy_in', 100);
select tests.tx(:'game3', 'Olga', 'cash_out', 100);
select public.close_game(:'game3', '{}'::jsonb, 'summary');
select tests.throws(format('select public.set_player_seat(%L, 5)', :'olga3'), 'GAME_CLOSED');
select tests.throws(format('select public.set_player_seat(%L, null)', :'olga3'), 'GAME_CLOSED');
select tests.eq('closed game keeps the seat it had', (select seat::int from public.game_players where id = :'olga3'), 4);

rollback;
