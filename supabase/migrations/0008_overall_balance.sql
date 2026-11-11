-- Long-term balance table: per person, the sum of their FINAL net amount (the same "obligation" that the
-- WhatsApp summary shows: poker result - entry fee + hosting payout) over every closed game.
-- Everyone who is signed in may read it (profiles/settlements are private per game, so this is a definer RPC).
-- Every registered user appears, even before playing a game, so a new sign-up shows up with 0.
create or replace function public.overall_balance()
returns table (
  player_key text,
  display_name text,
  avatar_url text,
  games integer,
  total integer,
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
    select
      coalesce(gp.user_id::text, 'n:' || lower(btrim(coalesce(gp.display_name, p.value ->> 'name')))) as k,
      gp.user_id,
      coalesce(gp.display_name, p.value ->> 'name') as nm,
      (p.value ->> 'obligation')::numeric::integer as amount,
      g.played_on
    from public.settlements s
    join public.games g on g.id = s.game_id
    cross join lateral jsonb_array_elements(s.snapshot -> 'players') as p(value)
    left join public.game_players gp on gp.id = (p.value ->> 'id')::uuid
    where jsonb_typeof(s.snapshot -> 'players') = 'array'
      and (p.value ->> 'obligation') is not null
  ),
  agg as (
    select e.k,
           max(e.user_id::text)::uuid as user_id,
           max(e.nm) as nm,
           count(*)::integer as games,
           sum(e.amount)::integer as total,
           max(e.played_on) as last_played
    from entries e
    group by e.k
  )
  select coalesce(a.k, pr.id::text) as player_key,
         coalesce(pr.display_name, a.nm, '?') as display_name,
         pr.avatar_url,
         coalesce(a.games, 0) as games,
         coalesce(a.total, 0) as total,
         a.last_played
  from agg a
  full join public.profiles pr on pr.id::text = a.k
  order by coalesce(a.total, 0) desc, coalesce(pr.display_name, a.nm);
end;
$$;

revoke all on function public.overall_balance() from public, anon;
grant execute on function public.overall_balance() to authenticated;
