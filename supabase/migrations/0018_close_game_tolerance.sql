-- Closing a table:
--  * a counting gap of up to 2 NIS (either way) no longer blocks a normal close: the group fund absorbs it
--    (the client computes the transfers and the WhatsApp text with the same rule, CLOSE_TOLERANCE in
--    src/lib/finance/config.ts);
--  * besides the table manager and the general admin, any player sitting at the table may close it
--    (normal close only; a forced close stays with the general admin).

create or replace function public.close_game(p_game_id uuid, p_snapshot jsonb, p_whatsapp_text text, p_force boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games%rowtype;
  v_force boolean := coalesce(p_force, false) and public.is_app_admin();
  v_players integer;
  v_hosts integer;
  v_spouses integer;
  v_missing integer;
  v_invested bigint;
  v_cash_out bigint;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'PT401';
  end if;
  select * into v_game from public.games g where g.id = p_game_id for update;
  if not found then
    raise exception 'GAME_NOT_FOUND' using errcode = 'PT404';
  end if;
  if v_game.owner_id <> auth.uid()
     and not public.is_app_admin()
     and not exists (select 1 from public.game_players gp where gp.game_id = p_game_id and gp.user_id = auth.uid()) then
    raise exception 'NOT_TABLE_MANAGER' using errcode = 'PT403';
  end if;
  if v_game.status <> 'open' then
    raise exception 'GAME_CLOSED' using errcode = 'PT409';
  end if;
  if jsonb_typeof(p_snapshot) is distinct from 'object' or btrim(coalesce(p_whatsapp_text, '')) = '' then
    raise exception 'INVALID_SNAPSHOT' using errcode = 'PT422';
  end if;

  select count(*),
         count(*) filter (where gp.role = 'host'),
         count(*) filter (where gp.role = 'host_spouse')
    into v_players, v_hosts, v_spouses
    from public.game_players gp where gp.game_id = p_game_id;
  if v_players = 0 then
    raise exception 'NO_PLAYERS' using errcode = 'PT422';
  end if;

  if not v_force then
    if v_hosts > 1 or v_spouses > 1 or (v_hosts = 0 and v_spouses > 0) then
      raise exception 'INVALID_ROSTER' using errcode = 'PT422';
    end if;

    select count(*) into v_missing
      from public.game_players gp
     where gp.game_id = p_game_id
       and not exists (
         select 1 from public.transactions t
          where t.player_id = gp.id and t.type = 'cash_out' and t.voided_at is null
       );
    if v_missing > 0 then
      raise exception 'MISSING_CASH_OUT' using errcode = 'PT422';
    end if;

    select coalesce(sum(t.amount) filter (where t.type in ('buy_in', 'rebuy')), 0),
           coalesce(sum(t.amount) filter (where t.type = 'cash_out'), 0)
      into v_invested, v_cash_out
      from public.transactions t
     where t.game_id = p_game_id and t.voided_at is null;
    if abs(v_invested - v_cash_out) > 2 then
      raise exception 'ZERO_SUM_MISMATCH' using errcode = 'PT422';
    end if;
  end if;

  update public.games set status = 'closed', closed_at = now() where id = p_game_id;
  insert into public.settlements (game_id, closed_by, snapshot, whatsapp_text)
  values (p_game_id, auth.uid(), p_snapshot, p_whatsapp_text);
end;
$$;
