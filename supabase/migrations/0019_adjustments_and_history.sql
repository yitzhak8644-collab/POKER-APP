-- 1. Balance adjustments: results of games played OUTSIDE the app (e.g. a trial evening) that still belong
--    in the balance table. They are added to the "outside the app" part of a row (next to the PayBox history),
--    and they are NOT games: they do not enter the statistics (my_stats), the game count or the history.
--    Rows are inserted by the general admin directly in the database (no client access; schema only here).
create table if not exists public.balance_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  -- for someone without an account: the balance_openings label of their grey row
  label text,
  amount numeric(10, 2) not null,
  played_on date,
  note text,
  created_at timestamptz not null default now(),
  check (user_id is not null or label is not null)
);
alter table public.balance_adjustments enable row level security;
revoke all on public.balance_adjustments from anon, authenticated;

create or replace function public.overall_balance()
returns table (
  player_key text,
  display_name text,
  avatar_url text,
  registered boolean,
  inactive boolean,
  opening numeric,
  games integer,
  app_total numeric,
  total numeric,
  last_played date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.is_app_admin();
  v_me text := auth.uid()::text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'PT401';
  end if;

  return query
  with entries as (
    select gp.user_id,
           (p.value ->> 'obligation')::numeric as amount,
           g.played_on
    from public.settlements s
    join public.games g on g.id = s.game_id
    cross join lateral jsonb_array_elements(s.snapshot -> 'players') as p(value)
    join public.game_players gp on gp.id = (p.value ->> 'id')::uuid
    where jsonb_typeof(s.snapshot -> 'players') = 'array'
      and (p.value ->> 'obligation') is not null
      and gp.user_id is not null
  ),
  agg as (
    select e.user_id,
           count(*)::integer as n,
           sum(e.amount) as amt,
           max(e.played_on) as last_played
    from entries e
    group by e.user_id
  ),
  adj_user as (
    select a.user_id, sum(a.amount) as amt, max(a.played_on) as last_played
    from public.balance_adjustments a
    where a.user_id is not null
    group by a.user_id
  ),
  adj_label as (
    select a.label, sum(a.amount) as amt, max(a.played_on) as last_played
    from public.balance_adjustments a
    where a.user_id is null and a.label is not null
    group by a.label
  ),
  registered_rows as (
    select pr.id::text as k,
           pr.display_name as nm,
           pr.avatar_url as av,
           true as reg,
           false as inact,
           coalesce(o.amount, 0) + coalesce(au.amt, 0) as opening,
           coalesce(o.games, 0) + coalesce(a.n, 0) as games,
           coalesce(a.amt, 0) as app_total,
           greatest(o.last_played, a.last_played, au.last_played) as last_played
    from public.profiles pr
    left join public.balance_openings o on o.user_id = pr.id
    left join agg a on a.user_id = pr.id
    left join adj_user au on au.user_id = pr.id
  ),
  unlinked_rows as (
    select 'o:' || o.label as k,
           o.label as nm,
           null::text as av,
           false as reg,
           o.inactive as inact,
           o.amount + coalesce(al.amt, 0) as opening,
           o.games as games,
           0::numeric as app_total,
           greatest(o.last_played, al.last_played) as last_played
    from public.balance_openings o
    left join adj_label al on al.label = o.label
    where o.user_id is null
  )
  select r.k, r.nm, r.av, r.reg, r.inact, r.opening, r.games, r.app_total, r.opening + r.app_total, r.last_played
  from (select * from registered_rows union all select * from unlinked_rows) r
  where v_admin or r.k = v_me
  order by (r.opening + r.app_total) desc, r.nm;
end;
$$;

revoke all on function public.overall_balance() from public, anon;
grant execute on function public.overall_balance() to authenticated;

-- 2. Game history for everybody signed in: every closed table with its date, host, players, pot and the
--    WhatsApp summary (the same text that is sent to the group anyway). Newest first.
create or replace function public.game_history()
returns table (
  game_id uuid,
  played_on date,
  closed_at timestamptz,
  host_name text,
  players integer,
  pot numeric,
  summary text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'PT401';
  end if;
  return query
  select g.id,
         g.played_on,
         g.closed_at,
         (select gp.display_name from public.game_players gp where gp.game_id = g.id and gp.role = 'host' limit 1),
         (select count(*)::integer from public.game_players gp where gp.game_id = g.id),
         coalesce((s.snapshot ->> 'pot')::numeric,
                  (select coalesce(sum(t.amount), 0) from public.transactions t
                    where t.game_id = g.id and t.voided_at is null and t.type in ('buy_in', 'rebuy'))),
         s.whatsapp_text
  from public.games g
  left join public.settlements s on s.game_id = g.id
  where g.status = 'closed'
  order by g.played_on desc, g.closed_at desc nulls last
  limit 200;
end;
$$;

revoke all on function public.game_history() from public, anon;
grant execute on function public.game_history() to authenticated;
