-- Tiny assertion helpers for the SQL tests (no pgTAP needed).
create schema tests;
grant usage on schema tests to public;

create function tests.make_user(p_id uuid, p_email text, p_meta jsonb default '{}'::jsonb)
returns void language sql as $$
  insert into auth.users (id, email, raw_user_meta_data) values (p_id, p_email, p_meta);
$$;

create function tests.as_user(p_id uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', p_id::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
end
$$;

create function tests.as_anon() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
end
$$;

create function tests.as_super() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end
$$;

create function tests.ok(p_label text, p_cond boolean) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL [%]: condition is %', p_label, p_cond;
  end if;
  raise notice 'ok - %', p_label;
end
$$;

create function tests.eq(p_label text, p_actual anyelement, p_expected anyelement)
returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL [%]: expected <%>, got <%>', p_label, p_expected, p_actual;
  end if;
  raise notice 'ok - %', p_label;
end
$$;

-- Passes only if `q` raises an error whose message or SQLSTATE contains `p_pattern`.
create function tests.throws(q text, p_pattern text) returns void language plpgsql as $$
declare
  v_msg text;
begin
  begin
    execute q;
  exception when others then
    v_msg := sqlerrm || ' [' || sqlstate || ']';
    if v_msg ilike '%' || p_pattern || '%' then
      raise notice 'ok - throws % : %', p_pattern, left(q, 60);
      return;
    end if;
    raise exception 'FAIL: expected error like <%> but got <%> for: %', p_pattern, v_msg, q;
  end;
  raise exception 'FAIL: expected error like <%> but statement succeeded: %', p_pattern, q;
end
$$;

-- RLS silently filters UPDATE/DELETE, so negative write tests must look at the row count.
create function tests.affected(q text) returns bigint language plpgsql as $$
declare
  n bigint;
begin
  execute q;
  get diagnostics n = row_count;
  return n;
end
$$;

create function tests.rows(q text) returns bigint language plpgsql as $$
declare
  n bigint;
begin
  execute 'select count(*) from (' || q || ') s' into n;
  return n;
end
$$;

-- Insert a ledger row for the player with this display name (runs as the current role, so RLS applies).
create function tests.tx(p_game uuid, p_player text, p_type public.tx_type, p_amount integer)
returns void language plpgsql as $$
begin
  insert into public.transactions (game_id, player_id, type, amount)
  select p_game, gp.id, p_type, p_amount
    from public.game_players gp
   where gp.game_id = p_game and gp.display_name = p_player;
  if not found then
    raise exception 'tests.tx: no player % in game', p_player;
  end if;
end
$$;

create function tests.pid(p_game uuid, p_player text) returns uuid language sql stable as $$
  select gp.id from public.game_players gp where gp.game_id = p_game and gp.display_name = p_player
$$;

-- Add a player without an account (table manager only).
create function tests.add_player(p_game uuid, p_name text, p_role public.player_role default 'guest')
returns void language sql as $$
  insert into public.game_players (game_id, display_name, role) values (p_game, p_name, p_role);
$$;
