-- ============================================================
-- SÉCURITÉ : Enregistrement IP à la connexion + alerte admins
-- Si un admin se connecte depuis une IP différente, notification aux admins
-- ============================================================

-- 1. Dernière IP de connexion connue (par utilisateur)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_login_ip TEXT,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.last_login_ip IS 'Dernière adresse IP enregistrée à la connexion';
COMMENT ON COLUMN public.profiles.last_login_at IS 'Date/heure de la dernière connexion';

-- 2. Autoriser le type de message "alerte_connexion" pour notifier les admins
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
    'alerte_connexion'
  ));
