-- ============================================================
-- MIGRATION : ESPACE GROUND CREW
-- ============================================================

-- 1. Extension du type ENUM role (si PostgreSQL enum)
-- On utilise ALTER TYPE pour ajouter 'ground_crew' si pas déjà présent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'ground_crew'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    -- Essayer d'ajouter au type enum existant si c'est un vrai enum PG
    BEGIN
      ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ground_crew';
    EXCEPTION WHEN others THEN
      NULL; -- Si la colonne est TEXT, pas besoin
    END;
  END IF;
END $$;

-- ============================================================
-- 2. TABLES GROUND CREW
-- ============================================================

-- Connexions ground crew en service
CREATE TABLE IF NOT EXISTS ground_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  aeroport     TEXT NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ground_sessions_user_unique ON ground_sessions(user_id);

-- Catalogue des portes/parkings par aéroport
CREATE TABLE IF NOT EXISTS airport_gates (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aeroport             TEXT NOT NULL,
  gate_code            TEXT NOT NULL,
  gate_type            TEXT NOT NULL CHECK (gate_type IN ('light','medium','heavy','super_heavy','helicopter','cargo','general_aviation','unrestricted','special')),
  max_aircraft_size    TEXT CHECK (max_aircraft_size IN ('light','medium','heavy','super_heavy') OR max_aircraft_size IS NULL),
  terminal             TEXT,
  reserved_for         TEXT,
  requires_separation  BOOLEAN NOT NULL DEFAULT false,
  notes                TEXT,
  display_order        INTEGER,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS airport_gates_aeroport_idx ON airport_gates(aeroport);

-- Portes attribuées aux vols
CREATE TABLE IF NOT EXISTS gate_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_vol_id     UUID NOT NULL REFERENCES plans_vol(id) ON DELETE CASCADE,
  aeroport        TEXT NOT NULL,
  gate_id         UUID NOT NULL REFERENCES airport_gates(id),
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('depart','arrivee')),
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','occupied','released'))
);
CREATE INDEX IF NOT EXISTS gate_assignments_plan_vol_idx ON gate_assignments(plan_vol_id);
CREATE INDEX IF NOT EXISTS gate_assignments_gate_idx ON gate_assignments(gate_id, status);

