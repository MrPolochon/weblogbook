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

-- Présence des vols, distincte des positions : un appareil immobile reste en vol
-- alors qu'il n'ajoute aucun point à sa trace. Sans cette table, la purge
-- supprimerait la trace d'un avion à l'arrêt.
create table if not exists pf_odw_flights (
  flight_key text primary key,
  server_id text not null,
  roblox_username text not null default '',
  callsign text not null default '',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  map_x double precision,
  map_y double precision,
  game_x double precision,
  game_y double precision,
  altitude double precision not null default 0,
  speed double precision not null default 0,
  heading double precision not null default 0,
  model text not null default '',
  livery text not null default ''
);

create index if not exists pf_odw_flights_last_seen_idx on pf_odw_flights (last_seen_at);

-- Aucune policy : seuls le worker et les routes admin y accèdent via la clé de service.
alter table pf_odw_positions enable row level security;
alter table pf_odw_flights enable row level security;

-- Un vol est terminé quand il n'a plus été vu depuis max_idle_seconds.
create or replace function pf_odw_purge_finished_flights(max_idle_seconds integer default 120)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
  cutoff timestamptz := now() - make_interval(secs => max_idle_seconds);
begin
  with finished as (
    select flight_key from pf_odw_flights where last_seen_at < cutoff
  )
  delete from pf_odw_positions p
  using finished f
  where p.flight_key = f.flight_key;
  get diagnostics removed = row_count;

  delete from pf_odw_flights where last_seen_at < cutoff;

  delete from pf_odw_positions p
  where not exists (select 1 from pf_odw_flights f where f.flight_key = p.flight_key);

  return removed;
end;
$$;
