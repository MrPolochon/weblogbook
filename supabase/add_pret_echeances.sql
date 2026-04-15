-- Ajout des colonnes d'echeance et de decouvert sur prets_bancaires
ALTER TABLE public.prets_bancaires
  ADD COLUMN IF NOT EXISTS echeance_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decouvert_depuis TIMESTAMPTZ;

-- Mettre a jour la contrainte de statut pour inclure 'defaut'
ALTER TABLE public.prets_bancaires DROP CONSTRAINT IF EXISTS prets_bancaires_statut_check;
ALTER TABLE public.prets_bancaires ADD CONSTRAINT prets_bancaires_statut_check
  CHECK (statut IN ('actif', 'rembourse', 'defaut'));

-- Pour les prets existants sans echeance, leur donner 4 semaines a partir de maintenant
UPDATE public.prets_bancaires
  SET echeance_at = NOW() + INTERVAL '28 days'
  WHERE statut = 'actif' AND echeance_at IS NULL;
