-- Trigger idempotent : évite duplicate key sur felitz_comptes_uniq_personnel_proprietaire
-- si un compte personnel existe déjà pour ce profil (ré-seed, outils admin, etc.).
CREATE OR REPLACE FUNCTION create_personal_felitz_account() RETURNS TRIGGER AS $$
DECLARE new_vban TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.felitz_comptes
    WHERE type = 'personnel' AND proprietaire_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;
  LOOP
    new_vban := generate_vban('MIXOU');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.felitz_comptes WHERE vban = new_vban);
  END LOOP;
  INSERT INTO public.felitz_comptes (type, proprietaire_id, vban, solde)
  VALUES ('personnel', NEW.id, new_vban, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
