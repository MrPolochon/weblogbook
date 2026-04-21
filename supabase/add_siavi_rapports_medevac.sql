-- ============================================================
-- RAPPORTS DE VOL MEDEVAC
-- Système de rapports post-mission, numérotation séquentielle
-- ============================================================

-- 1) Table des rapports MEDEVAC
CREATE TABLE IF NOT EXISTS public.siavi_rapports_medevac (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Numéro de mission séquentiel (ex: 1, 2, 3...)
  numero_mission SERIAL UNIQUE,
  -- Référence au plan de vol
  plan_vol_id UUID NOT NULL REFERENCES public.plans_vol(id) ON DELETE CASCADE,
  -- 1. Informations générales (auto-remplies)
  date_mission DATE NOT NULL DEFAULT CURRENT_DATE,
  operator_base TEXT NOT NULL,
  aircraft_registration TEXT NOT NULL,
  -- 2. Informations aéronef (auto-remplies)
  aircraft_type TEXT NOT NULL,
  aircraft_role TEXT NOT NULL DEFAULT 'Medical transport configuration',
  -- 3. Équipage
  commander TEXT NOT NULL,
  co_pilot TEXT,
  medical_team TEXT,
  -- 4. Chronologie de la mission (JSONB : [{heure: "19:30", description: "..."}])
  mission_timeline JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- 5. Résumé médical
  medical_summary TEXT NOT NULL,
  -- 6. Événements au sol (optionnel)
  ground_event TEXT,
  -- 7. Issue / résultat
  outcome TEXT NOT NULL,
  -- 8. Remarques sécurité & opérationnelles
  safety_remarks TEXT,
  -- Métadonnées
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Contrainte : un seul rapport par plan de vol
  UNIQUE(plan_vol_id)
);

CREATE INDEX IF NOT EXISTS idx_siavi_rapports_mission ON public.siavi_rapports_medevac(numero_mission);
CREATE INDEX IF NOT EXISTS idx_siavi_rapports_plan ON public.siavi_rapports_medevac(plan_vol_id);
CREATE INDEX IF NOT EXISTS idx_siavi_rapports_date ON public.siavi_rapports_medevac(date_mission DESC);

ALTER TABLE public.siavi_rapports_medevac ENABLE ROW LEVEL SECURITY;

-- Lecture : admin, IFSA, ou agents SIAVI
DROP POLICY IF EXISTS "siavi_rapports_select" ON public.siavi_rapports_medevac;
CREATE POLICY "siavi_rapports_select" ON public.siavi_rapports_medevac
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role = 'admin' OR p.siavi = TRUE OR p.role = 'siavi' OR p.ifsa = TRUE)
    )
  );

-- Insertion : agents SIAVI authentifiés
DROP POLICY IF EXISTS "siavi_rapports_insert" ON public.siavi_rapports_medevac;
CREATE POLICY "siavi_rapports_insert" ON public.siavi_rapports_medevac
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

DO $$ BEGIN RAISE NOTICE 'Table siavi_rapports_medevac créée avec succès'; END $$;
