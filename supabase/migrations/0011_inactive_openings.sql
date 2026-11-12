-- Inactive old-group players are flagged (data loaded straight into the DB, not in git) and shown as ONE
-- grey row. overall_balance() gets an `inactive` column; otherwise it is unchanged from 0010.
alter table public.balance_openings add column if not exists inactive boolean not null default false;

drop function if exists public.overall_balance();
create function public.overall_balance()
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
  registered_rows as (
    select pr.id::text as k,
           pr.display_name as nm,
           pr.avatar_url as av,
           true as reg,
           false as inact,
           coalesce(o.amount, 0) as opening,
           coalesce(o.games, 0) + coalesce(a.n, 0) as games,
           coalesce(a.amt, 0) as app_total,
           greatest(o.last_played, a.last_played) as last_played
    from public.profiles pr
    left join public.balance_openings o on o.user_id = pr.id
    left join agg a on a.user_id = pr.id
  ),
  unlinked_rows as (
    select 'o:' || o.label as k,
           o.label as nm,
           null::text as av,
           false as reg,
           o.inactive as inact,
           o.amount as opening,
           o.games as games,
           0::numeric as app_total,
           o.last_played
    from public.balance_openings o
    where o.user_id is null
  )
  select r.k, r.nm, r.av, r.reg, r.inact, r.opening, r.games, r.app_total, r.opening + r.app_total, r.last_played
  from (select * from registered_rows union all select * from unlinked_rows) r
  order by (r.opening + r.app_total) desc, r.nm;
end;
$$;

revoke all on function public.overall_balance() from public, anon;
grant execute on function public.overall_balance() to authenticated;
