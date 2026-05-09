-- ============================================================
-- CRÉER LES COMPTES FELITZ POUR LES UTILISATEURS EXISTANTS
-- Exécuter APRÈS add_felitz_bank_system.sql
-- ============================================================

-- Créer les comptes personnels pour les utilisateurs existants qui n'en ont pas
INSERT INTO public.felitz_comptes (type, proprietaire_id, vban, solde)
SELECT 
  'personnel',
  p.id,
  'MIXOU' || upper(substr(md5(random()::text || p.id::text), 1, 22)),
  0
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.felitz_comptes fc 
  WHERE fc.proprietaire_id = p.id AND fc.type = 'personnel'
);

-- Créer les comptes entreprise pour les compagnies existantes qui n'en ont pas
INSERT INTO public.felitz_comptes (type, compagnie_id, vban, solde)
SELECT 
  'entreprise',
  c.id,
  'ENTERMIXOU' || upper(substr(md5(random()::text || c.id::text), 1, 16)),
  0
FROM public.compagnies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.felitz_comptes fc 
  WHERE fc.compagnie_id = c.id AND fc.type = 'entreprise'
);

-- Mettre à jour le VBAN des compagnies
UPDATE public.compagnies c
SET vban = (
  SELECT fc.vban 
  FROM public.felitz_comptes fc 
  WHERE fc.compagnie_id = c.id AND fc.type = 'entreprise'
)
WHERE c.vban IS NULL;

-- Afficher le résultat
SELECT 'Comptes personnels créés:' as info, count(*) as total FROM public.felitz_comptes WHERE type = 'personnel';
SELECT 'Comptes entreprise créés:' as info, count(*) as total FROM public.felitz_comptes WHERE type = 'entreprise';
