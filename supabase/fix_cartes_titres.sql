-- Migration: Corriger les titres des cartes d'identité selon le rôle
-- À exécuter dans Supabase SQL Editor

-- Mettre à jour les cartes des PILOTES (ceux qui ne sont ni admin, ni ATC principal, ni SIAVI)
UPDATE cartes_identite
SET titre = 'Carte d''identification de membre d''équipage'
WHERE user_id IN (
  SELECT id FROM profiles 
  WHERE role = 'pilote' 
    AND (atc IS NULL OR atc = false)
    AND (siavi IS NULL OR siavi = false)
)
AND titre IN ('IFSA', 'Pilote');

-- Mettre à jour les cartes des ATC
UPDATE cartes_identite
SET titre = 'Opération de contrôle aérienne'
WHERE user_id IN (
  SELECT id FROM profiles 
  WHERE role = 'atc' OR atc = true
)
AND titre IN ('IFSA', 'ATC');

-- Mettre à jour les cartes des SIAVI (pompiers)
UPDATE cartes_identite
SET titre = 'Service incendie'
WHERE user_id IN (
  SELECT id FROM profiles 
  WHERE siavi = true
)
AND titre IN ('IFSA', 'SIAVI');

-- Vérification: Afficher les cartes mises à jour
SELECT 
  c.titre,
  p.identifiant,
  p.role,
  p.atc,
  p.siavi
FROM cartes_identite c
JOIN profiles p ON p.id = c.user_id
ORDER BY c.titre, p.identifiant;
