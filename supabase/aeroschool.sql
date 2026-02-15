-- ============================================
-- AeroSchool: Système de formulaires (type Google Forms)
-- ============================================

-- Table des formulaires créés par les admins
CREATE TABLE IF NOT EXISTS aeroschool_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  is_published BOOLEAN DEFAULT false,
  delivery_mode TEXT NOT NULL DEFAULT 'review' CHECK (delivery_mode IN ('webhook', 'review')),
  webhook_url TEXT,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- Table des réponses/soumissions des candidats
CREATE TABLE IF NOT EXISTS aeroschool_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES aeroschool_forms(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  score INTEGER,
  max_score INTEGER,
  cheating_detected BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'trashed'))
);

-- Index pour la performance
CREATE INDEX IF NOT EXISTS idx_aeroschool_forms_published ON aeroschool_forms(is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_aeroschool_responses_form ON aeroschool_responses(form_id);

-- RLS
ALTER TABLE aeroschool_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE aeroschool_responses ENABLE ROW LEVEL SECURITY;

-- Formulaires: lecture publique si publié, CRUD admin
CREATE POLICY "aeroschool_forms_public_read"
  ON aeroschool_forms FOR SELECT
  USING (is_published = true OR EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE POLICY "aeroschool_forms_admin_insert"
  ON aeroschool_forms FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE POLICY "aeroschool_forms_admin_update"
  ON aeroschool_forms FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE POLICY "aeroschool_forms_admin_delete"
  ON aeroschool_forms FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- Réponses: insertion publique (anon), lecture/suppression admin
CREATE POLICY "aeroschool_responses_public_insert"
  ON aeroschool_responses FOR INSERT
  WITH CHECK (true);

CREATE POLICY "aeroschool_responses_admin_read"
  ON aeroschool_responses FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE POLICY "aeroschool_responses_admin_delete"
  ON aeroschool_responses FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- ============================================
-- Seed : Formulaire "Passage Catégorie 3"
-- ============================================
INSERT INTO aeroschool_forms (title, description, delivery_mode, is_published, sections)
VALUES (
  'FORMULAIRE PASSAGE CATEGORIE 3',
  'Merci de remplir ce formulaire si vous souhaitez passer votre catégorie 3.',
  'review',
  true,
  '[
    {
      "id": "sec-info-personnelles",
      "title": "Informations personnelles",
      "description": "Veuillez renseigner vos informations de base.",
      "questions": [
        {
          "id": "q-pseudo-discord",
          "type": "short_text",
          "title": "Quel est ton pseudo Discord ?",
          "description": "",
          "required": true,
          "options": [],
          "is_graded": false,
          "points": 0,
          "correct_answers": []
        },
        {
          "id": "q-age",
          "type": "short_text",
          "title": "Quel est ton âge ?",
          "description": "",
          "required": true,
          "options": [],
          "is_graded": false,
          "points": 0,
          "correct_answers": []
        },
        {
          "id": "q-heures-ptfs",
          "type": "short_text",
          "title": "Combien as-tu d''heures sur PTFS ?",
          "description": "",
          "required": false,
          "options": [],
          "is_graded": false,
          "points": 0,
          "correct_answers": []
        },
        {
          "id": "q-pseudo-roblox",
          "type": "short_text",
          "title": "Quel est ton pseudo Roblox ?",
          "description": "",
          "required": true,
          "options": [],
          "is_graded": false,
          "points": 0,
          "correct_answers": []
        }
      ]
    },
    {
      "id": "sec-serment",
      "title": "Serment",
      "description": "",
      "questions": [
        {
          "id": "q-serment",
          "type": "paragraph",
          "title": "Je jure sur l''honneur, la validité de mes réponses.",
          "description": "Main levé, récitant cette phrase à haute voix.",
          "required": true,
          "options": [],
          "is_graded": false,
          "points": 0,
          "correct_answers": []
        }
      ]
    },
    {
      "id": "sec-connaissances",
      "title": "Connaissances aéronautiques",
      "description": "Questions sur tes connaissances en aviation.",
      "questions": [
        {
          "id": "q-clearance",
          "type": "paragraph",
          "title": "Qu''est-ce que c''est qu''une clearance ?",
          "description": "",
          "required": true,
          "options": [],
          "is_graded": false,
          "points": 0,
          "correct_answers": []
        },
        {
          "id": "q-repoussage",
          "type": "paragraph",
          "title": "Qu''est-ce qu''un repoussage ?",
          "description": "",
          "required": true,
          "options": [],
          "is_graded": false,
          "points": 0,
          "correct_answers": []
        },
        {
          "id": "q-roulage",
          "type": "paragraph",
          "title": "Qu''est-ce qu''un roulage ?",
          "description": "",
          "required": true,
          "options": [],
          "is_graded": false,
          "points": 0,
          "correct_answers": []
        },
        {
          "id": "q-point-attente",
          "type": "paragraph",
          "title": "Qu''est-ce qu''un point d''attente ?",
          "description": "",
          "required": true,
          "options": [],
          "is_graded": false,
          "points": 0,
          "correct_answers": []
        },
        {
          "id": "q-rp-hrp",
          "type": "paragraph",
          "title": "Qu''est-ce que le RP & le HRP ?",
          "description": "",
          "required": true,
          "options": [],
          "is_graded": false,
          "points": 0,
          "correct_answers": []
        }
      ]
    },
    {
      "id": "sec-motivation",
      "title": "Motivation",
      "description": "",
      "questions": [
        {
          "id": "q-pourquoi-serveur",
          "type": "paragraph",
          "title": "Pourquoi venir sur notre serveur ?",
          "description": "",
          "required": true,
          "options": [],
          "is_graded": false,
          "points": 0,
          "correct_answers": []
        },
        {
          "id": "q-compagnie",
          "type": "short_text",
          "title": "Quelle compagnie veux-tu rejoindre ?",
          "description": "",
          "required": false,
          "options": [],
          "is_graded": false,
          "points": 0,
          "correct_answers": []
        }
      ]
    }
  ]'::jsonb
)
ON CONFLICT DO NOTHING;
