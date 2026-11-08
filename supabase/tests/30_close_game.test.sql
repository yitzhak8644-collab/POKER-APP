-- close_game(): the server-side gate, plus immutability after closing.
begin;

\set u1 '00000000-0000-0000-0000-0000000000c1'
\set u2 '00000000-0000-0000-0000-0000000000c2'
\set u3 '00000000-0000-0000-0000-0000000000c3'

select tests.make_user(:'u1', 'h@example.com', '{"full_name":"H"}');
select tests.make_user(:'u2', 'gil@example.com', '{"full_name":"Gil"}');
select tests.make_user(:'u3', 'sam@example.com', '{"full_name":"Sam"}');

-- ================================================================ A. host + spouse + 3 guests (golden #1)
select tests.as_user(:'u1');
select public.create_game() as g1 \gset
select tests.add_player(:'g1', 'S', 'host_spouse');
select tests.add_player(:'g1', 'A');
select tests.add_player(:'g1', 'B');
select tests.add_player(:'g1', 'C');
select public.set_player_role(tests.pid(:'g1', 'H'), 'host');
select tests.tx(:'g1', p, 'buy_in', 100) from unnest(array['H','S','A','B','C']) as p;
select tests.tx(:'g1', 'A', 'rebuy', 50);   -- A invested 150

select tests.throws(format('select public.close_game(%L, ''{"x":1}''::jsonb, ''txt'')', :'g1'), 'MISSING_CASH_OUT');

-- H 140, S 80, A 100, B 110 entered; C missing -> still MISSING_CASH_OUT
select tests.tx(:'g1', 'H', 'cash_out', 140);
select tests.tx(:'g1', 'S', 'cash_out', 80);
select tests.tx(:'g1', 'A', 'cash_out', 100);
select tests.tx(:'g1', 'B', 'cash_out', 110);
select tests.throws(format('select public.close_game(%L, ''{"x":1}''::jsonb, ''txt'')', :'g1'), 'MISSING_CASH_OUT');

-- a wrong cash-out for C is a zero-sum mismatch
select tests.tx(:'g1', 'C', 'cash_out', 130);
select tests.throws(format('select public.close_game(%L, ''{"x":1}''::jsonb, ''txt'')', :'g1'), 'ZERO_SUM_MISMATCH');
select public.void_transaction((select id from public.transactions where player_name = 'C' and type = 'cash_out' and voided_at is null));
select tests.throws(format('select public.close_game(%L, ''{"x":1}''::jsonb, ''txt'')', :'g1'), 'MISSING_CASH_OUT');
select tests.tx(:'g1', 'C', 'cash_out', 120);

-- payload sanity
select tests.throws(format('select public.close_game(%L, ''[]''::jsonb, ''txt'')', :'g1'), 'INVALID_SNAPSHOT');
select tests.throws(format('select public.close_game(%L, ''{}''::jsonb, ''   '')', :'g1'), 'INVALID_SNAPSHOT');
select tests.throws(format('select public.close_game(%L, null, ''txt'')', :'g1'), 'INVALID_SNAPSHOT');
select tests.throws(format('select public.close_game(%L, ''{}''::jsonb, null)', :'g1'), 'INVALID_SNAPSHOT');
select tests.throws(format('select public.close_game(%L, ''{}''::jsonb, ''txt'')', gen_random_uuid()), 'GAME_NOT_FOUND');

-- only the table manager may close, even when everything is valid
select tests.as_user(:'u3');
select tests.throws(format('select public.close_game(%L, ''{"x":1}''::jsonb, ''txt'')', :'g1'), 'NOT_TABLE_MANAGER');

select tests.as_user(:'u1');
select public.close_game(:'g1', '{"pot":550,"fund":35}'::jsonb, 'summary text');
select tests.eq('closed: status and closed_at',
  (select status::text || '|' || (closed_at is not null)::text from public.games where id = :'g1'), 'closed|true');
select tests.eq('closed: settlement stored with closer, snapshot and text',
  (select closed_by::text || '|' || (snapshot ->> 'fund') || '|' || whatsapp_text from public.settlements where game_id = :'g1'),
  :'u1' || '|35|summary text');

-- everything is frozen now
select tests.throws(format('select tests.tx(%L, ''A'', ''buy_in'', 10)', :'g1'), 'GAME_CLOSED');
select tests.throws(format('select public.void_transaction(%L)', (select id from public.transactions where game_id = :'g1' and voided_at is null limit 1)), 'GAME_CLOSED');
select tests.throws(format('select public.set_player_role(%L, ''guest'')', tests.pid(:'g1', 'S')), 'GAME_CLOSED');
select tests.throws(format('select tests.add_player(%L, ''Late'')', :'g1'), 'GAME_CLOSED');
select tests.eq('closed: played_on can no longer be edited',
  tests.affected(format('update public.games set played_on = date ''2030-01-01'' where id = %L', :'g1')), 0::bigint);
select tests.eq('closed: players cannot be renamed',
  tests.affected(format('update public.game_players set display_name = ''Z'' where game_id = %L', :'g1')), 0::bigint);
select tests.eq('closed: players cannot be removed',
  tests.affected(format('delete from public.game_players where game_id = %L', :'g1')), 0::bigint);
select tests.throws(format('select public.close_game(%L, ''{}''::jsonb, ''txt'')', :'g1'), 'GAME_CLOSED');

-- even a privileged writer cannot reopen or edit a closed game
select tests.as_super();
select tests.throws(format('update public.games set status = ''open'' where id = %L', :'g1'), 'GAME_CLOSED');
select tests.throws(format('insert into public.transactions (game_id, player_id, type, amount) values (%L, %L, ''buy_in'', 5)', :'g1', tests.pid(:'g1', 'A')), 'GAME_CLOSED');

-- the closer's team can still read the result; strangers cannot
select tests.as_user(:'u1');
select tests.eq('closed: owner reads the settlement', tests.rows('select 1 from public.settlements'), 1::bigint);
select tests.as_user(:'u3');
select tests.eq('closed: stranger cannot read the settlement', tests.rows('select 1 from public.settlements'), 0::bigint);
select tests.as_user(:'u1');
select join_code as g1_code from public.games where id = :'g1' \gset
select tests.as_user(:'u3');
select tests.throws(format('select public.join_game(%L)', :'g1_code'), 'GAME_CLOSED');

-- ================================================================ B. neutral venue: 0 hosts closes fine (golden #2)
select tests.as_user(:'u1');
select public.create_game() as g2 \gset
select tests.add_player(:'g2', 'B');
select tests.add_player(:'g2', 'C');
select tests.add_player(:'g2', 'D');
select tests.tx(:'g2', p, 'buy_in', 100) from unnest(array['H','B','C','D']) as p;
select tests.tx(:'g2', 'H', 'cash_out', 130);
select tests.tx(:'g2', 'B', 'cash_out', 90);
select tests.tx(:'g2', 'C', 'cash_out', 80);
select tests.tx(:'g2', 'D', 'cash_out', 100);
select tests.eq('neutral: no host in the roster',
  (select count(*) from public.game_players where game_id = :'g2' and role <> 'guest'), 0::bigint);
select public.close_game(:'g2', '{"fund":40}'::jsonb, 'neutral summary');
select tests.eq('neutral venue (0 hosts) closes', (select status::text from public.games where id = :'g2'), 'closed');

-- ================================================================ C. roster rules, busted player, voided rows
select public.create_game() as g3 \gset
select tests.add_player(:'g3', 'Y');
select tests.add_player(:'g3', 'Spouse', 'host_spouse');
select tests.tx(:'g3', 'H', 'buy_in', 100);
select tests.tx(:'g3', 'Y', 'buy_in', 100);
select tests.tx(:'g3', 'Y', 'rebuy', 50);
select tests.tx(:'g3', 'Spouse', 'buy_in', 100);
-- mistaken extra rebuy that gets voided must not count
select tests.tx(:'g3', 'H', 'rebuy', 999);
select public.void_transaction((select id from public.transactions where game_id = :'g3' and amount = 999));
select tests.tx(:'g3', 'H', 'cash_out', 0);          -- busted
select tests.tx(:'g3', 'Y', 'cash_out', 250);
select tests.tx(:'g3', 'Spouse', 'cash_out', 100);
select tests.throws(format('select public.close_game(%L, ''{}''::jsonb, ''t'')', :'g3'), 'INVALID_ROSTER');  -- spouse without host
select public.set_player_role(tests.pid(:'g3', 'Spouse'), 'guest');
select public.close_game(:'g3', '{}'::jsonb, 't');
select tests.eq('busted player (cash-out 0) and voided rebuy are handled; game closes',
  (select status::text from public.games where id = :'g3'), 'closed');

-- ================================================================ D. no players / one player
select public.create_game(current_date, false) as g4 \gset
select tests.throws(format('select public.close_game(%L, ''{}''::jsonb, ''t'')', :'g4'), 'NO_PLAYERS');
select public.create_game() as g5 \gset
select tests.tx(:'g5', 'H', 'buy_in', 100);
select tests.tx(:'g5', 'H', 'cash_out', 100);
select public.close_game(:'g5', '{}'::jsonb, 't');
select tests.eq('a single seated player can close', (select status::text from public.games where id = :'g5'), 'closed');

rollback;
