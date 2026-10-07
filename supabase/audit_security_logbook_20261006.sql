begin;
alter view public.aeroport_passagers set (security_invoker = true);
alter view public.aeroport_cargo set (security_invoker = true);
revoke insert, update, delete, truncate, references, trigger on public.aeroport_passagers, public.aeroport_cargo from anon, authenticated;
alter table public.instruction_exam_request_refusals enable row level security;
revoke all on public.instruction_exam_request_refusals from anon;
revoke insert, update, delete, truncate, references, trigger on public.instruction_exam_request_refusals from authenticated;
drop policy if exists exam_refusals_authorized_read on public.instruction_exam_request_refusals;
create policy exam_refusals_authorized_read on public.instruction_exam_request_refusals for select to authenticated
using (instructeur_id = (select auth.uid()) or public.is_admin() or exists (
 select 1 from public.instruction_exam_requests r where r.id = request_id and (r.requester_id = (select auth.uid()) or r.instructeur_id = (select auth.uid()))
));
create unique index if not exists messages_ground_salary_unique on public.messages(destinataire_id, cheque_numero_vol)
where type_message = 'cheque_salaire' and cheque_numero_vol like 'GC-%';
create index if not exists vols_pilot_date_idx on public.vols(pilote_id, depart_utc desc);
create index if not exists vols_copilot_date_idx on public.vols(copilote_id, depart_utc desc) where copilote_id is not null;
create index if not exists vols_instructor_date_idx on public.vols(instructeur_id, depart_utc desc) where instructeur_id is not null;
create or replace function public.logbook_summary(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
 select jsonb_build_object('total',count(*),'validated',count(*) filter(where statut='validé'),
 'pending',count(*) filter(where statut='en_attente'),'refused',count(*) filter(where statut='refusé'),
 'minutes',coalesce(sum(duree_minutes) filter(where statut='validé'),0),
 'types',coalesce(jsonb_agg(distinct type_vol) filter(where type_vol is not null),'[]'::jsonb))
 from public.vols where (pilote_id=p_user_id or copilote_id=p_user_id or instructeur_id=p_user_id)
 and type_vol <> 'Vol militaire' and statut in ('validé','en_attente','refusé');
$$;
revoke all on function public.logbook_summary(uuid) from public, anon, authenticated;
grant execute on function public.logbook_summary(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
