begin;
create table if not exists public.api_rate_limits (
  key_hash text primary key,
  attempts integer not null,
  expires_at timestamptz not null
);
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from anon, authenticated;
create index if not exists api_rate_limits_expiry_idx on public.api_rate_limits(expires_at);
create or replace function public.consume_api_rate_limit(p_key text, p_max integer, p_window_ms integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare counter public.api_rate_limits; current_time_at timestamptz := clock_timestamp();
begin
  if p_key !~ '^[a-f0-9]{64}$' or p_max < 1 or p_max > 10000 or p_window_ms < 1000 or p_window_ms > 86400000 then
    raise exception 'Invalid rate limit';
  end if;
  insert into public.api_rate_limits as limits(key_hash, attempts, expires_at)
  values (p_key, 1, current_time_at + p_window_ms * interval '1 millisecond')
  on conflict (key_hash) do update set
    attempts = case when limits.expires_at <= current_time_at then 1 else least(limits.attempts + 1, 10001) end,
    expires_at = case when limits.expires_at <= current_time_at then excluded.expires_at else limits.expires_at end
  returning * into counter;
  if random() < 0.01 then
    delete from public.api_rate_limits where key_hash in (select key_hash from public.api_rate_limits where expires_at < current_time_at - interval '1 day' limit 100);
  end if;
  return jsonb_build_object('allowed',counter.attempts <= p_max,'remaining',greatest(0,p_max-counter.attempts),'reset_at',floor(extract(epoch from counter.expires_at)*1000));
end; $$;
revoke all on function public.consume_api_rate_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text,integer,integer) to service_role;
notify pgrst, 'reload schema';
commit;
