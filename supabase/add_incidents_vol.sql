-- ============================================================
-- SYSTÈME D'INCIDENTS DE VOL (CRASH / ATTERRISSAGE D'URGENCE)
-- Workflow : ATC signale → avion bloqué → staff examine → décision
-- ============================================================

-- 1) Table principale des incidents
CREATE TABLE IF NOT EXISTS incidents_vol (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_incident TEXT UNIQUE NOT NULL, -- Format: INC-2026-0001

  -- Type d'incident
  type_incident TEXT NOT NULL CHECK (type_incident IN ('crash', 'atterrissage_urgence')),

  -- Infos du vol (snapshot au moment de l'incident)
  plan_vol_id UUID REFERENCES plans_vol(id) ON DELETE SET NULL,
  numero_vol TEXT,
  aeroport_depart TEXT,
  aeroport_arrivee TEXT,
  type_vol TEXT,
  aeroport_incident TEXT, -- Aéroport où l'incident a eu lieu (aéroport ATC)

  -- Avion concerné
  compagnie_avion_id UUID REFERENCES compagnie_avions(id) ON DELETE SET NULL,
  immatriculation TEXT,
  type_avion TEXT,
  usure_avant_incident INTEGER, -- usure_percent au moment de l'incident

  -- Pilote et compagnie
  pilote_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  pilote_identifiant TEXT,
  compagnie_id UUID REFERENCES compagnies(id) ON DELETE SET NULL,

  -- ATC qui signale
  signale_par_id UUID NOT NULL REFERENCES profiles(id),
  signale_par_identifiant TEXT,
  position_atc TEXT, -- Position ATC au moment du signalement

  -- Preuve
  screenshot_url TEXT,

  -- Traitement staff
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'en_examen', 'clos')),
  decision TEXT CHECK (decision IN ('remis_en_etat', 'detruit', NULL)),
  decision_notes TEXT,
  examine_par_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  examine_at TIMESTAMPTZ,

  -- Signalement IFSA lié
  signalement_ifsa_id UUID REFERENCES ifsa_signalements(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Index
CREATE INDEX IF NOT EXISTS idx_incidents_vol_statut ON incidents_vol(statut, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_vol_avion ON incidents_vol(compagnie_avion_id);
CREATE INDEX IF NOT EXISTS idx_incidents_vol_pilote ON incidents_vol(pilote_id);

-- 3) Colonne blocage incident sur compagnie_avions
ALTER TABLE compagnie_avions
  ADD COLUMN IF NOT EXISTS bloque_incident BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS incident_id UUID REFERENCES incidents_vol(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_compagnie_avions_bloque_incident
  ON compagnie_avions(bloque_incident) WHERE bloque_incident = TRUE;

-- 4) Fonction pour générer le numéro d'incident
CREATE OR REPLACE FUNCTION generate_incident_numero()
RETURNS TEXT AS $$
DECLARE
  year_part TEXT;
  seq_num INTEGER;
BEGIN
  year_part := TO_CHAR(NOW(), 'YYYY');
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(SPLIT_PART(numero_incident, '-', 3), '-', 1) AS INTEGER)
  ), 0) + 1 INTO seq_num
  FROM incidents_vol
  WHERE numero_incident LIKE 'INC-' || year_part || '-%';
  RETURN 'INC-' || year_part || '-' || LPAD(seq_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- 5) RLS
ALTER TABLE incidents_vol ENABLE ROW LEVEL SECURITY;

CREATE POLICY "incidents_vol_select" ON incidents_vol
  FOR SELECT USING (true);

CREATE POLICY "incidents_vol_insert" ON incidents_vol
  FOR INSERT WITH CHECK (true);

CREATE POLICY "incidents_vol_update" ON incidents_vol
  FOR UPDATE USING (true);

-- 6) Commentaires
COMMENT ON TABLE incidents_vol IS 'Incidents de vol (crash, atterrissage d''urgence) signalés par les ATC, examinés par le staff';
COMMENT ON COLUMN incidents_vol.bloque_incident IS 'Si true, l''avion est bloqué et irréparable jusqu''à examen staff';