-- Abonnements priorité portes compagnies
CREATE TABLE IF NOT EXISTS company_gate_priority (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compagnie_id   UUID NOT NULL REFERENCES compagnies(id) ON DELETE CASCADE,
  aeroport       TEXT NOT NULL,
  gate_id        UUID NOT NULL REFERENCES airport_gates(id),
  priority_level INTEGER NOT NULL DEFAULT 1,
  prix_paye      NUMERIC(12,2),
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_gate_priority_compagnie_idx ON company_gate_priority(compagnie_id);
CREATE INDEX IF NOT EXISTS company_gate_priority_gate_idx ON company_gate_priority(gate_id);

-- Préférences de portes par compagnie (soft, sans coût)
CREATE TABLE IF NOT EXISTS compagnie_gate_preferences (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compagnie_id UUID NOT NULL REFERENCES compagnies(id) ON DELETE CASCADE,
  aeroport     TEXT NOT NULL,
  gate_id      UUID NOT NULL REFERENCES airport_gates(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(compagnie_id, aeroport, gate_id)
);

-- Demandes de services au sol
CREATE TABLE IF NOT EXISTS ground_service_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_vol_id     UUID NOT NULL REFERENCES plans_vol(id) ON DELETE CASCADE,
  pilote_id       UUID NOT NULL REFERENCES profiles(id),
  aeroport        TEXT NOT NULL,
  service_type    TEXT NOT NULL CHECK (service_type IN ('bagages','catering','fuel','boarding')),
  statut          TEXT NOT NULL DEFAULT 'pending' CHECK (statut IN ('pending','accepted','in_progress','completed','rejected')),
  accepted_by     UUID REFERENCES profiles(id),
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at     TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  pax_count       INTEGER,
  score_minijeu   NUMERIC(5,2) CHECK (score_minijeu >= 0 AND score_minijeu <= 1),
  montant_paye    NUMERIC(12,2),
  notes           TEXT
);
CREATE INDEX IF NOT EXISTS ground_service_requests_plan_vol_idx ON ground_service_requests(plan_vol_id);
CREATE INDEX IF NOT EXISTS ground_service_requests_aeroport_statut_idx ON ground_service_requests(aeroport, statut);

-- Suivi du boarding
CREATE TABLE IF NOT EXISTS boarding_status (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_vol_id     UUID NOT NULL REFERENCES plans_vol(id) ON DELETE CASCADE,
  total_pax       INTEGER NOT NULL,
  pax_embarques   INTEGER NOT NULL DEFAULT 0,
  statut          TEXT NOT NULL DEFAULT 'not_started' CHECK (statut IN ('not_started','in_progress','completed')),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  ground_crew_id  UUID REFERENCES profiles(id),
  UNIQUE(plan_vol_id)
);

-- ============================================================
-- 3. COLONNES SUPPLÉMENTAIRES SUR plans_vol
-- ============================================================
-- La colonne `porte` (TEXT) existe déjà dans plans_vol.
-- On ajoute porte_depart comme alias optionnel pour la nouvelle logique.
-- Si porte existe déjà, cette instruction est no-op.
ALTER TABLE plans_vol ADD COLUMN IF NOT EXISTS porte TEXT;

-- ============================================================
-- 4. RLS POLICIES
-- ============================================================
ALTER TABLE ground_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ground_sessions_select" ON ground_sessions;
DROP POLICY IF EXISTS "ground_sessions_insert" ON ground_sessions;
DROP POLICY IF EXISTS "ground_sessions_delete" ON ground_sessions;
CREATE POLICY "ground_sessions_select" ON ground_sessions FOR SELECT USING (true);
CREATE POLICY "ground_sessions_insert" ON ground_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ground_sessions_delete" ON ground_sessions FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE airport_gates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "airport_gates_select" ON airport_gates;
CREATE POLICY "airport_gates_select" ON airport_gates FOR SELECT USING (true);

ALTER TABLE gate_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gate_assignments_select" ON gate_assignments;
CREATE POLICY "gate_assignments_select" ON gate_assignments FOR SELECT USING (true);

ALTER TABLE ground_service_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ground_service_requests_select" ON ground_service_requests;
CREATE POLICY "ground_service_requests_select" ON ground_service_requests FOR SELECT USING (true);

ALTER TABLE boarding_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boarding_status_select" ON boarding_status;
CREATE POLICY "boarding_status_select" ON boarding_status FOR SELECT USING (true);

ALTER TABLE company_gate_priority ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_gate_priority_select" ON company_gate_priority;
CREATE POLICY "company_gate_priority_select" ON company_gate_priority FOR SELECT USING (true);

ALTER TABLE compagnie_gate_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "compagnie_gate_preferences_select" ON compagnie_gate_preferences;
CREATE POLICY "compagnie_gate_preferences_select" ON compagnie_gate_preferences FOR SELECT USING (true);

-- ============================================================
-- 5. SEED CATALOGUE DES PORTES
-- ============================================================
-- Nettoyage préalable pour ré-exécution idempotente
DELETE FROM airport_gates;

-- ─── IRFD – Greater Rockford ──────────────────────────────────────────────────
INSERT INTO airport_gates (aeroport, gate_code, terminal, gate_type, max_aircraft_size, reserved_for, requires_separation, notes, display_order) VALUES
  ('IRFD', 'FATO 1',    'Hors terminal', 'helicopter',       NULL,          NULL,   false, NULL,                          1),
  ('IRFD', 'FATO 2',    'Hors terminal', 'helicopter',       NULL,          NULL,   false, NULL,                          2),
  ('IRFD', 'Parking GA','Hors terminal', 'general_aviation', 'light',       NULL,   false, 'Aviation générale légère',    3),
  ('IRFD', 'Gate 2',    'Terminal 1',    'medium',           'medium',      NULL,   false, NULL,                          4),
  ('IRFD', 'Gate 3',    'Terminal 1',    'medium',           'medium',      NULL,   false, NULL,                          5),
  ('IRFD', 'Gate 4',    'Terminal 1',    'medium',           'medium',      NULL,   false, NULL,                          6),
  ('IRFD', 'Gate 5',    'Terminal 1',    'medium',           'medium',      NULL,   false, NULL,                          7),
  ('IRFD', 'Gate 6',    'Terminal 1',    'medium',           'medium',      NULL,   false, NULL,                          8),
  ('IRFD', 'Gate 7',    'Terminal 1',    'medium',           'medium',      NULL,   false, NULL,                          9),
  ('IRFD', 'Parking 8', 'Terminal 1',    'medium',           'medium',      NULL,   false, NULL,                         10),
  ('IRFD', 'Parking 9', 'Terminal 1',    'medium',           'medium',      NULL,   false, NULL,                         11),
  ('IRFD', 'Parking 10','Terminal 1',    'medium',           'medium',      NULL,   false, NULL,                         12),
  ('IRFD', 'Gate 11',   'Terminal 1',    'super_heavy',      'super_heavy', NULL,   false, 'Réservée A380 uniquement',   13),
  ('IRFD', 'Gate 12',   'Terminal 1',    'heavy',            'heavy',       NULL,   false, NULL,                         14),
  ('IRFD', 'Gate 13',   'Terminal 1',    'heavy',            'heavy',       NULL,   false, NULL,                         15),
  ('IRFD', 'Gate 14',   'Terminal 1',    'heavy',            'heavy',       NULL,   false, NULL,                         16),
  ('IRFD', 'Gate 15',   'Terminal 1',    'unrestricted',     NULL,          'IFSA', false, 'Réservée IFSA',              17),
  ('IRFD', 'Gate 16',   'Terminal 1',    'unrestricted',     NULL,          'IFSA', false, 'Réservée IFSA',              18),
  ('IRFD', 'Gate 17',   'Terminal 2',    'super_heavy',      'super_heavy', NULL,   false, NULL,                         19),
  ('IRFD', 'Gate 18',   'Terminal 2',    'super_heavy',      'super_heavy', NULL,   false, NULL,                         20),
  ('IRFD', 'Gate 19',   'Terminal 2',    'super_heavy',      'super_heavy', NULL,   false, NULL,                         21),
  ('IRFD', 'Gate 20',   'Terminal 2',    'super_heavy',      'super_heavy', NULL,   false, NULL,                         22),
  ('IRFD', 'Gate 21',   'Terminal Cargo','super_heavy',      'super_heavy', NULL,   false, NULL,                         23),
  ('IRFD', 'Gate 22',   'Terminal Cargo','super_heavy',      'super_heavy', NULL,   false, NULL,                         24),
  ('IRFD', 'Gate 23',   'Terminal Cargo','super_heavy',      'super_heavy', NULL,   false, NULL,                         25);

-- ─── ITKO – Tokyo International ───────────────────────────────────────────────
INSERT INTO airport_gates (aeroport, gate_code, terminal, gate_type, max_aircraft_size, reserved_for, requires_separation, notes, display_order) VALUES
  ('ITKO', 'Gate 1',    'Terminal 1',    'medium',      'medium',      NULL, false, 'Light/medium uniquement',           1),
  ('ITKO', 'Gate 2',    'Terminal 1',    'medium',      'medium',      NULL, false, 'Light/medium uniquement',           2),
  ('ITKO', 'Gate 5',    'Terminal 1',    'medium',      'medium',      NULL, false, 'Light/medium uniquement',           3),
  ('ITKO', 'Gate 7',    'Terminal 1',    'medium',      'medium',      NULL, false, 'Light/medium uniquement',           4),
  ('ITKO', 'Gate 8',    'Terminal 1',    'super_heavy', 'super_heavy', NULL, true,  'Séparation 1 parking entre heavys', 5),
  ('ITKO', 'Gate 9',    'Terminal 1',    'super_heavy', 'super_heavy', NULL, true,  'Séparation 1 parking entre heavys', 6),
  ('ITKO', 'Gate 10',   'Terminal 1',    'super_heavy', 'super_heavy', NULL, true,  'Séparation 1 parking entre heavys', 7),
  ('ITKO', 'Gate 11',   'Terminal 1',    'super_heavy', 'super_heavy', NULL, true,  'Séparation 1 parking entre heavys', 8),
  ('ITKO', 'Gate 12',   'Terminal 1',    'super_heavy', 'super_heavy', NULL, true,  'Séparation 1 parking entre heavys', 9),
  ('ITKO', 'Gate 13',   'Terminal 1',    'super_heavy', 'super_heavy', NULL, true,  'Séparation 1 parking entre heavys',10),
  ('ITKO', 'Gate 14',   'Terminal 1',    'super_heavy', 'super_heavy', NULL, true,  'Séparation 1 parking entre heavys',11),
  ('ITKO', 'Gate 15',   'Terminal 1',    'super_heavy', 'super_heavy', NULL, true,  'Séparation 1 parking entre heavys',12),
  ('ITKO', 'Gate 16',   'Terminal 1',    'super_heavy', 'super_heavy', NULL, true,  'Séparation 1 parking entre heavys',13),
  ('ITKO', 'Gate 17',   'Terminal 1',    'super_heavy', 'super_heavy', NULL, true,  'Séparation 1 parking entre heavys',14),
  ('ITKO', 'Parking 2', 'Hors terminal', 'general_aviation', 'light', NULL, false, NULL,                               15),
  ('ITKO', 'Parking 4', 'Hors terminal', 'general_aviation', 'light', NULL, false, NULL,                               16),
  ('ITKO', 'FATO 1',    'Hors terminal', 'helicopter',  NULL,          NULL, false, NULL,                               17),
  ('ITKO', 'FATO 2',    'Hors terminal', 'helicopter',  NULL,          NULL, false, NULL,                               18),
  ('ITKO', 'Gate 18',   'Terminal Cargo','super_heavy', 'super_heavy', NULL, true,  'Séparation 1 parking entre heavys',19),
  ('ITKO', 'Gate 19',   'Terminal Cargo','super_heavy', 'super_heavy', NULL, true,  'Séparation 1 parking entre heavys',20),
  ('ITKO', 'Gate 20',   'Terminal Cargo','super_heavy', 'super_heavy', NULL, true,  'Séparation 1 parking entre heavys',21),
  ('ITKO', 'Gate 21',   'Terminal Cargo','super_heavy', 'super_heavy', NULL, true,  'Séparation 1 parking entre heavys',22),
  ('ITKO', 'Gate 22',   'Terminal Cargo','super_heavy', 'super_heavy', NULL, true,  'Séparation 1 parking entre heavys',23);

-- ─── IZOL – Izolirani International ───────────────────────────────────────────
INSERT INTO airport_gates (aeroport, gate_code, terminal, gate_type, max_aircraft_size, reserved_for, requires_separation, notes, display_order) VALUES
  ('IZOL', 'Gate 1',    'Terminal 1',    'medium', 'medium', NULL, false, NULL,  1),
  ('IZOL', 'Gate 2',    'Terminal 1',    'medium', 'medium', NULL, false, NULL,  2),
  ('IZOL', 'Gate 3',    'Terminal 1',    'medium', 'medium', NULL, false, NULL,  3),
  ('IZOL', 'Gate 4',    'Terminal 1',    'medium', 'medium', NULL, false, NULL,  4),
  ('IZOL', 'Gate 5',    'Terminal 1',    'heavy',  'heavy',  NULL, false, NULL,  5),
  ('IZOL', 'Gate 6',    'Terminal 1',    'heavy',  'heavy',  NULL, false, NULL,  6),
  ('IZOL', 'Gate 7',    'Terminal 1',    'heavy',  'heavy',  NULL, false, NULL,  7),
  ('IZOL', 'Gate 10',   'Terminal Cargo','heavy',  'heavy',  NULL, false, NULL,  8),
  ('IZOL', 'Gate 11',   'Terminal Cargo','heavy',  'heavy',  NULL, false, NULL,  9),
  ('IZOL', 'Gate 12',   'Terminal Cargo','heavy',  'heavy',  NULL, false, NULL, 10),
  ('IZOL', 'Gate 13',   'Terminal Cargo','heavy',  'heavy',  NULL, false, NULL, 11),
  ('IZOL', 'Parking 8', 'East Apron',    'general_aviation', 'light', NULL, false, NULL, 12),
  ('IZOL', 'Parking 9', 'East Apron',    'general_aviation', 'light', NULL, false, NULL, 13);

-- ─── IPPH – Perth International ───────────────────────────────────────────────
INSERT INTO airport_gates (aeroport, gate_code, terminal, gate_type, max_aircraft_size, reserved_for, requires_separation, notes, display_order) VALUES
  ('IPPH', 'Gate 10',    'Terminal 1',    'medium',      'medium',      NULL, false, NULL,                                    1),
  ('IPPH', 'Gate 11',    'Terminal 1',    'medium',      'medium',      NULL, false, NULL,                                    2),
  ('IPPH', 'Gate 12',    'Terminal 1',    'medium',      'medium',      NULL, false, NULL,                                    3),
  ('IPPH', 'Gate 13',    'Terminal 1',    'medium',      'medium',      NULL, false, NULL,                                    4),
  ('IPPH', 'Gate 14',    'Terminal 1',    'super_heavy', 'super_heavy', NULL, false, NULL,                                    5),
  ('IPPH', 'Gate 15',    'Terminal 1',    'super_heavy', 'super_heavy', NULL, false, NULL,                                    6),
  ('IPPH', 'Gate 16',    'Terminal 1',    'heavy',       'heavy',       NULL, false, NULL,                                    7),
  ('IPPH', 'Gate 17',    'Terminal 1',    'heavy',       'heavy',       NULL, false, NULL,                                    8),
  ('IPPH', 'Gate 18',    'Terminal 1',    'heavy',       'heavy',       NULL, false, NULL,                                    9),
  ('IPPH', 'Gate 19',    'Terminal 1',    'heavy',       'heavy',       NULL, false, NULL,                                   10),
  ('IPPH', 'Parking 20', 'Terminal 2',    'medium',      'medium',      NULL, false, 'Light/medium uniquement',              11),
  ('IPPH', 'Parking 21', 'Terminal 2',    'medium',      'medium',      NULL, false, 'Light/medium uniquement',              12),
  ('IPPH', 'Parking 22', 'Terminal 2',    'medium',      'medium',      NULL, false, 'Light/medium uniquement',              13),
  ('IPPH', 'Parking 23', 'Terminal 2',    'medium',      'medium',      NULL, false, 'Light/medium uniquement',              14),
  ('IPPH', 'Parking 24', 'Terminal 2',    'medium',      'medium',      NULL, false, 'Light/medium uniquement',              15),
  ('IPPH', 'Parking 25', 'Terminal 2',    'medium',      'medium',      NULL, false, 'Light/medium uniquement',              16),
  ('IPPH', 'Parking 26', 'Terminal 2',    'medium',      'medium',      NULL, false, 'Light/medium uniquement',              17),
  ('IPPH', 'Parking 27', 'Terminal 2',    'medium',      'medium',      NULL, false, 'Light/medium uniquement',              18),
  ('IPPH', 'Parking 28', 'Terminal 2',    'medium',      'medium',      NULL, false, 'Light/medium uniquement',              19),
  ('IPPH', 'Parking 29', 'Terminal 2',    'medium',      'medium',      NULL, false, 'Light/medium uniquement',              20),
  ('IPPH', 'Parking 40', 'Parking Sud',   'medium',      'medium',      NULL, false, 'Medium/light + aviation générale',    21),
  ('IPPH', 'Parking 41', 'Parking Sud',   'medium',      'medium',      NULL, false, 'Medium/light + aviation générale',    22),
  ('IPPH', 'Parking 42', 'Parking Sud',   'medium',      'medium',      NULL, false, 'Medium/light + aviation générale',    23),
  ('IPPH', 'Parking 43', 'Parking Sud',   'medium',      'medium',      NULL, false, 'Medium/light + aviation générale',    24),
  ('IPPH', 'Parking 44', 'Parking Sud',   'medium',      'medium',      NULL, false, 'Medium/light + aviation générale',    25),
  ('IPPH', 'Parking 45', 'Parking Sud',   'medium',      'medium',      NULL, false, 'Medium/light + aviation générale',    26),
  ('IPPH', 'Parking 46', 'Parking Sud',   'medium',      'medium',      NULL, false, 'Medium/light + aviation générale',    27),
  ('IPPH', 'Parking 47', 'Parking Sud',   'medium',      'medium',      NULL, false, 'Medium/light + aviation générale',    28),
  ('IPPH', 'Parking 30', 'Aviation GA',   'general_aviation', 'light',  NULL, false, 'Aviation générale exclusivement',     29),
  ('IPPH', 'Parking 31', 'Aviation GA',   'general_aviation', 'light',  NULL, false, 'Aviation générale exclusivement',     30),
  ('IPPH', 'Parking 32', 'Aviation GA',   'general_aviation', 'light',  NULL, false, 'Aviation générale exclusivement',     31),
  ('IPPH', 'Gate 1',     'Terminal Cargo','super_heavy', 'super_heavy', NULL, false, NULL,                                   32),
  ('IPPH', 'Gate 2',     'Terminal Cargo','super_heavy', 'super_heavy', NULL, false, NULL,                                   33),
  ('IPPH', 'Gate 3',     'Terminal Cargo','super_heavy', 'super_heavy', NULL, false, NULL,                                   34),
  ('IPPH', 'Gate 4',     'Terminal Cargo','super_heavy', 'super_heavy', NULL, false, NULL,                                   35);

-- ─── ILAR – Larnaca International ─────────────────────────────────────────────
INSERT INTO airport_gates (aeroport, gate_code, terminal, gate_type, max_aircraft_size, reserved_for, requires_separation, notes, display_order) VALUES
  ('ILAR', 'Gate 1',          'Terminal 1',    'heavy',     'heavy', NULL, false, NULL, 1),
  ('ILAR', 'Gate 2',          'Terminal 1',    'heavy',     'heavy', NULL, false, NULL, 2),
  ('ILAR', 'Gate 3',          'Terminal 1',    'heavy',     'heavy', NULL, false, NULL, 3),
  ('ILAR', 'Gate 4',          'Terminal 1',    'medium',    'medium',NULL, false, NULL, 4),
  ('ILAR', 'Gate 5',          'Terminal 1',    'heavy',     'heavy', NULL, false, NULL, 5),
  ('ILAR', 'Gate 6',          'Terminal 1',    'heavy',     'heavy', NULL, false, NULL, 6),
  ('ILAR', 'Gate 7',          'Terminal 1',    'heavy',     'heavy', NULL, false, NULL, 7),
  ('ILAR', 'Parking Nord',    'Terminal Cargo','heavy',     'heavy', NULL, false, NULL, 8),
  ('ILAR', 'Parking Sud',     'Terminal Cargo','heavy',     'heavy', NULL, false, NULL, 9),
  ('ILAR', 'FATO 1',          'Hors terminal', 'helicopter',NULL,    NULL, false, NULL,10),
  ('ILAR', 'FATO 2',          'Hors terminal', 'helicopter',NULL,    NULL, false, NULL,11);

-- ─── IPAP – Paphos International ──────────────────────────────────────────────
INSERT INTO airport_gates (aeroport, gate_code, terminal, gate_type, max_aircraft_size, reserved_for, requires_separation, notes, display_order) VALUES
  ('IPAP', 'Parking 1', 'Terminal 1', 'unrestricted', NULL, NULL, false, NULL, 1),
  ('IPAP', 'Parking 2', 'Terminal 1', 'unrestricted', NULL, NULL, false, NULL, 2),
  ('IPAP', 'Parking 3', 'Terminal 1', 'unrestricted', NULL, NULL, false, NULL, 3),
  ('IPAP', 'Parking 4', 'Terminal 1', 'unrestricted', NULL, NULL, false, NULL, 4),
  ('IPAP', 'Parking 5', 'Terminal 1', 'unrestricted', NULL, NULL, false, NULL, 5);

-- ─── IKFL – Keflavik Airport ───────────────────────────────────────────────────
INSERT INTO airport_gates (aeroport, gate_code, terminal, gate_type, max_aircraft_size, reserved_for, requires_separation, notes, display_order) VALUES
  ('IKFL', 'Gate 1',    'Terminal 1',    'medium',           'medium', NULL, false, NULL,  1),
  ('IKFL', 'Gate 2',    'Terminal 1',    'medium',           'medium', NULL, false, NULL,  2),
  ('IKFL', 'Gate 3',    'Terminal 1',    'medium',           'medium', NULL, false, NULL,  3),
  ('IKFL', 'Gate 4',    'Terminal 1',    'medium',           'medium', NULL, false, NULL,  4),
  ('IKFL', 'Gate 5',    'Terminal 1',    'medium',           'medium', NULL, false, NULL,  5),
  ('IKFL', 'Gate 6',    'Terminal 1',    'heavy',            'heavy',  NULL, false, NULL,  6),
  ('IKFL', 'Gate 7',    'Terminal 1',    'medium',           'medium', NULL, false, NULL,  7),
  ('IKFL', 'Gate 8',    'Terminal 1',    'heavy',            'heavy',  NULL, false, NULL,  8),
  ('IKFL', 'Gate 9',    'Terminal 1',    'heavy',            'heavy',  NULL, false, NULL,  9),
  ('IKFL', 'Gate 10',   'Terminal 1',    'heavy',            'heavy',  NULL, false, NULL, 10),
  ('IKFL', 'Gate 11',   'Terminal 1',    'heavy',            'heavy',  NULL, false, NULL, 11),
  ('IKFL', 'Parking 40','Parking Sud',   'medium',           'medium', NULL, false, 'Light/medium uniquement', 12),
  ('IKFL', 'Parking 41','Parking Sud',   'medium',           'medium', NULL, false, 'Light/medium uniquement', 13),
  ('IKFL', 'Parking 42','Parking Sud',   'medium',           'medium', NULL, false, 'Light/medium uniquement', 14),
  ('IKFL', 'Parking 43','Parking Sud',   'medium',           'medium', NULL, false, 'Light/medium uniquement', 15),
  ('IKFL', 'Parking 44','Parking Sud',   'medium',           'medium', NULL, false, 'Light/medium uniquement', 16),
  ('IKFL', 'Parking 45','Parking Sud',   'medium',           'medium', NULL, false, 'Light/medium uniquement', 17),
  ('IKFL', 'Parking 30','Aviation GA',   'general_aviation', 'light',  NULL, false, 'Aviation générale exclusivement', 18),
  ('IKFL', 'Parking 31','Aviation GA',   'general_aviation', 'light',  NULL, false, 'Aviation générale exclusivement', 19),
  ('IKFL', 'Parking 32','Aviation GA',   'general_aviation', 'light',  NULL, false, 'Aviation générale exclusivement', 20),
  ('IKFL', 'FATO 1',    'Hors terminal', 'helicopter',       NULL,     NULL, false, NULL, 21),
  ('IKFL', 'FATO 2',    'Hors terminal', 'helicopter',       NULL,     NULL, false, NULL, 22);

-- ─── IMLR – Mellor International ──────────────────────────────────────────────
INSERT INTO airport_gates (aeroport, gate_code, terminal, gate_type, max_aircraft_size, reserved_for, requires_separation, notes, display_order) VALUES
  ('IMLR', 'Gate 1',    'Terminal 1', 'unrestricted', NULL, NULL, false, NULL, 1),
  ('IMLR', 'Gate 2',    'Terminal 1', 'unrestricted', NULL, NULL, false, NULL, 2),
  ('IMLR', 'Gate 3',    'Terminal 1', 'unrestricted', NULL, NULL, false, NULL, 3),
  ('IMLR', 'Parking 4', 'Terminal 1', 'unrestricted', NULL, NULL, false, NULL, 4);

-- ─── ISAU – Sauthamptona Airport (règle séparation) ───────────────────────────
INSERT INTO airport_gates (aeroport, gate_code, terminal, gate_type, max_aircraft_size, reserved_for, requires_separation, notes, display_order) VALUES
  ('ISAU', 'Parking 1', 'Terminal 1', 'medium', 'medium', NULL, true, 'Séparer de 1 parking entre chaque avion', 1),
  ('ISAU', 'Parking 2', 'Terminal 1', 'medium', 'medium', NULL, true, 'Séparer de 1 parking entre chaque avion', 2),
  ('ISAU', 'Parking 3', 'Terminal 1', 'medium', 'medium', NULL, true, 'Séparer de 1 parking entre chaque avion', 3),
  ('ISAU', 'Parking 4', 'Terminal 1', 'medium', 'medium', NULL, true, 'Séparer de 1 parking entre chaque avion', 4);

-- ─── Aéroports avec parkings unrestricted ─────────────────────────────────────
-- IJAF, IBTH, ILKL, IBLT, IHEN, IDCS, ITEY
INSERT INTO airport_gates (aeroport, gate_code, terminal, gate_type, max_aircraft_size, reserved_for, requires_separation, display_order) VALUES
  ('IJAF', 'Parking 1', 'Parking', 'unrestricted', NULL, NULL, false, 1),
  ('IJAF', 'Parking 2', 'Parking', 'unrestricted', NULL, NULL, false, 2),
  ('IJAF', 'Parking 3', 'Parking', 'unrestricted', NULL, NULL, false, 3),
  ('IBTH', 'Parking 1', 'Parking', 'unrestricted', NULL, NULL, false, 1),
  ('IBTH', 'Parking 2', 'Parking', 'unrestricted', NULL, NULL, false, 2),
  ('ILKL', 'Parking 1', 'Parking', 'unrestricted', NULL, NULL, false, 1),
  ('ILKL', 'Parking 2', 'Parking', 'unrestricted', NULL, NULL, false, 2),
  ('IBLT', 'Parking 1', 'Parking', 'unrestricted', NULL, NULL, false, 1),
  ('IBLT', 'Parking 2', 'Parking', 'unrestricted', NULL, NULL, false, 2),
  ('IHEN', 'Parking 1', 'Parking', 'unrestricted', NULL, NULL, false, 1),
  ('IHEN', 'Parking 2', 'Parking', 'unrestricted', NULL, NULL, false, 2),
  ('IDCS', 'Parking 1', 'Parking', 'unrestricted', NULL, NULL, false, 1),
  ('IDCS', 'Parking 2', 'Parking', 'unrestricted', NULL, NULL, false, 2),
  ('ITEY', 'Parking 1', 'Parking', 'unrestricted', NULL, NULL, false, 1),
  ('ITEY', 'Parking 2', 'Parking', 'unrestricted', NULL, NULL, false, 2);

-- ─── ITRC – Training Centre (aviation générale seulement) ─────────────────────
INSERT INTO airport_gates (aeroport, gate_code, terminal, gate_type, max_aircraft_size, reserved_for, requires_separation, display_order) VALUES
  ('ITRC', 'Parking 1', 'Parking', 'general_aviation', 'light', NULL, false, 1),
  ('ITRC', 'Parking 2', 'Parking', 'general_aviation', 'light', NULL, false, 2),
  ('ITRC', 'Parking 3', 'Parking', 'general_aviation', 'light', NULL, false, 3);

-- ─── Bases militaires spéciales (parking libre) ───────────────────────────────
-- IAAB, ISCM, IGAR
INSERT INTO airport_gates (aeroport, gate_code, terminal, gate_type, max_aircraft_size, reserved_for, requires_separation, notes, display_order) VALUES
  ('IIAB', 'Parking 1', 'Parking', 'special', NULL, NULL, false, 'Parking libre — pas d''attribution automatique', 1),
  ('IIAB', 'Parking 2', 'Parking', 'special', NULL, NULL, false, 'Parking libre — pas d''attribution automatique', 2),
  ('ISCM', 'Parking 1', 'Parking', 'special', NULL, NULL, false, 'Parking libre — pas d''attribution automatique', 1),
  ('ISCM', 'Parking 2', 'Parking', 'special', NULL, NULL, false, 'Parking libre — pas d''attribution automatique', 2),
  ('IGAR', 'Parking 1', 'Parking', 'special', NULL, NULL, false, 'Parking libre — pas d''attribution automatique', 1),
  ('IGAR', 'Parking 2', 'Parking', 'special', NULL, NULL, false, 'Parking libre — pas d''attribution automatique', 2);
