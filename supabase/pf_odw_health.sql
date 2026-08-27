-- Une ligne de métriques PFtesterODW : durée de collecte, avions, WS, traces.
-- Écrite par le worker Railway (~30 s) et le cron Vercel (filet).

create table if not exists pf_odw_health (
  id smallint primary key default 1 check (id = 1),
  updated_at timestamptz not null default now(),
  last_source text,
  last_tick_ms integer not null default 0,
  last_aircraft integer not null default 0,
  last_points integer not null default 0,
  last_ws_at timestamptz,
  last_write_at timestamptz,
  ws_ok_30s integer not null default 0,
  ws_miss_30s integer not null default 0,
  ws_fail_total bigint not null default 0,
  cron_last_at timestamptz,
  cron_last_ms integer,
  cron_last_status text,
  cron_last_aircraft integer,
  cron_last_points integer
);

insert into pf_odw_health (id) values (1) on conflict (id) do nothing;

alter table pf_odw_health enable row level security;
