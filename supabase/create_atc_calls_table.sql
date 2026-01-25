-- Table pour les appels téléphoniques ATC
CREATE TABLE IF NOT EXISTS public.atc_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  from_aeroport TEXT NOT NULL,
  from_position TEXT NOT NULL,
  to_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_aeroport TEXT NOT NULL,
  to_position TEXT NOT NULL,
  number_dialed TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ringing', 'connected', 'ended', 'rejected')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_atc_calls_from_user ON public.atc_calls(from_user_id);
CREATE INDEX IF NOT EXISTS idx_atc_calls_to_user ON public.atc_calls(to_user_id);
CREATE INDEX IF NOT EXISTS idx_atc_calls_status ON public.atc_calls(status);
CREATE INDEX IF NOT EXISTS idx_atc_calls_active ON public.atc_calls(status, started_at) WHERE status IN ('ringing', 'connected');

-- Nettoyer les anciens appels (plus de 24h)
CREATE OR REPLACE FUNCTION cleanup_old_atc_calls()
RETURNS void AS $$
BEGIN
  DELETE FROM public.atc_calls
  WHERE ended_at IS NOT NULL AND ended_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- Fonction pour terminer automatiquement les appels non répondus après 30 secondes
CREATE OR REPLACE FUNCTION auto_end_unanswered_calls()
RETURNS void AS $$
BEGIN
  UPDATE public.atc_calls
  SET status = 'ended', ended_at = NOW()
  WHERE status = 'ringing'
    AND started_at < NOW() - INTERVAL '30 seconds';
END;
$$ LANGUAGE plpgsql;
