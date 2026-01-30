-- ============================================================
-- SYSTÈME DE TRANSPONDEUR POUR LES PLANS DE VOL
-- ============================================================
-- Les codes transpondeurs permettent d'identifier un aéronef
-- Codes de 0000 à 7777 (base octale, 4096 possibilités)
-- Modes: A (identification), C (altitude), S (sélectif)
-- Codes spéciaux: 7500 (détournement), 7600 (panne radio), 7700 (urgence)

-- 1) Ajouter les colonnes transpondeur à plans_vol
ALTER TABLE public.plans_vol
  ADD COLUMN IF NOT EXISTS code_transpondeur TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS mode_transpondeur TEXT DEFAULT 'C' CHECK (mode_transpondeur IN ('A', 'C', 'S'));

-- Commentaires
COMMENT ON COLUMN public.plans_vol.code_transpondeur IS 'Code transpondeur 4 chiffres (0000-7777). Codes spéciaux: 7500=détournement, 7600=panne radio, 7700=urgence';
COMMENT ON COLUMN public.plans_vol.mode_transpondeur IS 'Mode transpondeur: A=identification, C=altitude, S=sélectif';

-- 2) Fonction de validation du code transpondeur (0-7 uniquement)
CREATE OR REPLACE FUNCTION public.validate_transponder_code(code TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Code doit être exactement 4 caractères
  IF code IS NULL OR LENGTH(code) != 4 THEN
    RETURN FALSE;
  END IF;
  
  -- Chaque caractère doit être entre 0 et 7
  RETURN code ~ '^[0-7]{4}$';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3) Trigger pour valider le code transpondeur avant insertion/mise à jour
CREATE OR REPLACE FUNCTION public.check_transponder_code()
RETURNS TRIGGER AS $$
BEGIN
  -- Si le code est défini, le valider
  IF NEW.code_transpondeur IS NOT NULL AND NEW.code_transpondeur != '' THEN
    IF NOT public.validate_transponder_code(NEW.code_transpondeur) THEN
      RAISE EXCEPTION 'Code transpondeur invalide: %. Doit être 4 chiffres de 0 à 7 (ex: 1234, 7700)', NEW.code_transpondeur;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Supprimer l'ancien trigger si existant
DROP TRIGGER IF EXISTS check_transponder_code_trigger ON public.plans_vol;

-- Créer le trigger
CREATE TRIGGER check_transponder_code_trigger
  BEFORE INSERT OR UPDATE ON public.plans_vol
  FOR EACH ROW
  WHEN (NEW.code_transpondeur IS NOT NULL AND NEW.code_transpondeur != '')
  EXECUTE FUNCTION public.check_transponder_code();

-- 4) Fonction pour générer un code transpondeur aléatoire (évite les codes spéciaux)
CREATE OR REPLACE FUNCTION public.generate_transponder_code()
RETURNS TEXT AS $$
DECLARE
  new_code TEXT;
  attempts INT := 0;
BEGIN
  LOOP
    -- Générer 4 chiffres aléatoires entre 0 et 7
    new_code := 
      (floor(random() * 8)::int)::text ||
      (floor(random() * 8)::int)::text ||
      (floor(random() * 8)::int)::text ||
      (floor(random() * 8)::int)::text;
    
    -- Éviter les codes spéciaux (7500, 7600, 7700) et les codes déjà utilisés
    IF new_code NOT IN ('7500', '7600', '7700') THEN
      -- Vérifier si le code n'est pas déjà utilisé par un vol en cours
      IF NOT EXISTS (
        SELECT 1 FROM public.plans_vol 
        WHERE code_transpondeur = new_code 
        AND statut IN ('accepte', 'en_cours', 'en_attente_cloture')
      ) THEN
        RETURN new_code;
      END IF;
    END IF;
    
    attempts := attempts + 1;
    IF attempts > 100 THEN
      -- Après 100 tentatives, retourner un code quelconque (rare)
      RETURN new_code;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 5) Vue pour identifier les codes d'urgence
CREATE OR REPLACE VIEW public.plans_vol_urgence AS
SELECT 
  pv.*,
  CASE 
    WHEN pv.code_transpondeur = '7500' THEN 'DETOURNEMENT'
    WHEN pv.code_transpondeur = '7600' THEN 'PANNE RADIO'
    WHEN pv.code_transpondeur = '7700' THEN 'URGENCE'
    ELSE NULL
  END AS type_urgence
FROM public.plans_vol pv
WHERE pv.code_transpondeur IN ('7500', '7600', '7700')
  AND pv.statut IN ('accepte', 'en_cours', 'en_attente_cloture');

-- 6) Index pour les recherches par code transpondeur
CREATE INDEX IF NOT EXISTS idx_plans_vol_transpondeur ON public.plans_vol(code_transpondeur)
  WHERE code_transpondeur IS NOT NULL;

-- 7) Message de confirmation
DO $$ BEGIN RAISE NOTICE '✅ Système de transpondeur ajouté avec succès!'; END $$;
