-- Lecture seule : trésorerie, coût d'achat de la flotte et prêts actifs.
-- La flotte au coût d'achat ne représente pas sa valeur de revente actuelle.
WITH cibles AS (
  SELECT id, nom FROM public.compagnies
  WHERE regexp_replace(lower(translate(nom, 'éèêëÉÈÊË', 'eeeeEEEE')), '[^a-z0-9]', '', 'g')
    IN ('lufthansa', 'lufthansacargo', 'lufthansaregional')
)
SELECT c.id, c.nom,
  (SELECT count(*) FROM public.felitz_comptes f WHERE f.compagnie_id = c.id AND f.type = 'entreprise') AS nombre_comptes,
  (SELECT coalesce(sum(f.solde), 0) FROM public.felitz_comptes f WHERE f.compagnie_id = c.id AND f.type = 'entreprise') AS tresorerie_fs,
  (SELECT count(*) FROM public.compagnie_avions a WHERE a.compagnie_id = c.id AND a.detruit IS NOT TRUE) AS avions_non_detruits,
  (SELECT coalesce(sum(a.prix_achat), 0) FROM public.compagnie_avions a WHERE a.compagnie_id = c.id AND a.detruit IS NOT TRUE) AS flotte_cout_achat_fs,
  (SELECT count(*) FROM public.compagnie_avions a WHERE a.compagnie_id = c.id AND a.detruit IS NOT TRUE AND a.prix_achat IS NULL) AS avions_sans_prix_achat,
  (SELECT coalesce(sum(greatest(0, p.montant_total_du - p.montant_rembourse)), 0)
   FROM public.prets_bancaires p WHERE p.compagnie_id = c.id AND p.statut = 'actif') AS prets_restants_fs
FROM cibles c ORDER BY c.nom;
