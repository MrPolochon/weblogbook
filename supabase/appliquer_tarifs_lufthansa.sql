-- Weblogbook / Felitz : grille du groupe Lufthansa (4 novembre 2026).
-- À exécuter en entier dans l'éditeur SQL de Supabase, en une seule requête.
-- Chaque sens est indépendant. Aucun tarif hors de cette grille n'est supprimé.
WITH cibles AS (
SELECT id, nom, prix_billet_pax, prix_kg_cargo,
  CASE cle
    WHEN 'lufthansa' THEN 'principale'
    WHEN 'lufthansaprincipale' THEN 'principale'
    WHEN 'lufthansaregional' THEN 'regional'
    WHEN 'lufthansaregionale' THEN 'regional'
    WHEN 'lufthansacargo' THEN 'cargo'
  END AS filiale
FROM (
  SELECT id, nom, prix_billet_pax, prix_kg_cargo,
    regexp_replace(lower(translate(nom, 'éèêëÉÈÊË', 'eeeeEEEE')), '[^a-z0-9]', '', 'g') AS cle
  FROM public.compagnies
) AS noms
WHERE cle IN ('lufthansa', 'lufthansaprincipale', 'lufthansaregional', 'lufthansaregionale', 'lufthansacargo')
), controle AS (
  SELECT count(*) = 3 AND count(DISTINCT filiale) = 3 AS ok FROM cibles
), grille(filiale, depart, arrivee, prix) AS (
VALUES
  ('principale', 'IRFD', 'ITKO', 281),
  ('principale', 'IRFD', 'IPPH', 281),
  ('principale', 'IRFD', 'ILAR', 281),
  ('principale', 'ITKO', 'IPPH', 281),
  ('principale', 'IPPH', 'ITKO', 281),
  ('principale', 'ITKO', 'IRFD', 215),
  ('principale', 'IPPH', 'IRFD', 215),
  ('principale', 'ILAR', 'IRFD', 215),
  ('principale', 'IRFD', 'IZOL', 215),
  ('principale', 'IZOL', 'IRFD', 215),
  ('regional', 'IRFD', 'ILAR', 280),
  ('regional', 'IRFD', 'IPPH', 280),
  ('regional', 'ILAR', 'IMLR', 215),
  ('regional', 'ILAR', 'IRFD', 215),
  ('regional', 'IPPH', 'IRFD', 215),
  ('regional', 'IMLR', 'ILAR', 280),
  ('regional', 'IRFD', 'IZOL', 215),
  ('regional', 'IZOL', 'IRFD', 215),
  ('regional', 'ILAR', 'IZOL', 215),
  ('regional', 'IMLR', 'IRFD', 215),
  ('regional', 'IZOL', 'ILAR', 280), -- prix à l'essai
  ('regional', 'IMLR', 'ISAU', 165),
  ('regional', 'ISAU', 'IRFD', 165)
), defauts AS (
  SELECT f.id,
    CASE f.filiale WHEN 'principale' THEN 240 WHEN 'regional' THEN 160 ELSE f.prix_billet_pax END AS billet,
    -- Remplacer 2.00 par 1.90 uniquement pour un essai sur toute la filiale Cargo.
    CASE WHEN f.filiale = 'cargo' THEN 2.00 ELSE f.prix_kg_cargo END AS fret
  FROM cibles f CROSS JOIN controle v
  WHERE v.ok
), compagnies_modifiees AS (
  UPDATE public.compagnies AS c
  SET prix_billet_pax = d.billet, prix_kg_cargo = d.fret
  FROM defauts AS d
  WHERE c.id = d.id
    AND (c.prix_billet_pax IS DISTINCT FROM d.billet OR c.prix_kg_cargo IS DISTINCT FROM d.fret)
  RETURNING c.id, c.prix_billet_pax, c.prix_kg_cargo
), tarifs_modifies AS (
INSERT INTO public.tarifs_liaisons AS t (
  compagnie_id, aeroport_depart, aeroport_arrivee, prix_billet, bidirectionnel
)
SELECT f.id, g.depart, g.arrivee, g.prix, false
FROM grille AS g JOIN cibles AS f USING (filiale)
CROSS JOIN controle AS v
WHERE v.ok
ON CONFLICT (compagnie_id, aeroport_depart, aeroport_arrivee) DO UPDATE
SET prix_billet = EXCLUDED.prix_billet, bidirectionnel = false, updated_at = now()
WHERE t.prix_billet IS DISTINCT FROM EXCLUDED.prix_billet
   OR t.bidirectionnel IS DISTINCT FROM false
RETURNING t.compagnie_id, t.aeroport_depart, t.aeroport_arrivee, t.prix_billet
), resultat AS (
  SELECT 'OK' AS statut, f.nom AS compagnie, g.depart, g.arrivee,
    coalesce(t.prix_billet, ancien.prix_billet) AS billet_f,
    coalesce(c.prix_billet_pax, f.prix_billet_pax) AS billet_defaut_f,
    coalesce(c.prix_kg_cargo, f.prix_kg_cargo) AS fret_defaut_f_par_kg
  FROM cibles f CROSS JOIN controle v
  LEFT JOIN grille g USING (filiale)
  LEFT JOIN compagnies_modifiees c ON c.id = f.id
  LEFT JOIN tarifs_modifies t ON t.compagnie_id = f.id AND t.aeroport_depart = g.depart AND t.aeroport_arrivee = g.arrivee
  LEFT JOIN public.tarifs_liaisons ancien ON ancien.compagnie_id = f.id AND ancien.aeroport_depart = g.depart AND ancien.aeroport_arrivee = g.arrivee
  WHERE v.ok
  UNION ALL
  SELECT 'Aucun tarif appliqué : une ou plusieurs filiales sont absentes ou ambiguës.',
    NULL, NULL, NULL, NULL, NULL, NULL
  FROM controle WHERE NOT ok
)
SELECT * FROM resultat ORDER BY compagnie, depart, arrivee;
