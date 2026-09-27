-- incidents_vol.signale_par_id référence profiles sans ON DELETE et en NOT NULL.
-- Supprimer un compte qui a signalé un incident échoue alors avec
-- incidents_vol_signale_par_id_fkey.
-- L'identifiant du signaleur est déjà copié dans signale_par_identifiant :
-- on détache le compte sans effacer l'incident.

ALTER TABLE public.incidents_vol
  DROP CONSTRAINT IF EXISTS incidents_vol_signale_par_id_fkey;

ALTER TABLE public.incidents_vol
  ALTER COLUMN signale_par_id DROP NOT NULL;

ALTER TABLE public.incidents_vol
  ADD CONSTRAINT incidents_vol_signale_par_id_fkey
  FOREIGN KEY (signale_par_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
