-- General manager ("app admin"). Admins are listed in app_admins and can:
--   * see and manage every game (they count as the table manager everywhere: entries, roles, seats,
--     voiding, closing);
--   * open another table while one is already open;
--   * close a game even when the balance is not zero or cash-outs are missing (p_force);
--   * delete any game, including closed ones, with all its data.
-- Everyone else keeps the previous rules, now enforced in create_game instead of a unique index.

create table public.app_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

create function public.is_app_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins a where a.user_id = auth.uid());
$$;
revoke all on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;

insert into public.app_admins (user_id) values ('f9066254-fec2-42ee-ab39-ecd1206bdbc7')
on conflict do nothing;

-- Admins count as owner / member of every game (RLS and all owner-only RPCs go through these).
create or replace function public.is_game_owner(p_game_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_app_admin() or exists (
    select 1 from public.games g where g.id = p_game_id and g.owner_id = auth.uid()
  );
$$;

create or replace function public.is_game_member(p_game_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_app_admin() or exists (
    select 1 from public.games g where g.id = p_game_id and g.owner_id = auth.uid()
  ) or exists (
    select 1 from public.game_players gp where gp.game_id = p_game_id and gp.user_id = auth.uid()
  );
$$;

-- admin_delete_game() sets app.bypass_closed for its own transaction only.
create or replace function public.block_writes_when_closed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_game_id uuid;
  v_status public.game_status;
begin
  if current_setting('app.bypass_closed', true) = '1' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_game_id := case when tg_op = 'DELETE' then old.game_id else new.game_id end;
  select g.status into v_status from public.games g where g.id = v_game_id for share;
  if v_status = 'closed' then
    raise exception 'GAME_CLOSED' using errcode = 'PT409';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- One open table at a time for regular users; admins may open more.
drop index public.games_one_open;

create or replace function public.create_game(p_played_on date default current_date, p_join_as_player boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'PT401';
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'PT401';
  end if;

  if not public.is_app_admin() then
    -- Serialises concurrent opens so two people can never both pass the check.
    perform pg_advisory_xact_lock(hashtext('poker.create_game'));
    if exists (select 1 from public.games g where g.status = 'open') then
      raise exception 'OPEN_GAME_EXISTS' using errcode = 'PT409';
    end if;
  end if;

  insert into public.games (owner_id, played_on)
  values (v_uid, coalesce(p_played_on, current_date))
  returning id into v_id;

  if p_join_as_player then
    insert into public.game_players (game_id, user_id, display_name, avatar_url, created_by)
    values (v_id, v_uid, v_profile.display_name, v_profile.avatar_url, v_uid);
  end if;
  return v_id;
end;
$$;

-- close_game gains p_force: admins only, skips the roster / cash-out / zero-sum checks.
drop function public.close_game(uuid, jsonb, text);
create function public.close_game(
  p_game_id uuid, p_snapshot jsonb, p_whatsapp_text text, p_force boolean default false
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_game public.games%rowtype;
  v_force boolean := coalesce(p_force, false) and public.is_app_admin();
  v_players integer;
  v_hosts integer;
  v_spouses integer;
  v_missing integer;
  v_invested bigint;
  v_cash_out bigint;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'PT401';
  end if;
  select * into v_game from public.games g where g.id = p_game_id for update;
  if not found then
    raise exception 'GAME_NOT_FOUND' using errcode = 'PT404';
  end if;
  if v_game.owner_id <> auth.uid() and not public.is_app_admin() then
    raise exception 'NOT_TABLE_MANAGER' using errcode = 'PT403';
  end if;
  if v_game.status <> 'open' then
    raise exception 'GAME_CLOSED' using errcode = 'PT409';
  end if;
  if jsonb_typeof(p_snapshot) is distinct from 'object' or btrim(coalesce(p_whatsapp_text, '')) = '' then
    raise exception 'INVALID_SNAPSHOT' using errcode = 'PT422';
  end if;

  select count(*),
         count(*) filter (where gp.role = 'host'),
         count(*) filter (where gp.role = 'host_spouse')
    into v_players, v_hosts, v_spouses
    from public.game_players gp where gp.game_id = p_game_id;
  if v_players = 0 then
    raise exception 'NO_PLAYERS' using errcode = 'PT422';
  end if;

  if not v_force then
    if v_hosts > 1 or v_spouses > 1 or (v_hosts = 0 and v_spouses > 0) then
      raise exception 'INVALID_ROSTER' using errcode = 'PT422';
    end if;

    select count(*) into v_missing
      from public.game_players gp
     where gp.game_id = p_game_id
       and not exists (
         select 1 from public.transactions t
          where t.player_id = gp.id and t.type = 'cash_out' and t.voided_at is null
       );
    if v_missing > 0 then
      raise exception 'MISSING_CASH_OUT' using errcode = 'PT422';
    end if;

    select coalesce(sum(t.amount) filter (where t.type in ('buy_in', 'rebuy')), 0),
           coalesce(sum(t.amount) filter (where t.type = 'cash_out'), 0)
      into v_invested, v_cash_out
      from public.transactions t
     where t.game_id = p_game_id and t.voided_at is null;
    if v_invested <> v_cash_out then
      raise exception 'ZERO_SUM_MISMATCH' using errcode = 'PT422';
    end if;
  end if;

  update public.games set status = 'closed', closed_at = now() where id = p_game_id;
  insert into public.settlements (game_id, closed_by, snapshot, whatsapp_text)
  values (p_game_id, auth.uid(), p_snapshot, p_whatsapp_text);
end;
$$;

-- Admin only: permanently deletes a game (open or closed) with its players, ledger and settlement.
create function public.admin_delete_game(p_game_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'PT401';
  end if;
  if not public.is_app_admin() then
    raise exception 'NOT_ADMIN' using errcode = 'PT403';
  end if;
  if not exists (select 1 from public.games g where g.id = p_game_id) then
    raise exception 'GAME_NOT_FOUND' using errcode = 'PT404';
  end if;
  perform set_config('app.bypass_closed', '1', true); -- this transaction only
  delete from public.settlements where game_id = p_game_id;
  delete from public.transactions where game_id = p_game_id;
  delete from public.game_players where game_id = p_game_id;
  delete from public.games where id = p_game_id;
end;
$$;

revoke all on function public.close_game(uuid, jsonb, text, boolean) from public, anon, authenticated;
revoke all on function public.admin_delete_game(uuid) from public, anon, authenticated;
grant execute on function public.close_game(uuid, jsonb, text, boolean) to authenticated;
grant execute on function public.admin_delete_game(uuid) to authenticated;
