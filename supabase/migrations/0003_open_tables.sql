-- Open tables lobby: every signed-in user sees open games the moment they are created and can
-- join with one tap, without the join code.
--
-- The lobby is a separate, minimal table (no join_code, no ledger data) kept in sync by a trigger on
-- games. That keeps `games` private to its members and lets Realtime deliver lobby changes to everyone.

create table public.open_games (
  game_id uuid primary key references public.games (id) on delete cascade,
  owner_name text not null default '',
  played_on date not null,
  created_at timestamptz not null default now()
);

alter table public.open_games enable row level security;
create policy open_games_select on public.open_games for select to authenticated using (true);

revoke all on public.open_games from anon, authenticated;
grant select on public.open_games to authenticated;

create function public.sync_open_game()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'open' then
      insert into public.open_games (game_id, owner_name, played_on, created_at)
      select new.id, coalesce(p.display_name, ''), new.played_on, new.created_at
      from (select 1) s left join public.profiles p on p.id = new.owner_id
      on conflict (game_id) do nothing;
    end if;
  elsif new.status <> 'open' then
    delete from public.open_games where game_id = new.id;
  else
    update public.open_games set played_on = new.played_on where game_id = new.id;
  end if;
  return null;
end;
$$;

create trigger games_sync_open
  after insert or update of status, played_on on public.games
  for each row execute function public.sync_open_game();

-- Backfill games that are already open.
insert into public.open_games (game_id, owner_name, played_on, created_at)
select g.id, coalesce(p.display_name, ''), g.played_on, g.created_at
from public.games g left join public.profiles p on p.id = g.owner_id
where g.status = 'open'
on conflict (game_id) do nothing;

-- One-tap join from the lobby. Same rules as join_game(code): idempotent, open games only.
create function public.join_open_game(p_game_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_game public.games%rowtype;
  v_profile public.profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'PT401';
  end if;
  select * into v_game from public.games g where g.id = p_game_id;
  if not found then
    raise exception 'GAME_NOT_FOUND' using errcode = 'PT404';
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

revoke all on function public.sync_open_game() from public, anon, authenticated;
revoke all on function public.join_open_game(uuid) from public, anon, authenticated;
grant execute on function public.join_open_game(uuid) to authenticated;

alter table public.open_games replica identity full;
alter publication supabase_realtime add table public.open_games;
