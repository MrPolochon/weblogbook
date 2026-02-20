-- ============================================================
-- SYSTÈME ALLIANCES
-- Une PDG crée une alliance (sa compagnie = tête). Elle peut
-- ajouter d'autres compagnies comme dirigeants. Les autres sont membres.
-- Dirigeants: activer/désactiver options, compte Felitz alliance, taxes, etc.
-- Tout le monde peut quitter. Seuls les dirigeants peuvent ajouter.
-- ============================================================

-- ----- 1) Table alliances -----
CREATE TABLE IF NOT EXISTS public.alliances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alliances_created_by ON public.alliances(created_by_compagnie_id);

-- ----- 2) Table alliance_membres (qui est dans l'alliance, dirigeant ou membre) -----
CREATE TABLE IF NOT EXISTS public.alliance_membres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id UUID NOT NULL REFERENCES public.alliances(id) ON DELETE CASCADE,
  compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('dirigeant', 'membre')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(alliance_id, compagnie_id)
);

CREATE INDEX IF NOT EXISTS idx_alliance_membres_alliance ON public.alliance_membres(alliance_id);
CREATE INDEX IF NOT EXISTS idx_alliance_membres_compagnie ON public.alliance_membres(compagnie_id);

-- ----- 3) Paramètres de l'alliance (toggles + %) -----
CREATE TABLE IF NOT EXISTS public.alliance_parametres (
  alliance_id UUID PRIMARY KEY REFERENCES public.alliances(id) ON DELETE CASCADE,
  actif_vente_avions_entre_membres BOOLEAN NOT NULL DEFAULT false,
  actif_don_avions BOOLEAN NOT NULL DEFAULT false,
  actif_pret_avions BOOLEAN NOT NULL DEFAULT false,
  actif_avions_membres BOOLEAN NOT NULL DEFAULT false,
  actif_codeshare BOOLEAN NOT NULL DEFAULT false,
  actif_compte_alliance BOOLEAN NOT NULL DEFAULT false,
  actif_taxes_alliance BOOLEAN NOT NULL DEFAULT false,
  codeshare_pourcent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (codeshare_pourcent >= 0 AND codeshare_pourcent <= 100),
  taxe_alliance_pourcent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (taxe_alliance_pourcent >= 0 AND taxe_alliance_pourcent <= 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----- 4) Colonne compagnie → alliance (optionnel, pour affichage rapide) -----
ALTER TABLE public.compagnies
  ADD COLUMN IF NOT EXISTS alliance_id UUID REFERENCES public.alliances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_compagnies_alliance ON public.compagnies(alliance_id);

-- ----- 5) Compte Felitz pour une alliance -----
-- Étendre felitz_comptes : type 'alliance' + alliance_id
ALTER TABLE public.felitz_comptes
  ADD COLUMN IF NOT EXISTS alliance_id UUID REFERENCES public.alliances(id) ON DELETE CASCADE;

-- Supprimer l'ancienne contrainte si elle existe (pour ajouter 'alliance')
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.constraint_column_usage WHERE constraint_name = 'felitz_comptes_type_check') THEN
    ALTER TABLE public.felitz_comptes DROP CONSTRAINT felitz_comptes_type_check;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'felitz_comptes_type_check') THEN
    ALTER TABLE public.felitz_comptes DROP CONSTRAINT felitz_comptes_type_check;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE public.felitz_comptes ADD CONSTRAINT felitz_comptes_type_check
  CHECK (type IN ('personnel', 'entreprise', 'militaire', 'alliance'));

-- Contrainte : alliance => alliance_id non null, autres null
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'felitz_comptes_alliance_check') THEN
    ALTER TABLE public.felitz_comptes ADD CONSTRAINT felitz_comptes_alliance_check
      CHECK (
        (type = 'alliance' AND alliance_id IS NOT NULL AND proprietaire_id IS NULL AND compagnie_id IS NULL) OR
        (type != 'alliance' AND alliance_id IS NULL)
      );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_felitz_comptes_alliance ON public.felitz_comptes(alliance_id);

