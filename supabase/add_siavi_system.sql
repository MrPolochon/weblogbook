-- ============================================================
-- SYSTÈME SIAVI (Service d'Incendie Aéroportuaire et Information de Vol)
-- Brigade AFIS - Agents d'Information de Vol
-- ============================================================

-- 1) Ajouter la colonne siavi aux profils
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS siavi BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.siavi IS 'Indique si le compte a accès à l''espace SIAVI (Agent AFIS)';

-- 2) Liste des aéroports exclusivement SIAVI
-- Ces aéroports sont gérés UNIQUEMENT par la brigade SIAVI
-- IBTH - St Barthelemy
-- IJAF - Al Najaf
-- IBAR - Barra
-- IHEN - Henstridge
-- IDCS - SABA
-- ILKL - Lukla
-- ISCM - RAF Scampton

CREATE TABLE IF NOT EXISTS public.aeroports_siavi (
  code_oaci TEXT PRIMARY KEY,
  nom TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insérer les aéroports SIAVI exclusifs
INSERT INTO public.aeroports_siavi (code_oaci, nom) VALUES
  ('IBTH', 'St Barthelemy'),
  ('IJAF', 'Al Najaf'),
  ('IBAR', 'Barra'),
  ('IHEN', 'Henstridge'),
  ('IDCS', 'SABA'),
  ('ILKL', 'Lukla'),
  ('ISCM', 'RAF Scampton')
ON CONFLICT (code_oaci) DO NOTHING;

-- 3) Table des sessions AFIS (similaire à atc_sessions mais pour SIAVI)
CREATE TABLE IF NOT EXISTS public.afis_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  aeroport TEXT NOT NULL,
  est_afis BOOLEAN NOT NULL DEFAULT TRUE, -- TRUE = fonctions AFIS, FALSE = pompier uniquement
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_afis_sessions_aeroport ON public.afis_sessions(aeroport);
CREATE INDEX IF NOT EXISTS idx_afis_sessions_user ON public.afis_sessions(user_id);

-- 4) RLS pour afis_sessions
ALTER TABLE public.afis_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aeroports_siavi ENABLE ROW LEVEL SECURITY;

-- Lecture pour tous les authentifiés
DROP POLICY IF EXISTS "afis_sessions_select" ON public.afis_sessions;
CREATE POLICY "afis_sessions_select" ON public.afis_sessions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "afis_sessions_insert" ON public.afis_sessions;
CREATE POLICY "afis_sessions_insert" ON public.afis_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "afis_sessions_update" ON public.afis_sessions;
CREATE POLICY "afis_sessions_update" ON public.afis_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "afis_sessions_delete" ON public.afis_sessions;
CREATE POLICY "afis_sessions_delete" ON public.afis_sessions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "aeroports_siavi_select" ON public.aeroports_siavi;
CREATE POLICY "aeroports_siavi_select" ON public.aeroports_siavi FOR SELECT TO authenticated USING (true);

-- 5) Fonction pour vérifier si un aéroport est exclusivement SIAVI
CREATE OR REPLACE FUNCTION public.is_aeroport_siavi(code TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.aeroports_siavi WHERE code_oaci = code);
END;
$$ LANGUAGE plpgsql STABLE;

-- 6) Fonction pour vérifier si un ATC est en ligne sur un aéroport
CREATE OR REPLACE FUNCTION public.has_atc_online(apt TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.atc_sessions WHERE aeroport = apt);
END;
$$ LANGUAGE plpgsql STABLE;

-- 7) Fonction pour vérifier si un AFIS est en ligne sur un aéroport
CREATE OR REPLACE FUNCTION public.has_afis_online(apt TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.afis_sessions WHERE aeroport = apt AND est_afis = true);
END;
$$ LANGUAGE plpgsql STABLE;

-- 8) Trigger pour gérer la priorité ATC/AFIS
-- Quand un ATC se connecte, les AFIS sur le même aéroport passent en mode pompier
CREATE OR REPLACE FUNCTION public.handle_atc_session_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- Si un ATC se connecte, passer les AFIS du même aéroport en mode pompier
  UPDATE public.afis_sessions
  SET est_afis = FALSE
  WHERE aeroport = NEW.aeroport AND est_afis = TRUE;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS atc_session_insert_afis ON public.atc_sessions;
CREATE TRIGGER atc_session_insert_afis
  AFTER INSERT ON public.atc_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_atc_session_insert();

