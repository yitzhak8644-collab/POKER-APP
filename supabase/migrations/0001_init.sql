-- Poker Tracker — initial schema.
-- Money is whole NIS (integer). The ledger (`transactions`) is append-only:
-- corrections are made by voiding a row and entering a new one.
--
-- Business-rule errors use stable message keys and PostgREST-friendly SQLSTATEs
-- (PT401/403/404/409/422 map to the HTTP status), e.g. GAME_CLOSED, ZERO_SUM_MISMATCH.

---------------------------------------------------------------- types
create type public.game_status as enum ('open', 'closed');
create type public.player_role as enum ('guest', 'host', 'host_spouse');
create type public.tx_type as enum ('buy_in', 'rebuy', 'cash_out');

---------------------------------------------------------------- tables
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id),
  played_on date not null default current_date,
  status public.game_status not null default 'open',
  join_code text not null unique
    default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  -- NULL = a player without an account (e.g. the host's spouse), added by the table manager
  user_id uuid references public.profiles (id),
  display_name text not null check (length(btrim(display_name)) > 0),
  avatar_url text,
  role public.player_role not null default 'guest',
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (id, game_id)
);
create unique index game_players_user_uq on public.game_players (game_id, user_id)
  where user_id is not null;
create unique index game_players_one_host on public.game_players (game_id)
  where role = 'host';
create unique index game_players_one_spouse on public.game_players (game_id)
  where role = 'host_spouse';

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null,
  player_id uuid not null,
  type public.tx_type not null,
  amount integer not null,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  -- snapshot of who the entry was for, so the audit log stays stable if a player is renamed
  player_name text not null default '',
  player_avatar text,
  voided_at timestamptz,
  voided_by uuid references public.profiles (id),
  note text,
  -- a busted player's cash-out of 0 is valid; buy-ins and rebuys must be positive
  constraint tx_amount_ck check (
    (type = 'cash_out' and amount >= 0) or (type <> 'cash_out' and amount > 0)
  ),
  -- the player must belong to the same game; RESTRICT so ledger rows can never be cascaded away
  constraint tx_player_game_fk foreign key (player_id, game_id)
    references public.game_players (id, game_id) on delete restrict,
  constraint tx_game_fk foreign key (game_id) references public.games (id) on delete cascade
);
create unique index tx_one_active_cash_out on public.transactions (player_id)
  where type = 'cash_out' and voided_at is null;
create index tx_game_created_idx on public.transactions (game_id, created_at);

create table public.settlements (
  game_id uuid primary key references public.games (id) on delete cascade,
  closed_by uuid not null references public.profiles (id),
  snapshot jsonb not null,
  whatsapp_text text not null,
  created_at timestamptz not null default now()
);

---------------------------------------------------------------- helper functions (RLS)
create function public.is_game_owner(p_game_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.games g where g.id = p_game_id and g.owner_id = auth.uid()
  );
$$;

create function public.is_game_member(p_game_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.games g where g.id = p_game_id and g.owner_id = auth.uid()
  ) or exists (
    select 1 from public.game_players gp where gp.game_id = p_game_id and gp.user_id = auth.uid()
  );
$$;

create function public.is_game_open(p_game_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.games g where g.id = p_game_id and g.status = 'open'
  );
$$;

---------------------------------------------------------------- triggers
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'שחקן'
    ),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger games_touch before update on public.games
  for each row execute function public.touch_updated_at();

-- A closed game is immutable.
create function public.games_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'closed' then
    raise exception 'GAME_CLOSED' using errcode = 'PT409';
  end if;
  return new;
end;
$$;

create trigger games_guard before update on public.games
  for each row execute function public.games_guard();

-- Blocks writes to a closed game. The FOR SHARE lock serialises against close_game()
-- (which holds FOR UPDATE), so nothing can slip in between its checks and its commit.
-- SECURITY DEFINER because FOR SHARE needs UPDATE privilege + an UPDATE policy on games.
create function public.block_writes_when_closed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_game_id uuid;
  v_status public.game_status;
begin
  v_game_id := case when tg_op = 'DELETE' then old.game_id else new.game_id end;
  select g.status into v_status from public.games g where g.id = v_game_id for share;
  if v_status = 'closed' then
    raise exception 'GAME_CLOSED' using errcode = 'PT409';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger tx_block_closed before insert or update on public.transactions
  for each row execute function public.block_writes_when_closed();
create trigger players_block_closed before insert or update or delete on public.game_players
  for each row execute function public.block_writes_when_closed();

