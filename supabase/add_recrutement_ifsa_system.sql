-- =====================================================
-- SYSTÈME DE RECRUTEMENT ET IFSA (Modération)
-- =====================================================

-- 1. Ajouter le rôle IFSA dans les profils
-- Le rôle IFSA peut être ajouté en plus du rôle existant
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ifsa BOOLEAN DEFAULT FALSE;
COMMENT ON COLUMN profiles.ifsa IS 'Membre de l''IFSA (modération aviation)';

-- 2. Table des invitations de recrutement
CREATE TABLE IF NOT EXISTS compagnie_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compagnie_id UUID NOT NULL REFERENCES compagnies(id) ON DELETE CASCADE,
  pilote_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'acceptee', 'refusee', 'annulee')),
  message_invitation TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  repondu_at TIMESTAMPTZ,
  UNIQUE(compagnie_id, pilote_id, statut)
);

CREATE INDEX IF NOT EXISTS idx_invitations_pilote ON compagnie_invitations(pilote_id, statut);
CREATE INDEX IF NOT EXISTS idx_invitations_compagnie ON compagnie_invitations(compagnie_id, statut);

COMMENT ON TABLE compagnie_invitations IS 'Invitations de recrutement envoyées par les PDG';

-- 3. Table des sanctions IFSA
CREATE TABLE IF NOT EXISTS ifsa_sanctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_sanction TEXT NOT NULL CHECK (type_sanction IN ('avertissement', 'suspension_temporaire', 'suspension_licence', 'retrait_licence', 'amende')),
  cible_type TEXT NOT NULL CHECK (cible_type IN ('pilote', 'compagnie', 'atc')),
  cible_pilote_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  cible_compagnie_id UUID REFERENCES compagnies(id) ON DELETE SET NULL,
  motif TEXT NOT NULL,
  details TEXT,
  duree_jours INTEGER, -- Pour les suspensions
  montant_amende INTEGER, -- Pour les amendes
  actif BOOLEAN DEFAULT TRUE,
  emis_par_id UUID NOT NULL REFERENCES profiles(id),
  cleared_by_id UUID REFERENCES profiles(id),
  cleared_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expire_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sanctions_pilote ON ifsa_sanctions(cible_pilote_id, actif);
CREATE INDEX IF NOT EXISTS idx_sanctions_compagnie ON ifsa_sanctions(cible_compagnie_id, actif);
CREATE INDEX IF NOT EXISTS idx_sanctions_actif ON ifsa_sanctions(actif, created_at DESC);

COMMENT ON TABLE ifsa_sanctions IS 'Sanctions émises par l''IFSA (avertissements, suspensions, etc.)';