-- 9) Colonne pour tracker quel AFIS contrôle un vol (optionnel, pour les vols SIAVI)
ALTER TABLE public.plans_vol
  ADD COLUMN IF NOT EXISTS current_afis_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_plans_vol_afis ON public.plans_vol(current_afis_user_id);

COMMENT ON COLUMN public.plans_vol.current_afis_user_id IS 'ID de l''agent AFIS qui surveille le vol (mode SIAVI)';

-- 10) Ajouter support appels urgence à la table atc_calls
ALTER TABLE public.atc_calls
  ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.atc_calls.is_emergency IS 'Indique si l''appel est un appel d''urgence (911/112)';

-- 11) Table des grades SIAVI (comme pour ATC)
CREATE TABLE IF NOT EXISTS public.siavi_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL UNIQUE,
  description TEXT,
  ordre INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insérer les grades par défaut
INSERT INTO public.siavi_grades (nom, description, ordre) VALUES
  ('Stagiaire AFIS', 'Agent AFIS en formation', 10),
  ('Agent AFIS', 'Agent d''Information de Vol', 20),
  ('Chef d''équipe AFIS', 'Responsable d''équipe AFIS', 30),
  ('Chef de brigade SIAVI', 'Responsable de brigade', 40)
ON CONFLICT (nom) DO NOTHING;

-- 12) Ajouter le grade et temps SIAVI aux profils
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS siavi_grade_id UUID REFERENCES public.siavi_grades(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS siavi_temps_total_minutes INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_profiles_siavi_grade ON public.profiles(siavi_grade_id);

COMMENT ON COLUMN public.profiles.siavi_grade_id IS 'Grade SIAVI de l''agent';
COMMENT ON COLUMN public.profiles.siavi_temps_total_minutes IS 'Temps total en service SIAVI (minutes)';

-- 13) RLS pour siavi_grades
ALTER TABLE public.siavi_grades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "siavi_grades_select" ON public.siavi_grades;
CREATE POLICY "siavi_grades_select" ON public.siavi_grades FOR SELECT TO authenticated USING (true);

-- 14) Trigger pour mettre à jour le temps SIAVI quand une session se termine
CREATE OR REPLACE FUNCTION public.update_siavi_temps_total()
RETURNS TRIGGER AS $$
DECLARE
  temps_session INT;
BEGIN
  -- Calculer le temps de la session en minutes
  temps_session := EXTRACT(EPOCH FROM (NOW() - OLD.started_at)) / 60;
  
  -- Mettre à jour le temps total
  UPDATE public.profiles
  SET siavi_temps_total_minutes = COALESCE(siavi_temps_total_minutes, 0) + temps_session
  WHERE id = OLD.user_id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS afis_session_delete_temps ON public.afis_sessions;
CREATE TRIGGER afis_session_delete_temps
  BEFORE DELETE ON public.afis_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_siavi_temps_total();

-- 15) Système de rémunération SIAVI
-- - Pompier seul : 15 000 F$ par appel d'urgence (911/112) répondu
-- - Agent AFIS : Perçoit les taxes aéroportuaires comme les ATC

-- Table pour tracker les appels d'urgence répondus (pour paiement pompiers)
CREATE TABLE IF NOT EXISTS public.siavi_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  call_id UUID REFERENCES public.atc_calls(id) ON DELETE SET NULL,
  aeroport TEXT NOT NULL,
  type_intervention TEXT NOT NULL DEFAULT 'urgence_911', -- urgence_911, urgence_112
  montant INT NOT NULL DEFAULT 15000,
  paid BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_siavi_interventions_user ON public.siavi_interventions(user_id);
CREATE INDEX IF NOT EXISTS idx_siavi_interventions_paid ON public.siavi_interventions(paid);

ALTER TABLE public.siavi_interventions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "siavi_interventions_select" ON public.siavi_interventions;
CREATE POLICY "siavi_interventions_select" ON public.siavi_interventions 
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "siavi_interventions_insert" ON public.siavi_interventions;
CREATE POLICY "siavi_interventions_insert" ON public.siavi_interventions 
  FOR INSERT TO authenticated WITH CHECK (true);

COMMENT ON TABLE public.siavi_interventions IS 'Interventions d''urgence des pompiers SIAVI (15K F$ par appel 911/112 répondu)';

