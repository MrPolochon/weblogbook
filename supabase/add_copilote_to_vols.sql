-- Copilote : lien vers le co-pilote et confirmation par le pilote
-- Exécuter dans l'éditeur SQL Supabase

ALTER TABLE public.vols
  ADD COLUMN IF NOT EXISTS copilote_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS copilote_confirme_par_pilote BOOLEAN NOT NULL DEFAULT false;

-- Le copilote voit les vols où il est copilote (en plus du pilote qui voit les siens)
CREATE POLICY "vols_select_copilote" ON public.vols FOR SELECT TO authenticated
  USING (copilote_id = auth.uid());

-- Index pour les requêtes logbook (pilote_id ou copilote_id)
CREATE INDEX IF NOT EXISTS idx_vols_copilote ON public.vols(copilote_id);
