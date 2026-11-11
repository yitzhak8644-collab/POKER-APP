-- The overall balance lists only registered (Google) users. Players added by hand without an account
-- appear only in the WhatsApp summary of the one table they played at.
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
    select gp.user_id,
           (p.value ->> 'obligation')::numeric::integer as amount,
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
           count(*)::integer as games,
           sum(e.amount)::integer as total,
           max(e.played_on) as last_played
    from entries e
    group by e.user_id
  )
  select pr.id::text as player_key,
         pr.display_name as display_name,
         pr.avatar_url,
         coalesce(a.games, 0) as games,
         coalesce(a.total, 0) as total,
         a.last_played
  from public.profiles pr
  left join agg a on a.user_id = pr.id
  order by coalesce(a.total, 0) desc, pr.display_name;
end;
$$;

revoke all on function public.overall_balance() from public, anon;
grant execute on function public.overall_balance() to authenticated;
