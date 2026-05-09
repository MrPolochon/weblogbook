-- ============================================================
-- Déconnecter toutes les sessions (forcer tout le monde à se reconnecter)
-- À exécuter dans l'éditeur SQL Supabase (Dashboard > SQL Editor)
-- ============================================================
-- Les sessions sont stockées dans le schéma auth.
-- Après exécution, tous les utilisateurs devront se reconnecter.

-- Supprimer toutes les sessions
DELETE FROM auth.sessions;

-- Optionnel : supprimer aussi les refresh tokens (si la table existe)
-- DELETE FROM auth.refresh_tokens;
