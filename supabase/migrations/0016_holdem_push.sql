-- Web push when an online Hold'em table (cash or tournament) opens.
-- Same flow as games_notify_open (0006): insert -> trigger -> pg_net POST to notify-table-opened
-- with the shared secret. The function tells the two apart by the body key (holdem_table_id).

create or replace function public.notify_holdem_table_opened()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  if new.status <> 'open' then
    return null;
  end if;
  begin
    select c.value into v_url from public.push_config c where c.key = 'function_url';
    select c.value into v_secret from public.push_config c where c.key = 'trigger_secret';
    if v_url is not null and v_secret is not null then
      perform net.http_post(
        url := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
        body := jsonb_build_object('holdem_table_id', new.id)
      );
    end if;
  exception when others then
    null;
  end;
  return null;
end;
$$;

drop trigger if exists holdem_tables_notify_open on public.holdem_tables;
create trigger holdem_tables_notify_open
  after insert on public.holdem_tables
  for each row execute function public.notify_holdem_table_opened();

revoke all on function public.notify_holdem_table_opened() from public, anon, authenticated;
