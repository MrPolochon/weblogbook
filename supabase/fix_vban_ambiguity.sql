-- Correction de l'ambiguïté dans la fonction generate_vban
-- Exécuter dans l'éditeur SQL Supabase si l'erreur "column reference vban is ambiguous" apparaît
-- Cette correction résout l'ambiguïté en renommant la variable locale et en utilisant un alias explicite

DROP FUNCTION IF EXISTS generate_vban(TEXT);

CREATE FUNCTION generate_vban(type_compte TEXT)
RETURNS TEXT AS $$
DECLARE
  prefix TEXT;
  random_part TEXT;
  vban_generated TEXT;
  max_iterations INTEGER := 100;
  iteration_count INTEGER := 0;
BEGIN
  IF type_compte = 'entreprise' THEN
    prefix := 'ENTERMIXOU';
  ELSE
    prefix := 'MIXOU';
  END IF;
  
  -- Générer 20 caractères aléatoires (chiffres et lettres majuscules)
  random_part := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 20));
  vban_generated := prefix || random_part;
  
  -- Vérifier l'unicité (si collision, régénérer)
  -- Utilisation d'un alias explicite 'fc' pour éviter l'ambiguïté
  WHILE EXISTS (SELECT 1 FROM public.felitz_comptes fc WHERE fc.vban = vban_generated) LOOP
    iteration_count := iteration_count + 1;
    IF iteration_count >= max_iterations THEN
      RAISE EXCEPTION 'Impossible de générer un VBAN unique après % tentatives', max_iterations;
    END IF;
    random_part := upper(substring(md5(random()::text || clock_timestamp()::text || iteration_count::text) from 1 for 20));
    vban_generated := prefix || random_part;
  END LOOP;
  
  RETURN vban_generated;
END;
$$ LANGUAGE plpgsql;
