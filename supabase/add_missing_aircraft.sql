-- ============================================================
-- AJOUT DES AVIONS MANQUANTS
-- ============================================================

-- ============================================================
-- AVIONS COMMERCIAUX MANQUANTS
-- ============================================================
INSERT INTO public.types_avion (nom, constructeur, code_oaci, categorie, prix, capacite_pax, capacite_cargo_kg, est_militaire, est_cargo, ordre) VALUES
('Boeing 707', 'Boeing', 'B703', 'commercial', 6000000, 147, 1500, false, false, 21),
('Lockheed Tristar', 'Lockheed', 'L101', 'commercial', 18000000, 256, 3000, false, false, 22),
('DC-10', 'McDonnell Douglas', 'DC10', 'commercial', 20000000, 270, 3500, false, false, 23),
('King Air 260', 'Beechcraft', 'BE20', 'leger', 450000, 8, 200, false, false, 213),
('Diamond DA50', 'Diamond', 'DA50', 'leger', 200000, 5, 100, false, false, 214)
ON CONFLICT DO NOTHING;

-- ============================================================
-- AVIONS CARGO MANQUANTS
-- ============================================================
INSERT INTO public.types_avion (nom, constructeur, code_oaci, categorie, prix, capacite_pax, capacite_cargo_kg, est_militaire, est_cargo, ordre) VALUES
('ATR 72F', 'ATR', 'AT7F', 'cargo', 3000000, 0, 8500, false, true, 112),
('Airbus A330 Cargo', 'Airbus', 'A33F', 'cargo', 28000000, 0, 70000, false, true, 113),
('Boeing 737 Cargo', 'Boeing', 'B73F', 'cargo', 14000000, 0, 23000, false, true, 114),
('DC-10F', 'McDonnell Douglas', 'D10F', 'cargo', 22000000, 0, 77000, false, true, 115),
('Cessna Caravan Cargo Amphibie', 'Cessna', 'C208', 'amphibie', 280000, 0, 1360, false, true, 506)
ON CONFLICT DO NOTHING;

-- ============================================================
-- AVIONS MILITAIRES MANQUANTS
-- ============================================================
INSERT INTO public.types_avion (nom, constructeur, code_oaci, categorie, prix, capacite_pax, capacite_cargo_kg, est_militaire, est_cargo, ordre) VALUES
('B-1 Lancer', 'Rockwell', 'B1', 'militaire_moderne', 28000000, 4, 0, true, false, 317),
('JAS 39 Gripen', 'Saab', 'JAS', 'militaire_moderne', 8500000, 1, 0, true, false, 318)
ON CONFLICT DO NOTHING;

-- ============================================================
-- AVIONS RAVITAILLEURS MANQUANTS
-- ============================================================
INSERT INTO public.types_avion (nom, constructeur, code_oaci, categorie, prix, capacite_pax, capacite_cargo_kg, est_militaire, est_cargo, ordre) VALUES
('KC-10 Extender', 'McDonnell Douglas', 'KC10', 'ravitailleur', 25000000, 0, 75000, true, false, 704),
('KC-707', 'Boeing', 'K707', 'ravitailleur', 18000000, 0, 60000, true, false, 705),
('KC-1', 'Boeing', 'KC1', 'ravitailleur', 15000000, 0, 45000, true, false, 706)
ON CONFLICT DO NOTHING;

-- ============================================================
-- RÉSUMÉ DES AJOUTS
-- ============================================================
SELECT 
  categorie,
  COUNT(*) as nombre
FROM public.types_avion 
GROUP BY categorie
ORDER BY categorie;
