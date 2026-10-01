ALTER TABLE public.support_bot_config
  ADD COLUMN IF NOT EXISTS admin_role_ids TEXT[] NOT NULL DEFAULT '{}';
