-- Restore only entries still carrying the prices from this adjustment.
BEGIN;
UPDATE public.types_avion t SET prix=v.old_price
FROM (VALUES
  ('Piper Cub',150000,120000),('Piper Cub Amphibie',180000,144000),
  ('Cessna 172',200000,160000),('Piper PA-28',250000,200000),
  ('Cessna 172 Amphibie',270000,216000),('Cessna 182',300000,240000),
  ('Cessna 182 Amphibie',400000,320000),('Diamond DA50',350000,280000)
) AS v(nom,old_price,new_price)
WHERE t.nom=v.nom AND t.prix=v.new_price;
COMMIT;
