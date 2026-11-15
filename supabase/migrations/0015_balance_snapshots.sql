-- Monthly snapshots of the balance table (written by the monthly Google Sheets export), so the export can show
-- each player's change since the previous month. No client access (RLS on, no policies).
create table if not exists public.balance_snapshots (
  taken_on date not null,
  player_key text not null,
  display_name text not null,
  total numeric(10, 2) not null,
  primary key (taken_on, player_key)
);
alter table public.balance_snapshots enable row level security;
