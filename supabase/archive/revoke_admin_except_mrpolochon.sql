-- ============================================================
-- SÉCURITÉ : Retirer le rôle admin à tous sauf mrpolochon
-- À exécuter dans l'éditeur SQL Supabase après un compromis admin
-- ============================================================

-- Met à jour tous les profils admin dont l'identifiant n'est pas mrpolochon
UPDATE public.profiles
SET role = 'pilote'
WHERE role = 'admin'
  AND LOWER(TRIM(identifiant)) <> 'mrpolochon';

-- Vérification (optionnel) : lister les admins restants
-- SELECT id, identifiant, role FROM public.profiles WHERE role = 'admin';
