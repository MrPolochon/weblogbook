-- Migration: Protection contre les suppressions massives
-- Date: 2026-01-29
-- 
-- Cette table track les suppressions de comptes pour empêcher les suppressions massives
-- Après 3 suppressions en 10 minutes, le mot de passe superadmin est requis

CREATE TABLE IF NOT EXISTS public.deletion_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_by_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  deleted_profile_id UUID NOT NULL, -- L'ID du profil supprimé (ne pas référencer car il n'existe plus)
  deleted_identifiant TEXT NOT NULL, -- L'identifiant du compte supprimé
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  required_superadmin BOOLEAN DEFAULT FALSE -- Si la suppression a nécessité le mot de passe superadmin
);

-- Index pour les requêtes de comptage récentes
CREATE INDEX IF NOT EXISTS idx_deletion_logs_recent 
  ON public.deletion_logs(deleted_by_id, deleted_at DESC);

-- RLS
ALTER TABLE public.deletion_logs ENABLE ROW LEVEL SECURITY;

-- Seuls les admins peuvent voir les logs de suppression
CREATE POLICY "deletion_logs_admin_only" ON public.deletion_logs
  FOR ALL USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- Commentaire
COMMENT ON TABLE public.deletion_logs IS 'Journal des suppressions de comptes pour protection anti-suppression massive';
