begin;
create table if not exists public.tribunal_bulletins (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  title text not null check (char_length(btrim(title)) between 3 and 200),
  category text not null check (category in ('Loi', 'Décision', 'Communiqué', 'Information')),
  content text not null check (char_length(btrim(content)) between 10 and 50000),
  author_id uuid references public.profiles(id) on delete set null,
  author_name text not null,
  published_at timestamptz not null default now()
);
create index if not exists tribunal_bulletins_published_idx on public.tribunal_bulletins (published_at desc, number desc);
alter table public.tribunal_bulletins enable row level security;
drop policy if exists "Public bulletin archive" on public.tribunal_bulletins;
create policy "Public bulletin archive" on public.tribunal_bulletins for select to anon, authenticated using (true);
revoke all on public.tribunal_bulletins from anon, authenticated;
grant select on public.tribunal_bulletins to anon, authenticated;

create or replace function public.publish_tribunal_bulletin(p_title text, p_category text, p_content text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_author text; v_id uuid;
begin
  select identifiant into v_author from public.profiles where id = auth.uid() and role = 'admin';
  if not found then raise exception 'Publication réservée aux administrateurs' using errcode = '42501'; end if;
  insert into public.tribunal_bulletins(title, category, content, author_id, author_name)
    values (btrim(p_title), p_category, btrim(p_content), auth.uid(), coalesce(v_author, 'Administration')) returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.publish_tribunal_bulletin(text, text, text) from public, anon;
grant execute on function public.publish_tribunal_bulletin(text, text, text) to authenticated;
-- Publication only: authenticated users cannot rewrite or remove the archive.
notify pgrst, 'reload schema';
commit;
