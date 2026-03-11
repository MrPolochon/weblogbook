-- ============================================
-- AeroSchool: Modules à questions (banques QCM)
-- ============================================
-- Chaque module stocke des QCM. Un bloc "module à questions" dans un formulaire
-- référence un module par ID et tire aléatoirement N questions (ex: 10 sur 150).

CREATE TABLE IF NOT EXISTS aeroschool_question_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  questions JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- Structure d'une question dans le JSONB:
-- { "id": "uuid", "title": "...", "options": ["A", "B", "C"], "correct_answers": ["A"] }

CREATE INDEX IF NOT EXISTS idx_aeroschool_modules_created ON aeroschool_question_modules(created_at DESC);

ALTER TABLE aeroschool_question_modules ENABLE ROW LEVEL SECURITY;

-- Lecture: admin uniquement (les questions random sont exposées via API dédiée)
CREATE POLICY "aeroschool_modules_admin_select"
  ON aeroschool_question_modules FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE POLICY "aeroschool_modules_admin_insert"
  ON aeroschool_question_modules FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE POLICY "aeroschool_modules_admin_update"
  ON aeroschool_question_modules FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE POLICY "aeroschool_modules_admin_delete"
  ON aeroschool_question_modules FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