-- ----- 6) Avion "bloqué" pour une compagnie membre (dirigeant prête un avion, X vols, 50% revenue) -----
CREATE TABLE IF NOT EXISTS public.alliance_avions_membres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id UUID NOT NULL REFERENCES public.alliances(id) ON DELETE CASCADE,
  compagnie_proprio_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  compagnie_beneficiaire_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  compagnie_avion_id UUID NOT NULL REFERENCES public.compagnie_avions(id) ON DELETE CASCADE,
  vols_autorises INTEGER NOT NULL CHECK (vols_autorises > 0),
  vols_effectues INTEGER NOT NULL DEFAULT 0 CHECK (vols_effectues >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alliance_avions_membres_alliance ON public.alliance_avions_membres(alliance_id);
CREATE INDEX IF NOT EXISTS idx_alliance_avions_membres_beneficiaire ON public.alliance_avions_membres(compagnie_beneficiaire_id);
CREATE INDEX IF NOT EXISTS idx_alliance_avions_membres_avion ON public.alliance_avions_membres(compagnie_avion_id);

-- ----- 7) Demandes de fonds au compte alliance (n'importe qui peut demander, dirigeants approuvent) -----
CREATE TABLE IF NOT EXISTS public.alliance_demandes_fonds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id UUID NOT NULL REFERENCES public.alliances(id) ON DELETE CASCADE,
  demandeur_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  destinataire_vban TEXT NOT NULL,
  montant INTEGER NOT NULL CHECK (montant > 0),
  libelle TEXT,
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'acceptee', 'refusee')),
  traite_par UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  traite_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alliance_demandes_fonds_alliance ON public.alliance_demandes_fonds(alliance_id);
CREATE INDEX IF NOT EXISTS idx_alliance_demandes_fonds_demandeur ON public.alliance_demandes_fonds(demandeur_id);

-- ----- 8) Transfert d'avion entre membres de l'alliance (vente / don / prêt) -----
CREATE TABLE IF NOT EXISTS public.alliance_transferts_avions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id UUID NOT NULL REFERENCES public.alliances(id) ON DELETE CASCADE,
  type_transfert TEXT NOT NULL CHECK (type_transfert IN ('vente', 'don', 'pret')),
  compagnie_avion_id UUID NOT NULL REFERENCES public.compagnie_avions(id) ON DELETE CASCADE,
  from_compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  to_compagnie_id UUID NOT NULL REFERENCES public.compagnies(id) ON DELETE CASCADE,
  montant INTEGER CHECK (montant IS NULL OR (type_transfert = 'vente' AND montant >= 0)),
  date_retour_prevue TIMESTAMPTZ,
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'accepte', 'refuse', 'termine')),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  traite_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alliance_transferts_alliance ON public.alliance_transferts_avions(alliance_id);

-- ----- 9) RLS -----
ALTER TABLE public.alliances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alliance_membres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alliance_parametres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alliance_avions_membres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alliance_demandes_fonds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alliance_transferts_avions ENABLE ROW LEVEL SECURITY;

-- Alliances : voir si ma compagnie est membre
CREATE POLICY "alliances_select_member" ON public.alliances FOR SELECT TO authenticated
  USING (
    id IN (SELECT alliance_id FROM public.alliance_membres am WHERE am.compagnie_id IN (
      SELECT id FROM public.compagnies WHERE pdg_id = auth.uid()
      UNION
      SELECT compagnie_id FROM public.compagnie_employes WHERE pilote_id = auth.uid()
    ))
  );
CREATE POLICY "alliances_insert_pdg" ON public.alliances FOR INSERT TO authenticated
  WITH CHECK (created_by_compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid()));
CREATE POLICY "alliances_update_admin" ON public.alliances FOR UPDATE TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- Alliance_membres : voir si dans mon alliance, modifier si dirigeant
CREATE POLICY "alliance_membres_select" ON public.alliance_membres FOR SELECT TO authenticated
  USING (alliance_id IN (SELECT alliance_id FROM public.alliance_membres WHERE compagnie_id IN (
    SELECT id FROM public.compagnies WHERE pdg_id = auth.uid()
    UNION SELECT compagnie_id FROM public.compagnie_employes WHERE pilote_id = auth.uid()
  )));
CREATE POLICY "alliance_membres_insert_dirigeant" ON public.alliance_membres FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.alliance_membres am2 WHERE am2.alliance_id = alliance_id AND am2.compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid()) AND am2.role = 'dirigeant')
  );
CREATE POLICY "alliance_membres_delete_self" ON public.alliance_membres FOR DELETE TO authenticated
  USING (compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid()));

