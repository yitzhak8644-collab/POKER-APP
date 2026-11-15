-- Online Texas Hold'em (play chips only for now).
-- The game runs in the `holdem` edge function, which is the only writer (service role):
--   holdem_tables      one row per table; `pub` is what everybody may see (sent over Realtime)
--   holdem_private     the full engine state incl. the deck and face-down cards; no client can read it
--   holdem_hole_cards  each player's own two cards for the hand that is being played
-- One open table at a time. Until the feature is opened to everyone only an admin may open a table.

create table if not exists public.holdem_settings (
  id boolean primary key default true check (id),
  open_to_all boolean not null default false
);
insert into public.holdem_settings (id) values (true) on conflict do nothing;
alter table public.holdem_settings enable row level security;
drop policy if exists holdem_settings_select on public.holdem_settings;
create policy holdem_settings_select on public.holdem_settings for select to authenticated using (true);

create table if not exists public.holdem_tables (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id),
  status text not null default 'open' check (status in ('open', 'closed')),
  version integer not null default 1,
  pub jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index if not exists holdem_tables_one_open on public.holdem_tables ((true)) where status = 'open';
alter table public.holdem_tables enable row level security;
drop policy if exists holdem_tables_select on public.holdem_tables;
create policy holdem_tables_select on public.holdem_tables for select to authenticated using (true);

create table if not exists public.holdem_private (
  table_id uuid primary key references public.holdem_tables (id) on delete cascade,
  version integer not null default 1,
  state jsonb not null
);
alter table public.holdem_private enable row level security;
-- no policies on purpose: only the service role (edge function) reads and writes it

create table if not exists public.holdem_hole_cards (
  table_id uuid not null references public.holdem_tables (id) on delete cascade,
  hand_no integer not null,
  user_id uuid not null,
  cards jsonb not null,
  primary key (table_id, hand_no, user_id)
);
alter table public.holdem_hole_cards enable row level security;
drop policy if exists holdem_hole_cards_select on public.holdem_hole_cards;
create policy holdem_hole_cards_select on public.holdem_hole_cards for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.holdem_create(p_owner uuid, p_state jsonb, p_pub jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.holdem_tables (owner_id, pub) values (p_owner, p_pub) returning id into v_id;
  insert into public.holdem_private (table_id, state) values (v_id, p_state);
  return v_id;
end;
$$;

-- Compare-and-swap: writes the new state only if nobody else wrote since it was read.
create or replace function public.holdem_commit(
  p_table_id uuid,
  p_expected integer,
  p_state jsonb,
  p_pub jsonb,
  p_closed boolean,
  p_hand_no integer,
  p_hole jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.holdem_private
     set state = p_state, version = version + 1
   where table_id = p_table_id and version = p_expected;
  if not found then
    return false;
  end if;
  update public.holdem_tables
     set pub = p_pub,
         version = p_expected + 1,
         updated_at = now(),
         status = case when p_closed then 'closed' else status end,
         closed_at = case when p_closed then now() else closed_at end
   where id = p_table_id;
  if p_hole is not null then
    delete from public.holdem_hole_cards where table_id = p_table_id and hand_no <> p_hand_no;
    insert into public.holdem_hole_cards (table_id, hand_no, user_id, cards)
    select p_table_id, p_hand_no, e.key::uuid, e.value from jsonb_each(p_hole) e
    on conflict do nothing;
  end if;
  return true;
end;
$$;

-- A table nobody touched for a long time is closed, so it cannot block opening a new one.
create or replace function public.holdem_close_stale(p_hours integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.holdem_private p
     set state = jsonb_set(p.state, '{closed}', 'true'), version = p.version + 1
    from public.holdem_tables t
   where t.id = p.table_id and t.status = 'open' and t.updated_at < now() - make_interval(hours => p_hours);
  update public.holdem_tables
     set status = 'closed', closed_at = now(), version = version + 1, pub = jsonb_set(pub, '{closed}', 'true')
   where status = 'open' and updated_at < now() - make_interval(hours => p_hours);
end;
$$;

revoke all on function public.holdem_create(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.holdem_commit(uuid, integer, jsonb, jsonb, boolean, integer, jsonb) from public, anon, authenticated;
revoke all on function public.holdem_close_stale(integer) from public, anon, authenticated;
grant execute on function public.holdem_create(uuid, jsonb, jsonb) to service_role;
grant execute on function public.holdem_commit(uuid, integer, jsonb, jsonb, boolean, integer, jsonb) to service_role;
grant execute on function public.holdem_close_stale(integer) to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'holdem_tables'
  ) then
    alter publication supabase_realtime add table public.holdem_tables;
  end if;
end;
$$;