-- 4. Table des enquêtes IFSA
CREATE TABLE IF NOT EXISTS ifsa_enquetes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_dossier TEXT UNIQUE NOT NULL, -- Format: ENQ-2024-0001
  titre TEXT NOT NULL,
  description TEXT,
  statut TEXT NOT NULL DEFAULT 'ouverte' CHECK (statut IN ('ouverte', 'en_cours', 'cloturee', 'classee')),
  priorite TEXT NOT NULL DEFAULT 'normale' CHECK (priorite IN ('basse', 'normale', 'haute', 'urgente')),
  -- Personnes impliquées
  pilote_concerne_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  compagnie_concernee_id UUID REFERENCES compagnies(id) ON DELETE SET NULL,
  -- Suivi
  enqueteur_id UUID REFERENCES profiles(id), -- Agent IFSA assigné
  ouvert_par_id UUID NOT NULL REFERENCES profiles(id),
  conclusion TEXT,
  sanctions_appliquees TEXT[], -- IDs des sanctions liées
  created_at TIMESTAMPTZ DEFAULT NOW(),
  cloture_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_enquetes_statut ON ifsa_enquetes(statut, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enquetes_pilote ON ifsa_enquetes(pilote_concerne_id);
CREATE INDEX IF NOT EXISTS idx_enquetes_compagnie ON ifsa_enquetes(compagnie_concernee_id);

COMMENT ON TABLE ifsa_enquetes IS 'Enquêtes ouvertes par l''IFSA suite à des signalements';

-- 5. Table des signalements (par les pilotes/utilisateurs)
CREATE TABLE IF NOT EXISTS ifsa_signalements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_signalement TEXT UNIQUE NOT NULL, -- Format: SIG-2024-0001
  type_signalement TEXT NOT NULL CHECK (type_signalement IN ('incident', 'plainte', 'infraction', 'autre')),
  titre TEXT NOT NULL,
  description TEXT NOT NULL,
  -- Qui signale
  signale_par_id UUID NOT NULL REFERENCES profiles(id),
  -- Qui est signalé (optionnel)
  pilote_signale_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  compagnie_signalee_id UUID REFERENCES compagnies(id) ON DELETE SET NULL,
  -- Preuves
  preuves TEXT, -- URLs ou descriptions
  -- Traitement
  statut TEXT NOT NULL DEFAULT 'nouveau' CHECK (statut IN ('nouveau', 'en_examen', 'enquete_ouverte', 'classe', 'rejete')),
  enquete_id UUID REFERENCES ifsa_enquetes(id) ON DELETE SET NULL,
  traite_par_id UUID REFERENCES profiles(id),
  reponse_ifsa TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  traite_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_signalements_statut ON ifsa_signalements(statut, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signalements_signaleur ON ifsa_signalements(signale_par_id);

COMMENT ON TABLE ifsa_signalements IS 'Signalements envoyés par les utilisateurs à l''IFSA';

-- 6. Notes d'enquête (commentaires internes IFSA)
CREATE TABLE IF NOT EXISTS ifsa_enquetes_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enquete_id UUID NOT NULL REFERENCES ifsa_enquetes(id) ON DELETE CASCADE,
  auteur_id UUID NOT NULL REFERENCES profiles(id),
  contenu TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_enquete ON ifsa_enquetes_notes(enquete_id, created_at);

-- 7. Fonction pour générer les numéros de dossier
CREATE OR REPLACE FUNCTION generate_ifsa_numero(prefix TEXT)
RETURNS TEXT AS $$
DECLARE
  year_part TEXT;
  seq_num INTEGER;
  result TEXT;
BEGIN
  year_part := TO_CHAR(NOW(), 'YYYY');
  
  IF prefix = 'ENQ' THEN
    SELECT COALESCE(MAX(
      CAST(SPLIT_PART(SPLIT_PART(numero_dossier, '-', 3), '-', 1) AS INTEGER)
    ), 0) + 1 INTO seq_num
    FROM ifsa_enquetes
    WHERE numero_dossier LIKE 'ENQ-' || year_part || '-%';
  ELSE
    SELECT COALESCE(MAX(
      CAST(SPLIT_PART(SPLIT_PART(numero_signalement, '-', 3), '-', 1) AS INTEGER)
    ), 0) + 1 INTO seq_num
    FROM ifsa_signalements
    WHERE numero_signalement LIKE 'SIG-' || year_part || '-%';
  END IF;
  
  result := prefix || '-' || year_part || '-' || LPAD(seq_num::TEXT, 4, '0');
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Vérification
SELECT 
  'profiles.ifsa' as colonne,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'ifsa') as existe
UNION ALL
SELECT 
  'compagnie_invitations' as colonne,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'compagnie_invitations') as existe
UNION ALL
SELECT 
  'ifsa_sanctions' as colonne,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'ifsa_sanctions') as existe
UNION ALL
SELECT 
  'ifsa_enquetes' as colonne,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'ifsa_enquetes') as existe
UNION ALL
SELECT 
  'ifsa_signalements' as colonne,
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'ifsa_signalements') as existe;
