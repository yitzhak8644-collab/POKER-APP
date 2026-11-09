-- One open table at a time, and a "are you the host?" question for every player who sits down.
--
-- 1. At most one game can be open at any moment (partial unique index, race-safe). A second
--    create_game fails with a unique violation on games_one_open, which the client maps to a
--    Hebrew message.
-- 2. Every player is asked once whether they are the host (host_asked). The answer goes through
--    answer_host_question(): up to two hosts per game (the first takes role 'host', the second
--    'host_spouse', which the finance engine treats as the host's household); a third "yes" is
--    rejected with HOSTS_FULL.

create unique index games_one_open on public.games ((true)) where status = 'open';

alter table public.game_players add column host_asked boolean not null default false;

create function public.answer_host_question(p_game_id uuid, p_is_host boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_player public.game_players%rowtype;
  v_role public.player_role;
  v_hosts integer;
  v_has_host boolean;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'PT401';
  end if;
  -- Serialises concurrent answers for the same game, so two "yes" can never exceed the limit.
  perform 1 from public.games g where g.id = p_game_id for update;
  if not found then
    raise exception 'GAME_NOT_FOUND' using errcode = 'PT404';
  end if;
  if not public.is_game_open(p_game_id) then
    raise exception 'GAME_CLOSED' using errcode = 'PT409';
  end if;
  select * into v_player from public.game_players gp
   where gp.game_id = p_game_id and gp.user_id = v_uid;
  if not found then
    raise exception 'PLAYER_NOT_FOUND' using errcode = 'PT404';
  end if;

  v_role := v_player.role;
  if p_is_host then
    if v_player.role = 'guest' then
      select count(*) filter (where gp.role in ('host', 'host_spouse')),
             coalesce(bool_or(gp.role = 'host'), false)
        into v_hosts, v_has_host
        from public.game_players gp where gp.game_id = p_game_id;
      if v_hosts >= 2 then
        raise exception 'HOSTS_FULL' using errcode = 'PT409';
      end if;
      v_role := case when v_has_host then 'host_spouse' else 'host' end;
    end if;
  elsif v_player.role in ('host', 'host_spouse') then
    v_role := 'guest';
  end if;

  update public.game_players set role = v_role, host_asked = true where id = v_player.id;
end;
$$;

revoke all on function public.answer_host_question(uuid, boolean) from public, anon, authenticated;
grant execute on function public.answer_host_question(uuid, boolean) to authenticated;
