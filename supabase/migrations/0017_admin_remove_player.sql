-- General admin only: removes a player from an OPEN table together with all of their entries
-- (Buy-in / Rebuy / Cash-out, voided ones too), e.g. a player added or entered by mistake.
-- The table's balance is then as if they never played. A closed table stays locked
-- (block_writes_when_closed still applies: no bypass here).

create or replace function public.admin_remove_player(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game_id uuid;
  v_status public.game_status;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'PT401';
  end if;
  if not public.is_app_admin() then
    raise exception 'NOT_ADMIN' using errcode = 'PT403';
  end if;
  select gp.game_id into v_game_id from public.game_players gp where gp.id = p_player_id;
  if v_game_id is null then
    raise exception 'PLAYER_NOT_FOUND' using errcode = 'PT404';
  end if;
  select g.status into v_status from public.games g where g.id = v_game_id for update;
  if v_status <> 'open' then
    raise exception 'GAME_CLOSED' using errcode = 'PT409';
  end if;
  delete from public.transactions where player_id = p_player_id and game_id = v_game_id;
  delete from public.game_players where id = p_player_id;
end;
$$;

revoke all on function public.admin_remove_player(uuid) from public, anon;
grant execute on function public.admin_remove_player(uuid) to authenticated;
