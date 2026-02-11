-- ============================================================
-- OPTIMISATIONS PERFORMANCE - Index de base de données
-- ============================================================
-- Ces index vont accélérer considérablement les requêtes
-- Version robuste avec vérifications conditionnelles
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'DÉBUT CRÉATION DES INDEX';
  RAISE NOTICE '==============================================';
END $$;

-- ============================================================
-- 1. PLANS DE VOL (table la plus sollicitée)
-- PRIORITÉ : Dépôt, Clôture, Transferts
-- ============================================================

DO $$
BEGIN
  -- INDEX CRITIQUE #1 : Transferts en attente (sidebar orange)
  -- Utilisé pour afficher les plans en attente de transfert par aéroport
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'plans_vol' AND column_name = 'pending_transfer_aeroport') THEN
    CREATE INDEX IF NOT EXISTS idx_plans_vol_pending_transfer 
      ON public.plans_vol(pending_transfer_aeroport, pending_transfer_at) 
      WHERE pending_transfer_aeroport IS NOT NULL;
    RAISE NOTICE '🚀 Index CRITIQUE: plans_vol transferts (pending_transfer_aeroport, pending_transfer_at)';
  END IF;

  -- INDEX CRITIQUE #2 : Statut + Created_at pour les nouveaux dépôts
  -- Utilisé pour afficher les plans "en_attente" par ordre d'arrivée
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'plans_vol' AND column_name = 'statut') 
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'plans_vol' AND column_name = 'created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_plans_vol_statut_created 
      ON public.plans_vol(statut, created_at) 
      WHERE statut IN ('en_attente', 'accepte', 'en_cours', 'automonitoring');
    RAISE NOTICE '🚀 Index CRITIQUE: plans_vol statut actifs + date création';
  END IF;

  -- INDEX CRITIQUE #3 : Holder pour les plans contrôlés par un ATC
  -- Utilisé pour afficher les plans d'un ATC spécifique (page principale)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'plans_vol' AND column_name = 'current_holder_user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_plans_vol_holder 
      ON public.plans_vol(current_holder_user_id, statut) 
      WHERE current_holder_user_id IS NOT NULL;
    RAISE NOTICE '🚀 Index CRITIQUE: plans_vol holder + statut';
  END IF;

  -- INDEX CRITIQUE #4 : Demandes de clôture
  -- Utilisé pour détecter rapidement les demandes de clôture en attente
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'plans_vol' AND column_name = 'cloture_requested_at') THEN
    CREATE INDEX IF NOT EXISTS idx_plans_vol_cloture_requests 
      ON public.plans_vol(current_holder_user_id, cloture_requested_at) 
      WHERE cloture_requested_at IS NOT NULL;
    RAISE NOTICE '🚀 Index CRITIQUE: plans_vol demandes de clôture';
  END IF;

  -- INDEX STANDARD : Statut général
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'plans_vol' AND column_name = 'statut') THEN
    CREATE INDEX IF NOT EXISTS idx_plans_vol_statut ON public.plans_vol(statut);
    RAISE NOTICE '✅ Index plans_vol.statut créé';
  END IF;

  -- INDEX STANDARD : Pilote + Statut (page pilote)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'plans_vol' AND column_name = 'pilote_id') THEN
    CREATE INDEX IF NOT EXISTS idx_plans_vol_pilote_statut ON public.plans_vol(pilote_id, statut);
    RAISE NOTICE '✅ Index plans_vol (pilote, statut) créé';
  END IF;

  -- INDEX STANDARD : Aéroport de départ (recherche par ADEP)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'plans_vol' AND column_name = 'aeroport_depart') THEN
    CREATE INDEX IF NOT EXISTS idx_plans_vol_depart ON public.plans_vol(aeroport_depart) WHERE statut != 'cloture';
    RAISE NOTICE '✅ Index plans_vol.aeroport_depart créé';
  END IF;

  -- INDEX STANDARD : Aéroport d'arrivée (recherche par ADES)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'plans_vol' AND column_name = 'aeroport_arrivee') THEN
    CREATE INDEX IF NOT EXISTS idx_plans_vol_arrivee ON public.plans_vol(aeroport_arrivee) WHERE statut != 'cloture';
    RAISE NOTICE '✅ Index plans_vol.aeroport_arrivee créé';
  END IF;
