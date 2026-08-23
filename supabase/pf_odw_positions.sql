-- PFtesterODW : positions live du serveur privé, enregistrées par le worker Railway.
-- Les points ne sont conservés que pendant le vol : dès qu'un appareil quitte le
-- flux Project Flight, sa trace entière est supprimée.

create table if not exists pf_odw_positions (
  id bigserial primary key,
  flight_key text not null,
  server_id text not null,
  roblox_username text not null default '',
  callsign text not null default '',
  map_x double precision not null,
  map_y double precision not null,
  altitude double precision not null default 0,
  speed double precision not null default 0,
  heading double precision not null default 0,
  -- Rupture de tracé (respawn, téléportation) : on coupe la ligne sans perdre l'historique.
  gap boolean not null default false,
  recorded_at timestamptz not null default now()
);

create index if not exists pf_odw_positions_flight_idx
  on pf_odw_positions (flight_key, recorded_at);
create index if not exists pf_odw_positions_recorded_idx
  on pf_odw_positions (recorded_at);

-- Aucune policy : seuls le worker et les routes admin y accèdent via la clé de service.
alter table pf_odw_positions enable row level security;

-- Un vol est terminé quand il n'a plus émis de position depuis max_idle_seconds.
create or replace function pf_odw_purge_finished_flights(max_idle_seconds integer default 120)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  with finished as (
    select flight_key
    from pf_odw_positions
    group by flight_key
    having max(recorded_at) < now() - make_interval(secs => max_idle_seconds)
  )
  delete from pf_odw_positions p
  using finished f
  where p.flight_key = f.flight_key;
  get diagnostics removed = row_count;
  return removed;
end;
$$;
