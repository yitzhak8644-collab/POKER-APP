-- SQL views must agree with the TypeScript engine's golden examples; plus security/realtime config.
begin;

\set u1 '00000000-0000-0000-0000-0000000000d1'
\set u2 '00000000-0000-0000-0000-0000000000d2'

select tests.make_user(:'u1', 'h@example.com', '{"full_name":"H"}');
select tests.make_user(:'u2', 'a@example.com', '{"full_name":"A"}');

-- ================================================================ golden #1 (engine: nets H+40 S-20 A-50 B+10 C+20)
select tests.as_user(:'u1');
select public.create_game() as g1 \gset
select tests.add_player(:'g1', 'S', 'host_spouse');
select tests.add_player(:'g1', 'A');
select tests.add_player(:'g1', 'B');
select tests.add_player(:'g1', 'C');
select public.set_player_role(tests.pid(:'g1', 'H'), 'host');
select tests.tx(:'g1', p, 'buy_in', 100) from unnest(array['H','S','A','B','C']) as p;
select tests.tx(:'g1', 'A', 'rebuy', 50);
select tests.tx(:'g1', 'H', 'cash_out', 140);
select tests.tx(:'g1', 'S', 'cash_out', 80);
select tests.tx(:'g1', 'A', 'cash_out', 100);
select tests.tx(:'g1', 'B', 'cash_out', 110);

select tests.eq('golden #1 (cash-out missing): status incomplete',
  (select status || '|' || missing_cash_outs from public.game_check where game_id = :'g1'), 'incomplete|1');
select tests.tx(:'g1', 'C', 'cash_out', 120);

select tests.eq('golden #1: invested / cash_out / net per player',
  (select string_agg(display_name || ':' || invested || '/' || cash_out || '/' || net, ' ' order by display_name)
     from public.game_balances where game_id = :'g1'),
  'A:150/100/-50 B:100/110/10 C:100/120/20 H:100/140/40 S:100/80/-20');
select tests.eq('golden #1: totals, diff and status',
  (select players || '|' || total_invested || '|' || total_cash_out || '|' || diff || '|' || missing_cash_outs || '|' || status
     from public.game_check where game_id = :'g1'),
  '5|550|550|0|0|ok');

-- mismatch: replace B's cash-out by 130 -> diff +20
select public.void_transaction((select id from public.transactions where player_name = 'B' and type = 'cash_out' and voided_at is null));
select tests.tx(:'g1', 'B', 'cash_out', 130);
select tests.eq('mismatch (positive diff)',
  (select diff || '|' || status from public.game_check where game_id = :'g1'), '20|mismatch');
select public.void_transaction((select id from public.transactions where player_name = 'B' and type = 'cash_out' and voided_at is null));
select tests.tx(:'g1', 'B', 'cash_out', 90);
select tests.eq('mismatch (negative diff)',
  (select diff || '|' || status from public.game_check where game_id = :'g1'), '-20|mismatch');

-- ================================================================ golden #2 neutral venue (nets A+30 B-10 C-20 D0)
select public.create_game() as g2 \gset
select tests.add_player(:'g2', 'B');
select tests.add_player(:'g2', 'C');
select tests.add_player(:'g2', 'D');
select tests.tx(:'g2', p, 'buy_in', 100) from unnest(array['H','B','C','D']) as p;
select tests.tx(:'g2', 'H', 'cash_out', 130);
select tests.tx(:'g2', 'B', 'cash_out', 90);
select tests.tx(:'g2', 'C', 'cash_out', 80);
select tests.tx(:'g2', 'D', 'cash_out', 100);   -- net 0 still counts as entered
select tests.eq('golden #2: nets (a net of 0 is entered, not missing)',
  (select string_agg(display_name || ':' || net, ' ' order by display_name) from public.game_balances where game_id = :'g2'),
  'B:-10 C:-20 D:0 H:30');
select tests.eq('golden #2: ok', (select diff || '|' || status from public.game_check where game_id = :'g2'), '0|ok');

-- busted player: cash-out 0 is entered
select public.create_game() as g3 \gset
select tests.add_player(:'g3', 'X');
select tests.tx(:'g3', 'H', 'buy_in', 100);
select tests.tx(:'g3', 'X', 'buy_in', 100);
select tests.tx(:'g3', 'X', 'cash_out', 0);
select tests.eq('cash-out 0 is not missing',
  (select missing_cash_outs || '|' || status from public.game_check where game_id = :'g3'), '1|incomplete');
select tests.tx(:'g3', 'H', 'cash_out', 200);
select tests.eq('busted player: net -100, status ok',
  (select string_agg(display_name || ':' || net, ' ' order by display_name) from public.game_balances where game_id = :'g3')
  || '|' || (select status from public.game_check where game_id = :'g3'), 'H:100 X:-100|ok');

-- voided rows never count
select tests.tx(:'g3', 'X', 'rebuy', 500);
select public.void_transaction((select id from public.transactions where game_id = :'g3' and amount = 500));
select tests.eq('voided rebuy is ignored',
  (select invested from public.game_balances where game_id = :'g3' and display_name = 'X'), 100);

-- views respect RLS (security_invoker)
select tests.as_user(:'u2');
select tests.eq('stranger sees no balances', tests.rows('select 1 from public.game_balances'), 0::bigint);
select tests.eq('stranger sees no checks', tests.rows('select 1 from public.game_check'), 0::bigint);

-- ================================================================ configuration guards
select tests.as_super();
select tests.eq('RLS is enabled on every table',
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 0::bigint);
select tests.eq('views run as the invoker',
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v' and not coalesce(c.reloptions::text like '%security_invoker=true%', false)), 0::bigint);
select tests.eq('every SECURITY DEFINER function pins search_path to empty',
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and not coalesce(p.proconfig @> array['search_path=""'], false)), 0::bigint);
select tests.eq('every function in public pins search_path (definer or not)',
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and not coalesce(p.proconfig @> array['search_path=""'], false)), 0::bigint);

select tests.ok('authenticated can call the RPCs',
  has_function_privilege('authenticated', 'public.close_game(uuid,jsonb,text)', 'execute')
  and has_function_privilege('authenticated', 'public.create_game(date,boolean)', 'execute')
  and has_function_privilege('authenticated', 'public.join_game(text)', 'execute')
  and has_function_privilege('authenticated', 'public.void_transaction(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.set_player_role(uuid,public.player_role)', 'execute')
  and has_function_privilege('authenticated', 'public.set_player_seat(uuid,integer)', 'execute'));
select tests.ok('anon cannot call any function',
  not has_function_privilege('anon', 'public.close_game(uuid,jsonb,text)', 'execute')
  and not has_function_privilege('anon', 'public.is_game_member(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.create_game(date,boolean)', 'execute')
  and not has_function_privilege('anon', 'public.set_player_seat(uuid,integer)', 'execute'));
select tests.ok('internal / trigger functions are not callable by API roles',
  not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute')
  and not has_function_privilege('authenticated', 'public.block_writes_when_closed()', 'execute')
  and not has_function_privilege('authenticated', 'public.tx_before_insert()', 'execute'));

select tests.eq('realtime publishes games, game_players and transactions',
  (select string_agg(tablename::text, ',' order by tablename) from pg_publication_tables where pubname = 'supabase_realtime'),
  'game_players,games,transactions');
select tests.eq('REPLICA IDENTITY FULL on the published tables',
  (select string_agg(relname::text, ',' order by relname) from pg_class
    where relname in ('games', 'game_players', 'transactions') and relnamespace = 'public'::regnamespace and relreplident = 'f'),
  'game_players,games,transactions');

rollback;