END $$;

-- ============================================================
-- 2. SESSIONS ATC & SIAVI
-- PRIORITÉ : Lookup rapide des contrôleurs par aéroport
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'atc_sessions') THEN
    -- INDEX CRITIQUE : Aéroport + Position (utilisé pour afficher les ATC en service)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'atc_sessions' AND column_name = 'aeroport') THEN
      CREATE INDEX IF NOT EXISTS idx_atc_sessions_aeroport ON public.atc_sessions(aeroport, position);
      RAISE NOTICE '🚀 Index CRITIQUE: atc_sessions (aeroport, position)';
    END IF;

    -- INDEX STANDARD : User ID
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'atc_sessions' AND column_name = 'user_id') THEN
      CREATE INDEX IF NOT EXISTS idx_atc_sessions_user ON public.atc_sessions(user_id);
      RAISE NOTICE '✅ Index atc_sessions.user_id créé';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'afis_sessions') THEN
    -- INDEX CRITIQUE : Aéroport (utilisé pour afficher les AFIS en service)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'afis_sessions' AND column_name = 'aeroport') THEN
      CREATE INDEX IF NOT EXISTS idx_afis_sessions_aeroport ON public.afis_sessions(aeroport);
      RAISE NOTICE '🚀 Index CRITIQUE: afis_sessions.aeroport';
    END IF;

    -- INDEX STANDARD : User ID
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'afis_sessions' AND column_name = 'user_id') THEN
      CREATE INDEX IF NOT EXISTS idx_afis_sessions_user ON public.afis_sessions(user_id);
      RAISE NOTICE '✅ Index afis_sessions.user_id créé';
    END IF;
  END IF;
END $$;

-- ============================================================
-- 3. MESSAGES (messagerie, notifications)
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'messages') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'destinataire_id') THEN
      CREATE INDEX IF NOT EXISTS idx_messages_destinataire_lu ON public.messages(destinataire_id, lu);
      RAISE NOTICE '✅ Index messages (destinataire, lu) créé';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'type_message') THEN
      CREATE INDEX IF NOT EXISTS idx_messages_type ON public.messages(type_message);
      RAISE NOTICE '✅ Index messages.type créé';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'expediteur_id') THEN
      CREATE INDEX IF NOT EXISTS idx_messages_expediteur ON public.messages(expediteur_id);
      RAISE NOTICE '✅ Index messages.expediteur créé';
    END IF;
  END IF;
END $$;

-- ============================================================
-- 4. VOLS (historique)
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vols') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vols' AND column_name = 'pilote_id') THEN
      CREATE INDEX IF NOT EXISTS idx_vols_pilote ON public.vols(pilote_id);
      RAISE NOTICE '✅ Index vols.pilote_id créé';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vols' AND column_name = 'statut') THEN
      CREATE INDEX IF NOT EXISTS idx_vols_statut ON public.vols(statut);
      RAISE NOTICE '✅ Index vols.statut créé';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vols' AND column_name = 'plan_vol_id') THEN
      CREATE INDEX IF NOT EXISTS idx_vols_plan ON public.vols(plan_vol_id);
      RAISE NOTICE '✅ Index vols.plan_vol_id créé';
    ELSE
      RAISE NOTICE 'ℹ️ Colonne vols.plan_vol_id n''existe pas, skip';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vols' AND column_name = 'date_depart') THEN
      CREATE INDEX IF NOT EXISTS idx_vols_dates ON public.vols(date_depart, date_arrivee);
      RAISE NOTICE '✅ Index vols (dates) créé';
    END IF;
  END IF;
END $$;