-- Paramètres : dirigeants seulement pour update
CREATE POLICY "alliance_parametres_select" ON public.alliance_parametres FOR SELECT TO authenticated
  USING (alliance_id IN (SELECT alliance_id FROM public.alliance_membres WHERE compagnie_id IN (
    SELECT id FROM public.compagnies WHERE pdg_id = auth.uid()
    UNION SELECT compagnie_id FROM public.compagnie_employes WHERE pilote_id = auth.uid()
  )));
CREATE POLICY "alliance_parametres_insert" ON public.alliance_parametres FOR INSERT TO authenticated
  WITH CHECK (alliance_id IN (SELECT id FROM public.alliances WHERE created_by_compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid())));
CREATE POLICY "alliance_parametres_update_dirigeant" ON public.alliance_parametres FOR UPDATE TO authenticated
  USING (alliance_id IN (SELECT alliance_id FROM public.alliance_membres WHERE compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid()) AND role = 'dirigeant'));

-- Alliance_avions_membres
CREATE POLICY "alliance_avions_membres_select" ON public.alliance_avions_membres FOR SELECT TO authenticated
  USING (alliance_id IN (SELECT alliance_id FROM public.alliance_membres WHERE compagnie_id IN (
    SELECT id FROM public.compagnies WHERE pdg_id = auth.uid()
    UNION SELECT compagnie_id FROM public.compagnie_employes WHERE pilote_id = auth.uid()
  )));
CREATE POLICY "alliance_avions_membres_insert_dirigeant" ON public.alliance_avions_membres FOR INSERT TO authenticated
  WITH CHECK (compagnie_proprio_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid()) AND alliance_id IN (SELECT alliance_id FROM public.alliance_membres WHERE compagnie_id = compagnie_proprio_id AND role = 'dirigeant'));

-- Alliance_demandes_fonds
CREATE POLICY "alliance_demandes_fonds_select" ON public.alliance_demandes_fonds FOR SELECT TO authenticated
  USING (alliance_id IN (SELECT alliance_id FROM public.alliance_membres WHERE compagnie_id IN (
    SELECT id FROM public.compagnies WHERE pdg_id = auth.uid()
    UNION SELECT compagnie_id FROM public.compagnie_employes WHERE pilote_id = auth.uid()
  )));
CREATE POLICY "alliance_demandes_fonds_insert" ON public.alliance_demandes_fonds FOR INSERT TO authenticated
  WITH CHECK (demandeur_id = auth.uid() AND alliance_id IN (SELECT alliance_id FROM public.alliance_membres WHERE compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid() UNION SELECT compagnie_id FROM public.compagnie_employes WHERE pilote_id = auth.uid())));

-- Alliance_transferts_avions
CREATE POLICY "alliance_transferts_select" ON public.alliance_transferts_avions FOR SELECT TO authenticated
  USING (alliance_id IN (SELECT alliance_id FROM public.alliance_membres WHERE compagnie_id IN (
    SELECT id FROM public.compagnies WHERE pdg_id = auth.uid()
    UNION SELECT compagnie_id FROM public.compagnie_employes WHERE pilote_id = auth.uid()
  )));
-- Vente / don / prêt d'avions : tout membre de l'alliance (dirigeant ou membre) peut initier
CREATE POLICY "alliance_transferts_insert_membre" ON public.alliance_transferts_avions FOR INSERT TO authenticated
  WITH CHECK (from_compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid()) AND alliance_id IN (SELECT alliance_id FROM public.alliance_membres WHERE compagnie_id = from_compagnie_id));

-- ----- 10) Compte Felitz alliance : politique SELECT pour dirigeants -----
DROP POLICY IF EXISTS "fc_select_pdg" ON public.felitz_comptes;
DROP POLICY IF EXISTS "felitz_comptes_select_self" ON public.felitz_comptes;
DROP POLICY IF EXISTS "felitz_comptes_select_pdg" ON public.felitz_comptes;
CREATE POLICY "felitz_comptes_select_own" ON public.felitz_comptes FOR SELECT TO authenticated
  USING (proprietaire_id = auth.uid());
CREATE POLICY "felitz_comptes_select_entreprise" ON public.felitz_comptes FOR SELECT TO authenticated
  USING (type = 'entreprise' AND compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid()));
CREATE POLICY "felitz_comptes_select_alliance" ON public.felitz_comptes FOR SELECT TO authenticated
  USING (type = 'alliance' AND alliance_id IN (
    SELECT alliance_id FROM public.alliance_membres WHERE compagnie_id IN (SELECT id FROM public.compagnies WHERE pdg_id = auth.uid()) AND role = 'dirigeant'
  ));
