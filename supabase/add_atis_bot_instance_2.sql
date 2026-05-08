-- =============================================================================
-- Migration : ajout / verification du Bot ATIS instance #2
-- =============================================================================
-- Cette migration est idempotente. Elle assure que :
--   1. La ligne 'default' historique a bien ete migree en '1' (compat anciens deploy).
--   2. Les lignes id='1' et id='2' existent dans atis_broadcast_state ET
--      atis_broadcast_config.
--   3. L'index unique partiel "1 aeroport = 1 bot a la fois" est en place.
--   4. Les index de lookup sur controlling_user_id et broadcasting sont la.
--
-- Apres execution, lance le health-check :
--   GET /api/atc/atis/health-check  (ou page admin /admin/atis-bots).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Filet de securite : creer les tables si elles n'existent pas (cas premier
--    deploiement sur un projet vierge sans avoir lance add_atis_broadcast.sql).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.atis_broadcast_state (
  id TEXT PRIMARY KEY DEFAULT '1',
  controlling_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  aeroport TEXT,
  position TEXT,
  broadcasting BOOLEAN NOT NULL DEFAULT false,
  source TEXT CHECK (source IN ('site', 'discord')),
  started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.atis_broadcast_config (
  id TEXT PRIMARY KEY DEFAULT '1',
  discord_guild_id TEXT,
  discord_guild_name TEXT,
  discord_channel_id TEXT,
  discord_channel_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 1. Migration legacy : 'default' -> '1' (si pas deja fait)
-- ---------------------------------------------------------------------------

UPDATE public.atis_broadcast_state
SET id = '1'
WHERE id = 'default'
  AND NOT EXISTS (SELECT 1 FROM public.atis_broadcast_state WHERE id = '1');

UPDATE public.atis_broadcast_config
SET id = '1'
WHERE id = 'default'
  AND NOT EXISTS (SELECT 1 FROM public.atis_broadcast_config WHERE id = '1');

-- Si 'default' existe encore en plus de '1', on le supprime proprement.
DELETE FROM public.atis_broadcast_state WHERE id = 'default';
DELETE FROM public.atis_broadcast_config WHERE id = 'default';

-- ---------------------------------------------------------------------------
-- 2. Cree les rows pour Bot 1 ET Bot 2 si manquantes
-- ---------------------------------------------------------------------------

INSERT INTO public.atis_broadcast_state (id, broadcasting)
VALUES ('1', false), ('2', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.atis_broadcast_config (id)
VALUES ('1'), ('2')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Contrainte applicative : un meme aeroport ne peut etre broadcast que par
--    une seule instance a la fois (anti-duplication).
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS public.atis_broadcast_state_aeroport_unique;
CREATE UNIQUE INDEX atis_broadcast_state_aeroport_unique
ON public.atis_broadcast_state (aeroport)
WHERE broadcasting = true AND aeroport IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Index pour retrouver vite l'instance controlee par un user (used by
--    getControlledInstance() et stopAtisIfController()).
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS atis_broadcast_state_controlling_user_id_idx
ON public.atis_broadcast_state (controlling_user_id)
WHERE controlling_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS atis_broadcast_state_broadcasting_idx
ON public.atis_broadcast_state (broadcasting)
WHERE broadcasting = true;

-- ---------------------------------------------------------------------------
-- 5. Commentaires
-- ---------------------------------------------------------------------------

COMMENT ON TABLE public.atis_broadcast_state IS
  'Etat du broadcast ATIS Discord. Une ligne par instance de bot (id = ''1'', ''2'', ...).';
COMMENT ON TABLE public.atis_broadcast_config IS
  'Config Discord ATIS par instance : guild + canal vocal. Une ligne par instance.';
COMMENT ON COLUMN public.atis_broadcast_state.source IS
  'Origine du broadcast : ''site'' (depuis weblogbook) ou ''discord'' (slash /atiscreate).';

COMMIT;

-- =============================================================================
-- Verification post-migration (a executer separement si besoin) :
-- =============================================================================
--
-- Doit retourner exactement 2 lignes id IN ('1','2') broadcasting=false par defaut :
-- SELECT id, broadcasting, aeroport, controlling_user_id, source
-- FROM public.atis_broadcast_state ORDER BY id;
--
-- Doit retourner 2 lignes id IN ('1','2') :
-- SELECT id, discord_guild_name, discord_channel_name
-- FROM public.atis_broadcast_config ORDER BY id;
--
-- Doit retourner l'index unique partiel :
-- SELECT indexname, indexdef FROM pg_indexes
-- WHERE tablename = 'atis_broadcast_state'
-- ORDER BY indexname;
