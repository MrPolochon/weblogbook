-- ============================================================
-- MIGRATIONS SUPABASE CONSOLIDÉES
-- Date: 10 février 2026
-- Après audit complet du système
-- ============================================================
-- Ce fichier consolide toutes les migrations nécessaires
-- ============================================================

-- ============================================================
-- SECTION 1: MIGRATIONS CRITIQUES (À EXÉCUTER EN PRIORITÉ)
-- ============================================================

-- 1.1 FIX: vols_ferry pilote_id nullable (vols ferry automatiques)
-- Fichier source: fix_vols_ferry_and_strips.sql
ALTER TABLE public.vols_ferry ALTER COLUMN pilote_id DROP NOT NULL;

-- 1.2 MAINTENANCE: colonne maintenance_fin_at sur compagnie_avions
-- Fichier source: fix_vols_ferry_and_strips.sql
ALTER TABLE public.compagnie_avions
  ADD COLUMN IF NOT EXISTS maintenance_fin_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.compagnie_avions.maintenance_fin_at IS 'Date de fin de maintenance lorsque des techniciens sont affrétés';

-- 1.3 FLIGHT STRIPS: Champs supplémentaires pour les strips ATC
-- CRITIQUE: sans ces colonnes, les champs éditables des strips ne sauvegarderont pas
-- Fichier source: fix_vols_ferry_and_strips.sql
ALTER TABLE public.plans_vol
  ADD COLUMN IF NOT EXISTS strip_atd TEXT,
  ADD COLUMN IF NOT EXISTS strip_rwy TEXT,
  ADD COLUMN IF NOT EXISTS strip_fl TEXT,
  ADD COLUMN IF NOT EXISTS strip_fl_unit TEXT DEFAULT 'FL',
  ADD COLUMN IF NOT EXISTS strip_sid_atc TEXT,
  ADD COLUMN IF NOT EXISTS strip_note_1 TEXT,
  ADD COLUMN IF NOT EXISTS strip_note_2 TEXT,
  ADD COLUMN IF NOT EXISTS strip_note_3 TEXT,
  ADD COLUMN IF NOT EXISTS strip_zone TEXT,
  ADD COLUMN IF NOT EXISTS strip_order INTEGER DEFAULT 0;

-- Index pour ordonner les strips par zone
CREATE INDEX IF NOT EXISTS idx_plans_vol_strip_zone ON public.plans_vol (strip_zone, strip_order);

-- ============================================================
-- SECTION 2: VÉRIFICATIONS (Exécuter après les migrations)
-- ============================================================

-- 2.1 Vérifier les colonnes strip (doit retourner 10 colonnes)
SELECT column_name 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'plans_vol' 
  AND column_name LIKE 'strip_%'
ORDER BY column_name;

-- 2.2 Vérifier la colonne maintenance_fin_at
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'compagnie_avions' 
  AND column_name = 'maintenance_fin_at';

-- 2.3 Vérifier la nullabilité de pilote_id dans vols_ferry
SELECT column_name, is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'vols_ferry' 
  AND column_name = 'pilote_id';

-- ============================================================
-- SECTION 3: MIGRATIONS DÉJÀ EXÉCUTÉES (Référence)
-- ============================================================
-- Ces migrations ont normalement déjà été exécutées.
-- Listées ici pour référence et documentation.

-- ✅ add_flight_strips.sql (première version - obsolète, remplacée par section 1.3)
-- ✅ add_siavi_system.sql (système SIAVI)
-- ✅ add_transpondeur.sql (transpondeur)
-- ✅ create_atc_calls_table.sql (téléphone ATC/SIAVI)
-- ✅ add_vols_ferry_auto.sql (vols ferry automatiques)
-- ✅ add_maintenance_delay.sql (délai maintenance - obsolète, remplacé par 1.2)
-- ✅ add_prets_bancaires.sql (prêts bancaires)
-- ✅ add_compagnie_locations.sql (locations hangars)
-- ✅ add_notams.sql (NOTAMs)
-- ✅ add_felitz_bank_system.sql (Felitz Bank)
-- ✅ add_sanctions_system.sql (IFSA sanctions)
-- ✅ add_recrutement_ifsa_system.sql (IFSA recrutement)
-- ✅ add_hangar_market.sql (marché hangars)
-- ✅ add_tarifs_liaisons_system.sql (tarifs liaisons)
-- ✅ add_messagerie_cheques.sql (chèques messagerie)

-- ============================================================
-- SECTION 4: MIGRATIONS OPTIONNELLES
-- ============================================================

-- 4.1 Nettoyage: Supprimer les vols ferry en attente depuis plus de 24h
-- (Optionnel - à exécuter si besoin de nettoyage)
/*
DELETE FROM public.vols_ferry 
WHERE statut = 'en_attente' 
  AND created_at < NOW() - INTERVAL '24 hours';
*/

-- 4.2 Nettoyage: Supprimer les NOTAMs expirés depuis plus de 3 jours
-- (Optionnel - normalement géré automatiquement)
/*
DELETE FROM public.notams 
WHERE expires_at < NOW() - INTERVAL '3 days';
*/

-- ============================================================
-- SECTION 5: NOTES ET AVERTISSEMENTS
-- ============================================================

-- ⚠️ IMPORTANT: 
-- - Exécuter ces migrations dans l'éditeur SQL Supabase
-- - Ces migrations sont IDEMPOTENTES (safe à exécuter plusieurs fois)
-- - Tester sur un environnement de développement avant production
-- - Faire un backup de la base avant d'exécuter en production

-- 📝 ORDRE D'EXÉCUTION:
-- 1. Section 1 (migrations critiques)
-- 2. Section 2 (vérifications)
-- 3. Section 4 (optionnel)

-- 🔍 APRÈS EXÉCUTION:
-- - Vérifier que les 3 requêtes de la section 2 retournent les résultats attendus
-- - Tester les flight strips dans l'interface ATC
-- - Tester les vols ferry automatiques
-- - Tester l'affrètement de techniciens

-- ============================================================
-- FIN DES MIGRATIONS
-- ============================================================
