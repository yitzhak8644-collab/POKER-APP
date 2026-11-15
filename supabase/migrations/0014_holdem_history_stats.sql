-- Hand history and personal statistics.
--   holdem_hands         one row per finished hand: the public summary (board, winners, face-up cards only)
--   holdem_hand_players  one row per player per hand (net chips, won, 7-2), the source for statistics
-- Both are written only by holdem_commit (the edge function), in the same transaction as the game state.

create table if not exists public.holdem_hands (
  table_id uuid not null references public.holdem_tables (id) on delete cascade,
  hand_no integer not null,
  played_at timestamptz not null default now(),
  summary jsonb not null,
  primary key (table_id, hand_no)
);
alter table public.holdem_hands enable row level security;
drop policy if exists holdem_hands_select on public.holdem_hands;
create policy holdem_hands_select on public.holdem_hands for select to authenticated using (true);

create table if not exists public.holdem_hand_players (
  table_id uuid not null,
  hand_no integer not null,
  user_id uuid not null,
  net integer not null,
  won boolean not null,
  pot integer not null,
  seven_deuce boolean not null default false,
  played_at timestamptz not null default now(),
  primary key (table_id, hand_no, user_id),
  foreign key (table_id, hand_no) references public.holdem_hands (table_id, hand_no) on delete cascade
);
create index if not exists holdem_hand_players_user on public.holdem_hand_players (user_id);
alter table public.holdem_hand_players enable row level security;
-- no policies: read through my_stats() only

drop function if exists public.holdem_commit(uuid, integer, jsonb, jsonb, boolean, integer, jsonb);
create or replace function public.holdem_commit(
  p_table_id uuid,
  p_expected integer,
  p_state jsonb,
  p_pub jsonb,
  p_closed boolean,
  p_hand_no integer,
  p_hole jsonb,
  p_hand jsonb default null
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
  if p_hand is not null then
    insert into public.holdem_hands (table_id, hand_no, summary)
    values (p_table_id, (p_hand ->> 'handNo')::integer, p_hand)
    on conflict do nothing;
    insert into public.holdem_hand_players (table_id, hand_no, user_id, net, won, pot, seven_deuce)
    select p_table_id, (p_hand ->> 'handNo')::integer, (pl ->> 'userId')::uuid, (pl ->> 'net')::integer,
           (pl ->> 'won')::boolean, (p_hand ->> 'pot')::integer, coalesce((pl ->> 'sevenDeuce')::boolean, false)
      from jsonb_array_elements(p_hand -> 'players') pl
     where (pl ->> 'userId') ~ '^[0-9a-f-]{36}$'
    on conflict do nothing;
  end if;
  return true;
end;
$$;
revoke all on function public.holdem_commit(uuid, integer, jsonb, jsonb, boolean, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.holdem_commit(uuid, integer, jsonb, jsonb, boolean, integer, jsonb, jsonb) to service_role;

-- Personal statistics. A player gets their own; the general manager may ask for anyone.
create or replace function public.my_stats(p_user uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := coalesce(p_user, auth.uid());
  v_nights jsonb;
  v_holdem jsonb;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'PT401';
  end if;
  if v_user <> auth.uid() and not public.is_app_admin() then
    raise exception 'NOT_ADMIN' using errcode = 'PT403';
  end if;

  with nights as (
    select g.played_on, (p.value ->> 'obligation')::numeric as amount
      from public.settlements s
      join public.games g on g.id = s.game_id
      cross join lateral jsonb_array_elements(s.snapshot -> 'players') as p(value)
      join public.game_players gp on gp.id = (p.value ->> 'id')::uuid
     where jsonb_typeof(s.snapshot -> 'players') = 'array'
       and (p.value ->> 'obligation') is not null
       and gp.user_id = v_user
  )
  select jsonb_build_object(
           'count', count(*),
           'plus', count(*) filter (where amount > 0),
           'minus', count(*) filter (where amount < 0),
           'total', coalesce(sum(amount), 0),
           'best', max(amount),
           'worst', min(amount),
           'average', round(avg(amount), 1),
           'last', max(played_on)
         )
    into v_nights
    from nights;

  select jsonb_build_object(
           'hands', count(*),
           'won', count(*) filter (where won),
           'net', coalesce(sum(net), 0),
           'biggestPot', max(pot) filter (where won),
           'sevenDeuce', count(*) filter (where seven_deuce),
           'last', max(played_at)
         )
    into v_holdem
    from public.holdem_hand_players
   where user_id = v_user;

  return jsonb_build_object('nights', v_nights, 'holdem', v_holdem);
end;
$$;
revoke all on function public.my_stats(uuid) from public, anon;
grant execute on function public.my_stats(uuid) to authenticated;
