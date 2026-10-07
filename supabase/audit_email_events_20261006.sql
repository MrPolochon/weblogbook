begin;
create table if not exists public.email_delivery_events (
 event_id text primary key,
 provider_message_id text not null,
 event_type text not null,
 occurred_at timestamptz not null,
 received_at timestamptz not null default now()
);
alter table public.email_delivery_events enable row level security;
revoke all on public.email_delivery_events from anon, authenticated;
grant all on public.email_delivery_events to service_role;
create index if not exists email_delivery_events_date_idx on public.email_delivery_events(occurred_at desc);
notify pgrst, 'reload schema';
commit;
