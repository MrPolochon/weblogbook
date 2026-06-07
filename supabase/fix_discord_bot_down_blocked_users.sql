-- Fix urgence : débloque les utilisateurs coincés en missing_role / missing_guild
-- suite au bot Railway down.
-- À exécuter dans l'éditeur SQL Supabase.

-- 1. Voir combien d'utilisateurs sont bloqués
SELECT
  status,
  COUNT(*) as nombre,
  MAX(last_sync_at) as dernier_sync,
  MIN(last_sync_at) as premier_sync
FROM public.discord_links
WHERE status IN ('missing_role', 'missing_guild')
GROUP BY status;

-- 2. Les remettre en "active" temporairement (le bot re-synchronisera)
UPDATE public.discord_links
SET
  status      = 'active',
  guild_member       = true,
  has_required_role  = true,
  updated_at  = NOW()
WHERE status IN ('missing_role', 'missing_guild')
  AND is_permanent = false;

-- 3. Vérifier le résultat
SELECT COUNT(*) as debloqués
FROM public.discord_links
WHERE status = 'active';
