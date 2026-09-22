-- Identité Discord du process Railway (gateway), pour détecter un token
-- différent de SUPPORT_BOT_TOKEN côté Vercel. Appliquer une fois en SQL Editor.

ALTER TABLE public.support_bot_config
  ADD COLUMN IF NOT EXISTS gateway_bot_user_id TEXT,
  ADD COLUMN IF NOT EXISTS gateway_seen_at TIMESTAMPTZ;

COMMENT ON COLUMN public.support_bot_config.gateway_bot_user_id IS
  'ID Discord du bot gateway Railway, annoncé à chaque poll runtime.';
COMMENT ON COLUMN public.support_bot_config.gateway_seen_at IS
  'Dernier heartbeat runtime du bot assistance Railway.';
