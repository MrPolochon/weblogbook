-- Image personnalisée par avion (livery / photo) — affichée sur l'ODW.
-- URL publique (Supabase Storage, URL directe, etc.).

ALTER TABLE public.compagnie_avions
  ADD COLUMN IF NOT EXISTS avion_image_url TEXT;

COMMENT ON COLUMN public.compagnie_avions.avion_image_url IS
  'URL de l''image (livery / photo) de l''avion, affichée dans l''ODW (Œil du Web).';
