BEGIN;
ALTER TABLE public.plans_vol ADD COLUMN IF NOT EXISTS medevac_mission_type text NOT NULL DEFAULT 'evacuation'
 CHECK (medevac_mission_type IN ('evacuation','service'));
COMMENT ON COLUMN public.plans_vol.medevac_mission_type IS 'evacuation: medical pickup and hospital/base finish; service: base-bound non-evacuation operations';
COMMIT;
