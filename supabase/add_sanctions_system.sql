-- =====================================================
-- SYSTÈME DE SANCTIONS IFSA COMPLET
-- =====================================================

-- 1. Ajouter les types de sanctions manquants à la contrainte messages
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_type_check 
CHECK (type_message = ANY (ARRAY[
  'normal', 
  'cheque_salaire', 
  'cheque_revenu_compagnie', 
  'cheque_taxes_atc', 
  'recrutement',
  'sanction_ifsa',
  'amende_ifsa',
  'relance_amende'
]::text[]));

-- 2. Ajouter les colonnes manquantes pour les amendes
ALTER TABLE ifsa_sanctions ADD COLUMN IF NOT EXISTS amende_payee BOOLEAN DEFAULT FALSE;
ALTER TABLE ifsa_sanctions ADD COLUMN IF NOT EXISTS amende_payee_at TIMESTAMPTZ;
ALTER TABLE ifsa_sanctions ADD COLUMN IF NOT EXISTS amende_payee_par_id UUID REFERENCES profiles(id);
ALTER TABLE ifsa_sanctions ADD COLUMN IF NOT EXISTS derniere_relance_at TIMESTAMPTZ;
ALTER TABLE ifsa_sanctions ADD COLUMN IF NOT EXISTS nb_relances INTEGER DEFAULT 0;

COMMENT ON COLUMN ifsa_sanctions.amende_payee IS 'Indique si l''amende a été payée';
COMMENT ON COLUMN ifsa_sanctions.derniere_relance_at IS 'Date de la dernière relance envoyée';
COMMENT ON COLUMN ifsa_sanctions.nb_relances IS 'Nombre de relances envoyées';

-- 3. Ajouter un champ de blocage dans profiles pour les sanctions
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sanction_blocage_vol BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sanction_blocage_motif TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sanction_blocage_jusqu_au TIMESTAMPTZ;

COMMENT ON COLUMN profiles.sanction_blocage_vol IS 'Pilote interdit de voler suite à une sanction IFSA';
COMMENT ON COLUMN profiles.sanction_blocage_motif IS 'Motif du blocage (type de sanction)';
COMMENT ON COLUMN profiles.sanction_blocage_jusqu_au IS 'Date de fin du blocage (null si permanent)';

-- 4. Table pour les paiements d'amendes
CREATE TABLE IF NOT EXISTS ifsa_paiements_amendes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sanction_id UUID NOT NULL REFERENCES ifsa_sanctions(id) ON DELETE CASCADE,
  montant INTEGER NOT NULL,
  paye_par_id UUID NOT NULL REFERENCES profiles(id),
  compte_debit_id UUID REFERENCES felitz_comptes(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paiements_sanction ON ifsa_paiements_amendes(sanction_id);

COMMENT ON TABLE ifsa_paiements_amendes IS 'Historique des paiements d''amendes IFSA';

-- 5. Index pour les relances automatiques
CREATE INDEX IF NOT EXISTS idx_sanctions_amendes_non_payees 
ON ifsa_sanctions(type_sanction, amende_payee, actif) 
WHERE type_sanction = 'amende' AND amende_payee = FALSE AND actif = TRUE;

-- 6. Fonction pour appliquer le blocage de vol
CREATE OR REPLACE FUNCTION appliquer_blocage_sanction()
RETURNS TRIGGER AS $$
BEGIN
  -- Si c'est une nouvelle sanction active de type suspension ou retrait
  IF NEW.actif = TRUE AND NEW.cible_pilote_id IS NOT NULL THEN
    IF NEW.type_sanction IN ('suspension_temporaire', 'suspension_licence', 'retrait_licence') THEN
      UPDATE profiles SET 
        sanction_blocage_vol = TRUE,
        sanction_blocage_motif = NEW.type_sanction,
        sanction_blocage_jusqu_au = NEW.expire_at
      WHERE id = NEW.cible_pilote_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Trigger pour appliquer automatiquement le blocage
DROP TRIGGER IF EXISTS trigger_appliquer_blocage ON ifsa_sanctions;
CREATE TRIGGER trigger_appliquer_blocage
AFTER INSERT ON ifsa_sanctions
FOR EACH ROW
EXECUTE FUNCTION appliquer_blocage_sanction();

-- 8. Fonction pour lever le blocage quand la sanction est levée
CREATE OR REPLACE FUNCTION lever_blocage_sanction()
RETURNS TRIGGER AS $$
BEGIN
  -- Si la sanction est levée (actif passe de TRUE à FALSE)
  IF OLD.actif = TRUE AND NEW.actif = FALSE AND NEW.cible_pilote_id IS NOT NULL THEN
    -- Vérifier s'il reste d'autres sanctions actives
    IF NOT EXISTS (
      SELECT 1 FROM ifsa_sanctions 
      WHERE cible_pilote_id = NEW.cible_pilote_id 
      AND actif = TRUE 
      AND id != NEW.id
      AND type_sanction IN ('suspension_temporaire', 'suspension_licence', 'retrait_licence')
    ) THEN
      UPDATE profiles SET 
        sanction_blocage_vol = FALSE,
        sanction_blocage_motif = NULL,
        sanction_blocage_jusqu_au = NULL
      WHERE id = NEW.cible_pilote_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Trigger pour lever automatiquement le blocage
DROP TRIGGER IF EXISTS trigger_lever_blocage ON ifsa_sanctions;
CREATE TRIGGER trigger_lever_blocage
AFTER UPDATE ON ifsa_sanctions
FOR EACH ROW
EXECUTE FUNCTION lever_blocage_sanction();

-- Vérification
SELECT 
  'ifsa_sanctions.amende_payee' as colonne,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'ifsa_sanctions' AND column_name = 'amende_payee') as existe
UNION ALL
SELECT 
  'profiles.sanction_blocage_vol' as colonne,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'sanction_blocage_vol') as existe
UNION ALL
SELECT 
  'ifsa_paiements_amendes' as table_name,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'ifsa_paiements_amendes') as existe;