-- 16) Fonction pour payer l'intervention pompier (appelée quand un appel 911/112 est répondu)
CREATE OR REPLACE FUNCTION public.pay_siavi_intervention(
  p_user_id UUID,
  p_call_id UUID,
  p_aeroport TEXT
)
RETURNS VOID AS $$
DECLARE
  v_identifiant TEXT;
  v_compte_id UUID;
BEGIN
  -- Récupérer l'identifiant de l'agent
  SELECT identifiant INTO v_identifiant FROM public.profiles WHERE id = p_user_id;
  
  -- Récupérer le compte Felitz de l'agent
  SELECT id INTO v_compte_id FROM public.felitz_comptes 
  WHERE proprietaire_id = p_user_id AND type = 'personnel';
  
  IF v_compte_id IS NULL THEN
    RETURN; -- Pas de compte, pas de paiement
  END IF;
  
  -- Enregistrer l'intervention
  INSERT INTO public.siavi_interventions (user_id, call_id, aeroport, montant)
  VALUES (p_user_id, p_call_id, p_aeroport, 15000);
  
  -- Créditer le compte
  UPDATE public.felitz_comptes SET solde = solde + 15000 WHERE id = v_compte_id;
  
  -- Enregistrer la transaction
  INSERT INTO public.felitz_transactions (compte_id, type, montant, libelle, description)
  VALUES (v_compte_id, 'credit', 15000, 'Intervention urgence SIAVI', 
          'Prime d''intervention urgence 911/112 - ' || p_aeroport);
  
  -- Envoyer un message/chèque
  INSERT INTO public.messages (
    destinataire_id, titre, contenu, type_message, 
    cheque_montant, cheque_libelle
  ) VALUES (
    p_user_id,
    'Prime d''intervention urgence',
    'Félicitations ! Vous avez répondu à un appel d''urgence (911/112) sur ' || p_aeroport || '. Votre prime de 15 000 F$ a été créditée sur votre compte.',
    'cheque_siavi_intervention',
    15000,
    'Prime intervention urgence SIAVI'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 17) Fonction pour payer les taxes AFIS (appelée quand un vol est clôturé sur un aéroport avec AFIS)
CREATE OR REPLACE FUNCTION public.pay_siavi_taxes(
  p_afis_user_id UUID,
  p_vol_id UUID,
  p_aeroport TEXT,
  p_montant INT
)
RETURNS VOID AS $$
DECLARE
  v_identifiant TEXT;
  v_compte_id UUID;
  v_numero_vol TEXT;
BEGIN
  -- Récupérer l'identifiant de l'agent
  SELECT identifiant INTO v_identifiant FROM public.profiles WHERE id = p_afis_user_id;
  
  -- Récupérer le numéro de vol
  SELECT numero_vol INTO v_numero_vol FROM public.plans_vol WHERE id = p_vol_id;
  
  -- Récupérer le compte Felitz de l'agent
  SELECT id INTO v_compte_id FROM public.felitz_comptes 
  WHERE proprietaire_id = p_afis_user_id AND type = 'personnel';
  
  IF v_compte_id IS NULL OR p_montant <= 0 THEN
    RETURN;
  END IF;
  
  -- Créditer le compte
  UPDATE public.felitz_comptes SET solde = solde + p_montant WHERE id = v_compte_id;
  
  -- Enregistrer la transaction
  INSERT INTO public.felitz_transactions (compte_id, type, montant, libelle, description)
  VALUES (v_compte_id, 'credit', p_montant, 'Taxes aéroportuaires AFIS', 
          'Taxes vol ' || COALESCE(v_numero_vol, 'N/A') || ' - ' || p_aeroport);
  
  -- Envoyer un message/chèque
  INSERT INTO public.messages (
    destinataire_id, titre, contenu, type_message, 
    cheque_montant, cheque_libelle, cheque_numero_vol
  ) VALUES (
    p_afis_user_id,
    'Chèque taxes aéroportuaires AFIS',
    'En tant qu''agent AFIS de service sur ' || p_aeroport || ', vous percevez les taxes aéroportuaires du vol ' || COALESCE(v_numero_vol, 'N/A') || '.',
    'cheque_siavi_taxes',
    p_montant,
    'Taxes aéroportuaires AFIS',
    v_numero_vol
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 18) Message de confirmation
DO $$ BEGIN RAISE NOTICE '✅ Système SIAVI ajouté avec succès!'; END $$;