CREATE POLICY "felitz_comptes_admin" ON public.felitz_comptes FOR ALL TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ----- 11) Fonction : créer une alliance (PDG) + premier dirigeant + paramètres + compte Felitz -----
CREATE OR REPLACE FUNCTION public.alliance_creer(
  p_nom TEXT,
  p_compagnie_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pdg_id UUID;
  v_alliance_id UUID;
  v_vban TEXT;
BEGIN
  IF p_nom IS NULL OR trim(p_nom) = '' THEN
    RAISE EXCEPTION 'Le nom de l''alliance est requis';
  END IF;
  SELECT pdg_id INTO v_pdg_id FROM public.compagnies WHERE id = p_compagnie_id;
  IF v_pdg_id IS NULL OR v_pdg_id != auth.uid() THEN
    RAISE EXCEPTION 'Seul le PDG de la compagnie peut créer une alliance';
  END IF;
  IF EXISTS (SELECT 1 FROM public.alliance_membres WHERE compagnie_id = p_compagnie_id) THEN
    RAISE EXCEPTION 'Cette compagnie fait déjà partie d''une alliance';
  END IF;

  INSERT INTO public.alliances (nom, created_by_compagnie_id) VALUES (trim(p_nom), p_compagnie_id) RETURNING id INTO v_alliance_id;
  INSERT INTO public.alliance_membres (alliance_id, compagnie_id, role) VALUES (v_alliance_id, p_compagnie_id, 'dirigeant');
  INSERT INTO public.alliance_parametres (alliance_id) VALUES (v_alliance_id);
  UPDATE public.compagnies SET alliance_id = v_alliance_id WHERE id = p_compagnie_id;

  LOOP
    v_vban := 'AL' || substr(md5(random()::text), 1, 6);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.felitz_comptes WHERE vban = v_vban) AND NOT EXISTS (SELECT 1 FROM public.compagnies WHERE vban = v_vban);
  END LOOP;
  INSERT INTO public.felitz_comptes (type, alliance_id, vban, solde) VALUES ('alliance', v_alliance_id, v_vban, 0);

  RETURN v_alliance_id;
END;
$$;

-- ----- 12) Fonction : quitter l'alliance -----
CREATE OR REPLACE FUNCTION public.alliance_quitter(p_compagnie_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alliance_id UUID;
  v_dirigeants_restants INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.compagnies WHERE id = p_compagnie_id AND pdg_id = auth.uid()) THEN
    RAISE EXCEPTION 'Seul le PDG peut faire quitter la compagnie de l''alliance';
  END IF;
  SELECT alliance_id INTO v_alliance_id FROM public.alliance_membres WHERE compagnie_id = p_compagnie_id;
  IF v_alliance_id IS NULL THEN
    RAISE EXCEPTION 'Cette compagnie n''est dans aucune alliance';
  END IF;

  DELETE FROM public.alliance_membres WHERE alliance_id = v_alliance_id AND compagnie_id = p_compagnie_id;
  UPDATE public.compagnies SET alliance_id = NULL WHERE id = p_compagnie_id;

  SELECT count(*) INTO v_dirigeants_restants FROM public.alliance_membres WHERE alliance_id = v_alliance_id AND role = 'dirigeant';
  IF v_dirigeants_restants = 0 THEN
    DELETE FROM public.alliances WHERE id = v_alliance_id;
  END IF;
END;
$$;

-- ----- 13) Commentaires -----
COMMENT ON TABLE public.alliances IS 'Alliances entre compagnies : un PDG crée, sa compagnie est tête (dirigeant).';
COMMENT ON TABLE public.alliance_membres IS 'Membres d''une alliance : role dirigeant (tête) ou membre.';
COMMENT ON TABLE public.alliance_parametres IS 'Paramètres et toggles de l''alliance (activables par les dirigeants).';
COMMENT ON TABLE public.alliance_avions_membres IS 'Avion d''un dirigeant prêté à une compagnie membre : X vols, 50% revenue partagé.';
COMMENT ON TABLE public.alliance_demandes_fonds IS 'Demandes de versement depuis le compte alliance vers un VBAN.';
COMMENT ON TABLE public.alliance_transferts_avions IS 'Vente / don / prêt d''avion entre tous les membres de l''alliance.';
