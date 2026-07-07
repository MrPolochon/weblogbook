-- ============================================================
-- MIGRATION : SYSTÈME D'ÉQUIPES GROUND CREW
-- ============================================================

-- 1. TABLE ground_crew_teams — Équipes actives
-- ============================================================
CREATE TABLE IF NOT EXISTS ground_crew_teams (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aeroport     TEXT NOT NULL,
  created_by   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  disbanded_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ground_crew_teams_aeroport_idx
  ON ground_crew_teams(aeroport) WHERE disbanded_at IS NULL;

-- 2. TABLE ground_crew_team_members — Membres d'une équipe
-- ============================================================
CREATE TABLE IF NOT EXISTS ground_crew_team_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id   UUID NOT NULL REFERENCES ground_crew_teams(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ground_crew_team_members_team_idx
  ON ground_crew_team_members(team_id);
CREATE INDEX IF NOT EXISTS ground_crew_team_members_user_idx
  ON ground_crew_team_members(user_id) WHERE left_at IS NULL;
-- Un GC ne peut être que dans une seule équipe active à la fois
CREATE UNIQUE INDEX IF NOT EXISTS ground_crew_team_members_unique_active
  ON ground_crew_team_members(user_id) WHERE left_at IS NULL;

-- 3. TABLE ground_crew_team_invitations — Invitations en attente
-- ============================================================
CREATE TABLE IF NOT EXISTS ground_crew_team_invitations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      UUID NOT NULL REFERENCES ground_crew_teams(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_user_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  aeroport     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '5 minutes'
);
CREATE INDEX IF NOT EXISTS ground_crew_team_invitations_to_user_idx
  ON ground_crew_team_invitations(to_user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS ground_crew_team_invitations_team_idx
  ON ground_crew_team_invitations(team_id);

-- 4. TABLE ground_crew_service_contributions — Score et paiement par membre
-- ============================================================
CREATE TABLE IF NOT EXISTS ground_crew_service_contributions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id  UUID NOT NULL REFERENCES ground_service_requests(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  score_minijeu       NUMERIC(5,2) NOT NULL DEFAULT 0
                        CHECK (score_minijeu >= 0 AND score_minijeu <= 1),
  montant_percu       NUMERIC(12,2) NOT NULL DEFAULT 0,
  completed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(service_request_id, user_id)
);
CREATE INDEX IF NOT EXISTS ground_crew_service_contributions_user_idx
  ON ground_crew_service_contributions(user_id);
CREATE INDEX IF NOT EXISTS ground_crew_service_contributions_service_idx
  ON ground_crew_service_contributions(service_request_id);

-- 5. Modifications de ground_service_requests
-- ============================================================
ALTER TABLE ground_service_requests
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES ground_crew_teams(id);

-- Ajouter 'ground_crew_unavailable' au statut
-- (on doit supprimer et recréer la contrainte CHECK)
ALTER TABLE ground_service_requests
  DROP CONSTRAINT IF EXISTS ground_service_requests_statut_check;
ALTER TABLE ground_service_requests
  ADD CONSTRAINT ground_service_requests_statut_check
  CHECK (statut IN (
    'pending',
    'accepted',
    'in_progress',
    'completed',
    'rejected',
    'ground_crew_unavailable'
  ));

CREATE INDEX IF NOT EXISTS ground_service_requests_team_idx
  ON ground_service_requests(team_id);

-- 6. Modifications de boarding_status
-- ============================================================
ALTER TABLE boarding_status
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES ground_crew_teams(id);

-- 7. RLS Policies
-- ============================================================

-- ground_crew_teams
ALTER TABLE ground_crew_teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gct_select" ON ground_crew_teams;
DROP POLICY IF EXISTS "gct_insert" ON ground_crew_teams;
DROP POLICY IF EXISTS "gct_update" ON ground_crew_teams;
CREATE POLICY "gct_select" ON ground_crew_teams FOR SELECT USING (true);
CREATE POLICY "gct_insert" ON ground_crew_teams FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "gct_update" ON ground_crew_teams FOR UPDATE USING (true);

-- ground_crew_team_members
ALTER TABLE ground_crew_team_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gctm_select" ON ground_crew_team_members;
DROP POLICY IF EXISTS "gctm_insert" ON ground_crew_team_members;
DROP POLICY IF EXISTS "gctm_update" ON ground_crew_team_members;
CREATE POLICY "gctm_select" ON ground_crew_team_members FOR SELECT USING (true);
CREATE POLICY "gctm_insert" ON ground_crew_team_members FOR INSERT WITH CHECK (true);
CREATE POLICY "gctm_update" ON ground_crew_team_members FOR UPDATE USING (true);

-- ground_crew_team_invitations
ALTER TABLE ground_crew_team_invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gcti_select" ON ground_crew_team_invitations;
DROP POLICY IF EXISTS "gcti_insert" ON ground_crew_team_invitations;
DROP POLICY IF EXISTS "gcti_update" ON ground_crew_team_invitations;
CREATE POLICY "gcti_select" ON ground_crew_team_invitations FOR SELECT USING (true);
CREATE POLICY "gcti_insert" ON ground_crew_team_invitations
  FOR INSERT WITH CHECK (auth.uid() = from_user_id);
CREATE POLICY "gcti_update" ON ground_crew_team_invitations FOR UPDATE USING (true);

-- ground_crew_service_contributions
ALTER TABLE ground_crew_service_contributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gcsc_select" ON ground_crew_service_contributions;
DROP POLICY IF EXISTS "gcsc_insert" ON ground_crew_service_contributions;
DROP POLICY IF EXISTS "gcsc_update" ON ground_crew_service_contributions;
CREATE POLICY "gcsc_select" ON ground_crew_service_contributions FOR SELECT USING (true);
CREATE POLICY "gcsc_insert" ON ground_crew_service_contributions FOR INSERT WITH CHECK (true);
CREATE POLICY "gcsc_update" ON ground_crew_service_contributions FOR UPDATE USING (true);
