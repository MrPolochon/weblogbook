begin;
create table if not exists public.passkey_login_challenges (
 nonce_hash text primary key,
 challenge text not null,
 expires_at timestamptz not null
);
alter table public.passkey_login_challenges enable row level security;
revoke all on public.passkey_login_challenges from anon, authenticated;
grant all on public.passkey_login_challenges to service_role;
create index if not exists passkey_login_challenges_expiry_idx on public.passkey_login_challenges(expires_at);
notify pgrst, 'reload schema';
commit;
