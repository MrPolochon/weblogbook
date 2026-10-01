-- Réinitialisation unique demandée le 1er octobre 2026.
-- Exécuter avant le déploiement. La date fixe protège tous les nouveaux tickets,
-- même si ce script est relancé. Les transcripts restent dans support_tickets.
BEGIN;

CREATE TABLE IF NOT EXISTS public.support_ticket_update_resets (
  ticket_id UUID PRIMARY KEY REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  dm_status TEXT NOT NULL DEFAULT 'pending' CHECK (dm_status IN ('pending', 'sent', 'unavailable')),
  dm_error TEXT,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_until TIMESTAMPTZ,
  lease_token UUID
);

ALTER TABLE public.support_ticket_update_resets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_ticket_update_resets FROM anon, authenticated;
GRANT ALL ON public.support_ticket_update_resets TO service_role;

INSERT INTO public.support_ticket_update_resets (ticket_id)
SELECT id FROM public.support_tickets
WHERE closed_at IS NULL AND created_at <= '2026-10-01T22:06:31Z'::timestamptz
ON CONFLICT (ticket_id) DO NOTHING;

COMMIT;
