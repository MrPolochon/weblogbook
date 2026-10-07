begin;
alter table public.ground_service_requests add column if not exists cheques_emitted_at timestamptz;
alter table public.ground_service_requests add column if not exists completed_by uuid references public.profiles(id);
-- Existing services are retried safely: the salary index prevents duplicate cheques.
create index if not exists ground_pending_payments_idx on public.ground_service_requests(completed_at)
where statut = 'completed' and cheques_emitted_at is null;
notify pgrst, 'reload schema';
commit;
