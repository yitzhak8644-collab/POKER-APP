-- The general manager (admin) counts as a member of every game, so join_open_game used to return
-- early for them without ever adding a player row. Decide by the real game_players row instead.
create or replace function public.join_open_game(p_game_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
  if exists (select 1 from public.game_players gp where gp.game_id = v_game.id and gp.user_id = v_uid) then
    return v_game.id;
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