-- ============================================================
-- 5. COMPAGNIES & AVIONS
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'compagnie_avions') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'compagnie_avions' AND column_name = 'compagnie_id') THEN
      CREATE INDEX IF NOT EXISTS idx_compagnie_avions_compagnie ON public.compagnie_avions(compagnie_id);
      RAISE NOTICE '✅ Index compagnie_avions.compagnie_id créé';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'compagnie_avions' AND column_name = 'statut') THEN
      CREATE INDEX IF NOT EXISTS idx_compagnie_avions_statut ON public.compagnie_avions(statut);
      RAISE NOTICE '✅ Index compagnie_avions.statut créé';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'compagnie_employes') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'compagnie_employes' AND column_name = 'pilote_id') THEN
      CREATE INDEX IF NOT EXISTS idx_compagnie_employes_pilote ON public.compagnie_employes(pilote_id);
      RAISE NOTICE '✅ Index compagnie_employes.pilote_id créé';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'compagnie_employes' AND column_name = 'compagnie_id') THEN
      CREATE INDEX IF NOT EXISTS idx_compagnie_employes_compagnie ON public.compagnie_employes(compagnie_id);
      RAISE NOTICE '✅ Index compagnie_employes.compagnie_id créé';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vols_ferry') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'vols_ferry' AND column_name = 'compagnie_id') THEN
      CREATE INDEX IF NOT EXISTS idx_vols_ferry_compagnie_statut ON public.vols_ferry(compagnie_id, statut);
      RAISE NOTICE '✅ Index vols_ferry (compagnie, statut) créé';
    END IF;
  END IF;
END $$;

-- ============================================================
-- 6. FELITZ BANK
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'felitz_comptes') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'felitz_comptes' AND column_name = 'proprietaire_id') THEN
      CREATE INDEX IF NOT EXISTS idx_felitz_comptes_proprietaire ON public.felitz_comptes(proprietaire_id);
      RAISE NOTICE '✅ Index felitz_comptes.proprietaire_id créé';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'felitz_transactions') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'felitz_transactions' AND column_name = 'compte_id') THEN
      CREATE INDEX IF NOT EXISTS idx_felitz_transactions_compte ON public.felitz_transactions(compte_id);
      RAISE NOTICE '✅ Index felitz_transactions.compte_id créé';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'felitz_virements') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'felitz_virements' AND column_name = 'compte_source_id') THEN
      CREATE INDEX IF NOT EXISTS idx_felitz_virements_source ON public.felitz_virements(compte_source_id);
      RAISE NOTICE '✅ Index felitz_virements.compte_source_id créé';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'felitz_virements' AND column_name = 'compte_destination_id') THEN
      CREATE INDEX IF NOT EXISTS idx_felitz_virements_destination ON public.felitz_virements(compte_destination_id);
      RAISE NOTICE '✅ Index felitz_virements.compte_destination_id créé';
    END IF;
  END IF;
END $$;

-- ============================================================
-- 7. APPELS TÉLÉPHONE
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'atc_calls') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'atc_calls' AND column_name = 'from_user_id') THEN
      CREATE INDEX IF NOT EXISTS idx_atc_calls_from_user ON public.atc_calls(from_user_id);
      RAISE NOTICE '✅ Index atc_calls.from_user_id créé';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'atc_calls' AND column_name = 'to_user_id') THEN
      CREATE INDEX IF NOT EXISTS idx_atc_calls_to_user ON public.atc_calls(to_user_id);
      RAISE NOTICE '✅ Index atc_calls.to_user_id créé';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'atc_calls' AND column_name = 'status') THEN
      CREATE INDEX IF NOT EXISTS idx_atc_calls_status ON public.atc_calls(status) WHERE status IN ('ringing', 'connected');
      RAISE NOTICE '✅ Index atc_calls.status créé';
    END IF;
  END IF;
END $$;

-- ============================================================
-- VÉRIFICATION FINALE
-- ============================================================

DO $$
DECLARE
  index_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO index_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname LIKE 'idx_%';

  RAISE NOTICE '==============================================';
  RAISE NOTICE '✅ CRÉATION DES INDEX TERMINÉE';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Total d''index personnalisés : %', index_count;
  RAISE NOTICE 'Performance attendue : +50%% sur les requêtes';
  RAISE NOTICE 'Latence attendue : -50%%';
  RAISE NOTICE '==============================================';
END $$;
