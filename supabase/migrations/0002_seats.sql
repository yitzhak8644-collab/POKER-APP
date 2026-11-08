-- Seats: a player can pick a seat at the (10-seat) table.
-- Seats are changed only through set_player_seat(): a player moves themselves, the table manager
-- can seat anyone (including players without an account). There is no UPDATE grant on the column,
-- closed games are already frozen by players_block_closed, and the existing Realtime subscription
-- on game_players carries seat changes to everyone.

alter table public.game_players add column seat smallint;
alter table public.game_players
  add constraint game_players_seat_ck check (seat between 1 and 10);

-- One person per seat per game; seat numbers are per game.
create unique index game_players_seat_uq on public.game_players (game_id, seat)
  where seat is not null;

-- p_seat = NULL leaves the seat. The unique_violation (two people tapping the same seat at the
-- same moment) is turned into SEAT_TAKEN; other errors (e.g. GAME_CLOSED) pass through untouched.
create function public.set_player_seat(p_player_id uuid, p_seat integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_player public.game_players%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'PT401';
  end if;
  select * into v_player from public.game_players gp where gp.id = p_player_id;
  if not found then
    raise exception 'PLAYER_NOT_FOUND' using errcode = 'PT404';
  end if;
  -- user_id is NULL for players without an account: `NULL = uid` is NULL, and `not NULL` would let
  -- the call through, so the comparison must be coalesced to false.
  if not (public.is_game_owner(v_player.game_id) or coalesce(v_player.user_id = auth.uid(), false)) then
    raise exception 'SEAT_FORBIDDEN' using errcode = 'PT403';
  end if;
  if p_seat is not null and (p_seat < 1 or p_seat > 10) then
    raise exception 'INVALID_SEAT' using errcode = 'PT422';
  end if;

  begin
    update public.game_players set seat = p_seat where id = p_player_id;
  exception when unique_violation then
    raise exception 'SEAT_TAKEN' using errcode = 'PT409';
  end;
end;
$$;

revoke all on function public.set_player_seat(uuid, integer) from public, anon, authenticated;
grant execute on function public.set_player_seat(uuid, integer) to authenticated;
