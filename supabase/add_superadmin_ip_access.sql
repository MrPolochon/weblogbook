-- Accès superadmin à la liste des IP : demande avec mdp + code email + approbation d'un autre admin

-- 1. Codes à usage unique pour la vérification email (demande d'accès IP)
CREATE TABLE IF NOT EXISTS public.superadmin_access_codes (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

COMMENT ON TABLE public.superadmin_access_codes IS 'Code envoyé par email pour valider une demande d''accès à la liste des IP (superadmin)';

-- 2. Demandes d'accès à la liste des IP
CREATE TABLE IF NOT EXISTS public.superadmin_ip_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_superadmin_ip_requests_requested_by ON public.superadmin_ip_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_superadmin_ip_requests_status ON public.superadmin_ip_requests(status);
CREATE INDEX IF NOT EXISTS idx_superadmin_ip_requests_created_at ON public.superadmin_ip_requests(created_at DESC);

COMMENT ON TABLE public.superadmin_ip_requests IS 'Demandes d''accès à la liste des IP ; une approbation par un autre admin donne accès 15 min';

-- 3. Ajouter le type de message pour la notification d'approbation
-- Si votre projet a d'autres types de messages, ajoutez-les dans la liste ci-dessous avant d'exécuter.
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_type_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_type_check
  CHECK (type_message IN (
    'normal',
    'cheque_salaire',
    'cheque_revenu_compagnie',
    'cheque_taxes_atc',
    'recrutement',
    'sanction_ifsa',
    'amende_ifsa',
    'relance_amende',
    'location_avion',
    'cheque_siavi_intervention',
    'cheque_siavi_taxes',
    'systeme',
    'alerte_connexion',
    'superadmin_ip_approval'
  ));

-- RLS : tables superadmin accessibles uniquement via service role (API admin)
ALTER TABLE public.superadmin_access_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.superadmin_ip_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "superadmin_codes_no_anon" ON public.superadmin_access_codes FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "superadmin_requests_no_anon" ON public.superadmin_ip_requests FOR ALL TO anon USING (false) WITH CHECK (false);
