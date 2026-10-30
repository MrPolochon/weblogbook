-- Preserve staff rates; correct only the orphaned Mellor code.
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.taxes_aeroport WHERE code_oaci='ILMR')
 AND NOT EXISTS(SELECT 1 FROM public.aeroports WHERE code_oaci='ILMR') THEN
   IF NOT EXISTS(SELECT 1 FROM public.aeroports WHERE code_oaci='IMLR') THEN
     RAISE EXCEPTION 'Mellor IMLR is absent; staff tax configuration left unchanged';
   END IF;
   IF EXISTS(SELECT 1 FROM public.taxes_aeroport WHERE code_oaci='IMLR') THEN
     RAISE EXCEPTION 'Two Mellor tax records require staff reconciliation; no rate overwritten';
   END IF;
   UPDATE public.taxes_aeroport SET code_oaci='IMLR' WHERE code_oaci='ILMR';
 END IF;
END $$;