-- Snapshot the player's name/avatar into the ledger row.
create function public.tx_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select gp.display_name, gp.avatar_url
    into new.player_name, new.player_avatar
    from public.game_players gp
   where gp.id = new.player_id;
  return new;
end;
$$;

create trigger tx_snapshot before insert on public.transactions
  for each row execute function public.tx_before_insert();

-- The only allowed UPDATE on a ledger row is voiding it, once.
create function public.tx_void_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.id, new.game_id, new.player_id, new.type, new.amount, new.created_by,
      new.created_at, new.player_name, new.player_avatar, new.note)
     is distinct from
     (old.id, old.game_id, old.player_id, old.type, old.amount, old.created_by,
      old.created_at, old.player_name, old.player_avatar, old.note) then
    raise exception 'LEDGER_IMMUTABLE' using errcode = 'PT422';
  end if;
  if old.voided_at is not null then
    raise exception 'ALREADY_VOIDED' using errcode = 'PT409';
  end if;
  return new;
end;
$$;

create trigger tx_void_only before update on public.transactions
  for each row execute function public.tx_void_only();

---------------------------------------------------------------- RPCs
create function public.create_game(p_played_on date default current_date, p_join_as_player boolean default true)
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

create function public.join_game(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_game public.games%rowtype;
  v_profile public.profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'PT401';
  end if;
  select * into v_game from public.games g where g.join_code = upper(btrim(p_code));
  if not found then
    raise exception 'INVALID_JOIN_CODE' using errcode = 'PT404';
  end if;
  if public.is_game_member(v_game.id) then
    return v_game.id; -- idempotent
  end if;
  if v_game.status <> 'open' then
    raise exception 'GAME_CLOSED' using errcode = 'PT409';
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  insert into public.game_players (game_id, user_id, display_name, avatar_url, created_by)
  values (v_game.id, v_uid, v_profile.display_name, v_profile.avatar_url, v_uid)
  on conflict (game_id, user_id) where user_id is not null do nothing;
  return v_game.id;
end;
$$;

-- Atomic role change (table manager only). Making X the host demotes the current host,
-- making X the spouse demotes the current spouse; both happen in one transaction.
create function public.set_player_role(p_player_id uuid, p_role public.player_role)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_game_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'PT401';
  end if;
  select gp.game_id into v_game_id from public.game_players gp where gp.id = p_player_id;
  if not found then
    raise exception 'PLAYER_NOT_FOUND' using errcode = 'PT404';
  end if;
  if not public.is_game_owner(v_game_id) then
    raise exception 'NOT_TABLE_MANAGER' using errcode = 'PT403';
  end if;
  if p_role <> 'guest' then
    update public.game_players
       set role = 'guest'
     where game_id = v_game_id and role = p_role and id <> p_player_id;
  end if;
  update public.game_players set role = p_role where id = p_player_id;
end;
$$;

create function public.void_transaction(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_tx public.transactions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'PT401';
  end if;
  select * into v_tx from public.transactions t where t.id = p_id for update;
  if not found then
    raise exception 'TX_NOT_FOUND' using errcode = 'PT404';
  end if;
  if not public.is_game_owner(v_tx.game_id) then
    raise exception 'NOT_TABLE_MANAGER' using errcode = 'PT403';
  end if;
  if v_tx.voided_at is not null then
    raise exception 'ALREADY_VOIDED' using errcode = 'PT409';
  end if;
  update public.transactions set voided_at = now(), voided_by = auth.uid() where id = p_id;
end;
$$;

-- Closes the game. Enforced here regardless of what the client computed:
-- table manager only; >= 1 player; <= 1 host and <= 1 spouse; a spouse needs a host
-- (0 hosts is valid = neutral venue); every player has an active cash-out;
-- total cash-out == total buy-ins + rebuys (voided rows ignored).
create function public.close_game(p_game_id uuid, p_snapshot jsonb, p_whatsapp_text text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_game public.games%rowtype;
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
  if v_game.owner_id <> auth.uid() then
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

  update public.games set status = 'closed', closed_at = now() where id = p_game_id;
  insert into public.settlements (game_id, closed_by, snapshot, whatsapp_text)
  values (p_game_id, auth.uid(), p_snapshot, p_whatsapp_text);
end;
$$;

---------------------------------------------------------------- views (audit / SQL parity)
create view public.game_balances with (security_invoker = true) as
select gp.game_id,
       gp.id as player_id,
       gp.display_name,
       gp.role,
       coalesce(sum(t.amount) filter (where t.type in ('buy_in', 'rebuy') and t.voided_at is null), 0)::integer
         as invested,
       (sum(t.amount) filter (where t.type = 'cash_out' and t.voided_at is null))::integer
         as cash_out,
       ((sum(t.amount) filter (where t.type = 'cash_out' and t.voided_at is null))
         - coalesce(sum(t.amount) filter (where t.type in ('buy_in', 'rebuy') and t.voided_at is null), 0))::integer
         as net
  from public.game_players gp
  left join public.transactions t on t.player_id = gp.id
 group by gp.game_id, gp.id, gp.display_name, gp.role;

create view public.game_check with (security_invoker = true) as
select b.game_id,
       count(*)::integer as players,
       coalesce(sum(b.invested), 0)::integer as total_invested,
       coalesce(sum(b.cash_out), 0)::integer as total_cash_out,
       (coalesce(sum(b.cash_out), 0) - coalesce(sum(b.invested), 0))::integer as diff,
       (count(*) filter (where b.cash_out is null))::integer as missing_cash_outs,
       case
         when count(*) filter (where b.cash_out is null) > 0 then 'incomplete'
         when coalesce(sum(b.cash_out), 0) = coalesce(sum(b.invested), 0) then 'ok'
         else 'mismatch'
       end as status
  from public.game_balances b
 group by b.game_id;

---------------------------------------------------------------- row level security
alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.transactions enable row level security;
alter table public.settlements enable row level security;

-- Profiles are private: names/avatars of other players come from the game_players snapshot.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy games_select on public.games for select to authenticated
  using (public.is_game_member(id));
create policy games_update on public.games for update to authenticated
  using (public.is_game_owner(id) and status = 'open')
  with check (public.is_game_owner(id));

create policy game_players_select on public.game_players for select to authenticated
  using (public.is_game_member(game_id));
create policy game_players_insert on public.game_players for insert to authenticated
  with check (
    user_id is null and created_by = auth.uid()
    and public.is_game_owner(game_id) and public.is_game_open(game_id)
  );
create policy game_players_update on public.game_players for update to authenticated
  using (public.is_game_owner(game_id) and public.is_game_open(game_id))
  with check (public.is_game_owner(game_id));
create policy game_players_delete on public.game_players for delete to authenticated
  using (public.is_game_owner(game_id) and public.is_game_open(game_id));

create policy transactions_select on public.transactions for select to authenticated
  using (public.is_game_member(game_id));
create policy transactions_insert on public.transactions for insert to authenticated
  with check (
    created_by = auth.uid() and voided_at is null and voided_by is null
    and public.is_game_member(game_id) and public.is_game_open(game_id)
  );

create policy settlements_select on public.settlements for select to authenticated
  using (public.is_game_member(game_id));

---------------------------------------------------------------- privileges (least privilege)
revoke all on public.profiles, public.games, public.game_players, public.transactions,
  public.settlements, public.game_balances, public.game_check from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant select on public.games to authenticated;
grant update (played_on) on public.games to authenticated;       -- status only via close_game()
grant select on public.game_players to authenticated;
grant insert (game_id, display_name, avatar_url, role) on public.game_players to authenticated;
grant update (display_name, avatar_url) on public.game_players to authenticated; -- role via set_player_role()
grant delete on public.game_players to authenticated;
grant select on public.transactions to authenticated;
grant insert (game_id, player_id, type, amount, note) on public.transactions to authenticated;
grant select on public.settlements to authenticated;
grant select on public.game_balances, public.game_check to authenticated;

revoke all on function
  public.is_game_owner(uuid), public.is_game_member(uuid), public.is_game_open(uuid),
  public.handle_new_user(), public.touch_updated_at(), public.games_guard(),
  public.block_writes_when_closed(), public.tx_before_insert(), public.tx_void_only(),
  public.create_game(date, boolean), public.join_game(text),
  public.set_player_role(uuid, public.player_role), public.void_transaction(uuid),
  public.close_game(uuid, jsonb, text)
  from public, anon, authenticated;

-- RLS helpers run as the caller inside policies, so they need EXECUTE; RPCs are the public API.
grant execute on function
  public.is_game_owner(uuid), public.is_game_member(uuid), public.is_game_open(uuid),
  public.create_game(date, boolean), public.join_game(text),
  public.set_player_role(uuid, public.player_role), public.void_transaction(uuid),
  public.close_game(uuid, jsonb, text)
  to authenticated;

---------------------------------------------------------------- realtime
-- RLS applies to Realtime, so subscribers only receive rows of games they belong to.
-- REPLICA IDENTITY FULL so UPDATE/DELETE payloads carry game_id (needed for filters).
alter table public.games replica identity full;
alter table public.game_players replica identity full;
alter table public.transactions replica identity full;
alter publication supabase_realtime add table public.games, public.game_players, public.transactions;
