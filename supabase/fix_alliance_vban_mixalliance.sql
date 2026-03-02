-- Met à jour le VBAN des comptes alliance existants (ALxxxxxx) vers le format MIXALLIANCE + 16 caractères
-- à exécuter si vous aviez des alliances créées avant ce changement.
DO $$
DECLARE
  r RECORD;
  v_new_vban TEXT;
BEGIN
  FOR r IN
    SELECT fc.id, fc.alliance_id, fc.vban
    FROM public.felitz_comptes fc
    WHERE fc.type = 'alliance' AND fc.vban IS NOT NULL AND fc.vban NOT LIKE 'MIXALLIANCE%'
  LOOP
    LOOP
      v_new_vban := 'MIXALLIANCE' || upper(substr(md5(random()::text || r.alliance_id::text), 1, 16));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.felitz_comptes WHERE vban = v_new_vban)
        AND NOT EXISTS (SELECT 1 FROM public.compagnies WHERE vban = v_new_vban);
    END LOOP;
    UPDATE public.felitz_comptes SET vban = v_new_vban WHERE id = r.id;
    RAISE NOTICE 'Compte alliance % : VBAN mis à jour vers %', r.id, v_new_vban;
  END LOOP;
END $$;
