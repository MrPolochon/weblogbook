-- ============================================================
-- SEED AVIONS PTFS - Tous les avions du jeu
-- ============================================================

-- ÉTAPE 1: Ajouter les colonnes manquantes une par une
DO $$ BEGIN
  ALTER TABLE public.types_avion ADD COLUMN code_oaci TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.types_avion ADD COLUMN categorie TEXT NOT NULL DEFAULT 'commercial';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.types_avion ADD COLUMN est_militaire BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.types_avion ADD COLUMN est_cargo BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.types_avion ADD COLUMN prix INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.types_avion ADD COLUMN capacite_pax INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.types_avion ADD COLUMN capacite_cargo_kg INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ÉTAPE 2: Supprimer les références et les anciens avions
-- D'abord, mettre à NULL les références dans les autres tables
UPDATE public.vols SET type_avion_id = NULL WHERE type_avion_id IS NOT NULL;

-- Ces tables peuvent ne pas exister, on ignore les erreurs
DO $$ BEGIN
  UPDATE public.inventaire_avions SET type_avion_id = NULL WHERE type_avion_id IS NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  UPDATE public.compagnie_flotte SET type_avion_id = NULL WHERE type_avion_id IS NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Supprimer les entrées orphelines (si les tables existent)
DO $$ BEGIN
  DELETE FROM public.inventaire_avions WHERE type_avion_id IS NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  DELETE FROM public.compagnie_flotte WHERE type_avion_id IS NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Maintenant supprimer les types d'avion
DELETE FROM public.types_avion;

-- ============================================================
-- AVIONS COMMERCIAUX (Airliners) - PAX
-- ============================================================
INSERT INTO public.types_avion (nom, constructeur, code_oaci, categorie, prix, capacite_pax, capacite_cargo_kg, est_militaire, est_cargo, ordre) VALUES
('ATR-72', 'ATR', 'AT72', 'commercial', 2500000, 70, 500, false, false, 1),
('Boeing 727', 'Boeing', 'B727', 'commercial', 8000000, 149, 1500, false, false, 2),
('Boeing 737', 'Boeing', 'B738', 'commercial', 12000000, 162, 2000, false, false, 3),
('Boeing 747', 'Boeing', 'B744', 'commercial', 35000000, 416, 5000, false, false, 4),
('Boeing 757', 'Boeing', 'B752', 'commercial', 15000000, 200, 2500, false, false, 5),
('Boeing 767', 'Boeing', 'B763', 'commercial', 20000000, 269, 3000, false, false, 6),
('Boeing 777', 'Boeing', 'B77W', 'commercial', 32000000, 396, 4000, false, false, 7),
('Boeing 787', 'Boeing', 'B788', 'commercial', 28000000, 296, 3500, false, false, 8),
('Airbus A220', 'Airbus', 'BCS3', 'commercial', 9000000, 135, 1200, false, false, 9),
('Airbus A320', 'Airbus', 'A320', 'commercial', 11000000, 180, 2000, false, false, 10),
('Airbus A330', 'Airbus', 'A333', 'commercial', 25000000, 277, 3500, false, false, 11),
('Airbus A340', 'Airbus', 'A346', 'commercial', 28000000, 380, 4000, false, false, 12),
('Airbus A350', 'Airbus', 'A359', 'commercial', 30000000, 325, 4000, false, false, 13),
('Airbus A380', 'Airbus', 'A388', 'commercial', 45000000, 555, 6000, false, false, 14),
('Concorde', 'Aérospatiale/BAC', 'CONC', 'commercial', 50000000, 100, 500, false, false, 15),
('Bombardier CRJ700', 'Bombardier', 'CRJ7', 'commercial', 4500000, 70, 800, false, false, 16),
('Bombardier Q400', 'Bombardier', 'DH8D', 'commercial', 3200000, 78, 700, false, false, 17),
('McDonnell Douglas MD-11', 'McDonnell Douglas', 'MD11', 'commercial', 22000000, 293, 3500, false, false, 18),
('McDonnell Douglas MD-90', 'McDonnell Douglas', 'MD90', 'commercial', 10000000, 160, 2000, false, false, 19),
('Embraer E190', 'Embraer', 'E190', 'commercial', 5500000, 100, 1000, false, false, 20);

-- ============================================================
-- AVIONS CARGO - Charge en kg
-- ============================================================
INSERT INTO public.types_avion (nom, constructeur, code_oaci, categorie, prix, capacite_pax, capacite_cargo_kg, est_militaire, est_cargo, ordre) VALUES
('Antonov An-22', 'Antonov', 'AN22', 'cargo', 15000000, 0, 80000, false, true, 101),
('Airbus BelugaXL', 'Airbus', 'BLXL', 'cargo', 40000000, 0, 51000, false, true, 102),
('Boeing DreamLifter', 'Boeing', 'BLCF', 'cargo', 35000000, 0, 113400, false, true, 103),
('Boeing 747 Cargo', 'Boeing', 'B74F', 'cargo', 38000000, 0, 120000, false, true, 104),
('Boeing 757 Cargo', 'Boeing', 'B75F', 'cargo', 18000000, 0, 39780, false, true, 105),
('Boeing 767 Cargo', 'Boeing', 'B76F', 'cargo', 25000000, 0, 52700, false, true, 106),
('Boeing 777 Cargo', 'Boeing', 'B77F', 'cargo', 35000000, 0, 102000, false, true, 107),
('McDonnell Douglas MD-11 Cargo', 'McDonnell Douglas', 'MD1F', 'cargo', 24000000, 0, 91000, false, true, 108),
('Antonov AN-225', 'Antonov', 'A225', 'cargo', 100000000, 0, 250000, false, true, 109),
('Boeing 727 Cargo', 'Boeing', 'B72F', 'cargo', 10000000, 0, 28000, false, true, 110),
('Cessna Caravan Cargo', 'Cessna', 'C208', 'cargo', 250000, 0, 1360, false, true, 111);

-- ============================================================
-- AVIONS LÉGERS (Light Aircraft)
-- ============================================================
INSERT INTO public.types_avion (nom, constructeur, code_oaci, categorie, prix, capacite_pax, capacite_cargo_kg, est_militaire, est_cargo, ordre) VALUES
('DHC-6 Twin Otter', 'De Havilland Canada', 'DHC6', 'leger', 600000, 19, 200, false, false, 201),
('Bombardier Learjet', 'Bombardier', 'LJ45', 'leger', 1500000, 8, 150, false, false, 202),
('Extra 300s', 'Extra', 'E300', 'leger', 350000, 1, 50, false, false, 203),
('Piper PA-28', 'Piper', 'P28A', 'leger', 150000, 4, 100, false, false, 204),
('Piper Cub', 'Piper', 'J3', 'leger', 80000, 2, 50, false, false, 205),
('Cessna 172', 'Cessna', 'C172', 'leger', 120000, 4, 100, false, false, 206),
('Cessna 182', 'Cessna', 'C182', 'leger', 180000, 4, 150, false, false, 207),
('Cessna Caravan', 'Cessna', 'C208', 'leger', 250000, 9, 200, false, false, 208),
('Cessna Caravan Skydiving', 'Cessna', 'C208', 'leger', 280000, 14, 100, false, false, 209),
('Wright Brothers Plane', 'Wright', 'WRGT', 'leger', 50000, 1, 0, false, false, 210),
('Cirrus Vision SF50', 'Cirrus', 'SF50', 'leger', 300000, 5, 100, false, false, 211),
('Cessna 402', 'Cessna', 'C402', 'leger', 350000, 9, 200, false, false, 212);

-- ============================================================
-- AVIONS MILITAIRES MODERNES (post-1970)
-- ============================================================
INSERT INTO public.types_avion (nom, constructeur, code_oaci, categorie, prix, capacite_pax, capacite_cargo_kg, est_militaire, est_cargo, ordre) VALUES
('F-14 Tomcat', 'Grumman', 'F14', 'militaire_moderne', 5000000, 2, 0, true, false, 301),
('F-15E Strike Eagle', 'Boeing', 'F15', 'militaire_moderne', 6000000, 2, 0, true, false, 302),
('F-16 Fighting Falcon', 'General Dynamics', 'F16', 'militaire_moderne', 4500000, 1, 0, true, false, 303),
('F/A-18 Super Hornet', 'Boeing', 'F18S', 'militaire_moderne', 7000000, 2, 0, true, false, 304),
('F-22 Raptor', 'Lockheed Martin', 'F22', 'militaire_moderne', 15000000, 1, 0, true, false, 305),
('F-35B', 'Lockheed Martin', 'F35', 'militaire_moderne', 12000000, 1, 0, true, false, 306),
('A-10 Warthog', 'Fairchild Republic', 'A10', 'militaire_moderne', 3500000, 1, 0, true, false, 307),
('B-2 Spirit', 'Northrop Grumman', 'B2', 'militaire_moderne', 80000000, 2, 0, true, false, 308),
('Eurofighter Typhoon', 'Eurofighter', 'EUFI', 'militaire_moderne', 9000000, 1, 0, true, false, 309),
('Hawk T1', 'BAE Systems', 'HAWK', 'militaire_moderne', 1800000, 2, 0, true, false, 310),
('Sukhoi Su-27', 'Sukhoi', 'SU27', 'militaire_moderne', 5500000, 1, 0, true, false, 311),
('Boeing P-8 Poseidon', 'Boeing', 'P8', 'militaire_moderne', 25000000, 9, 5000, true, false, 312),
('Sukhoi Su-57', 'Sukhoi', 'SU57', 'militaire_moderne', 14000000, 1, 0, true, false, 313),
('Boeing C-17 Globemaster III', 'Boeing', 'C17', 'militaire_moderne', 35000000, 0, 77500, true, true, 314),
('EC-18B', 'Boeing', 'EC18', 'militaire_moderne', 20000000, 10, 2000, true, false, 315),
('E-3 Sentry', 'Boeing', 'E3CF', 'militaire_moderne', 27000000, 20, 1000, true, false, 316);

-- ============================================================
-- AVIONS MILITAIRES HISTORIQUES (pre-1970)
-- ============================================================
INSERT INTO public.types_avion (nom, constructeur, code_oaci, categorie, prix, capacite_pax, capacite_cargo_kg, est_militaire, est_cargo, ordre) VALUES
('P-51 Mustang', 'North American', 'P51', 'militaire_historique', 500000, 1, 0, true, false, 401),
('Hawker Hurricane', 'Hawker', 'HURR', 'militaire_historique', 450000, 1, 0, true, false, 402),
('F4U Corsair', 'Vought', 'F4U', 'militaire_historique', 480000, 1, 0, true, false, 403),
('A6M Zero', 'Mitsubishi', 'A6M', 'militaire_historique', 400000, 1, 0, true, false, 404),
('Fokker Dr1', 'Fokker', 'DR1', 'militaire_historique', 200000, 1, 0, true, false, 405),
('MiG-15', 'Mikoyan-Gurevich', 'MG15', 'militaire_historique', 600000, 1, 0, true, false, 406),
('P-38 Lightning', 'Lockheed', 'P38', 'militaire_historique', 550000, 1, 0, true, false, 407),
('B-29 Superfortress', 'Boeing', 'B29', 'militaire_historique', 1200000, 11, 9000, true, false, 408),
('Avro Vulcan', 'Avro', 'VULC', 'militaire_historique', 2500000, 5, 9500, true, false, 409),
('Hawker Harrier', 'Hawker Siddeley', 'HARR', 'militaire_historique', 3000000, 1, 0, true, false, 410),
('F-4 Phantom', 'McDonnell Douglas', 'F4', 'militaire_historique', 2000000, 2, 0, true, false, 411),
('C-130 Hercules', 'Lockheed', 'C130', 'militaire_historique', 8000000, 0, 19000, true, true, 412),
('English Electric Lightning', 'English Electric', 'LTNG', 'militaire_historique', 1500000, 1, 0, true, false, 413),
('SR-71 Blackbird', 'Lockheed', 'SR71', 'militaire_historique', 10000000, 2, 0, true, false, 414);

-- ============================================================
-- AVIONS AMPHIBIES (nécessite Seaplane Package)
-- ============================================================
INSERT INTO public.types_avion (nom, constructeur, code_oaci, categorie, prix, capacite_pax, capacite_cargo_kg, est_militaire, est_cargo, ordre) VALUES
('DHC-6 Twin Otter Amphibie', 'De Havilland Canada', 'DHC6', 'amphibie', 700000, 19, 200, false, false, 501),
('Cessna Caravan Amphibie', 'Cessna', 'C208', 'amphibie', 300000, 9, 200, false, false, 502),
('Cessna 172 Amphibie', 'Cessna', 'C172', 'amphibie', 150000, 4, 100, false, false, 503),
('Cessna 182 Amphibie', 'Cessna', 'C182', 'amphibie', 220000, 4, 150, false, false, 504),
('Piper Cub Amphibie', 'Piper', 'J3', 'amphibie', 100000, 2, 50, false, false, 505);

-- ============================================================
-- HÉLICOPTÈRES
-- ============================================================
INSERT INTO public.types_avion (nom, constructeur, code_oaci, categorie, prix, capacite_pax, capacite_cargo_kg, est_militaire, est_cargo, ordre) VALUES
('Bell 412', 'Bell', 'B412', 'helicoptere', 800000, 13, 500, false, false, 601),
('Chinook', 'Boeing', 'CH47', 'helicoptere', 4000000, 33, 12000, true, false, 602),
('UH-60 Black Hawk', 'Sikorsky', 'H60', 'helicoptere', 2500000, 11, 4000, true, false, 603),
('Airbus H135', 'Airbus', 'EC35', 'helicoptere', 600000, 6, 300, false, false, 604),
('Sikorsky S-92', 'Sikorsky', 'S92', 'helicoptere', 1800000, 19, 600, false, false, 605);

-- ============================================================
-- AVIONS RAVITAILLEURS
-- ============================================================
INSERT INTO public.types_avion (nom, constructeur, code_oaci, categorie, prix, capacite_pax, capacite_cargo_kg, est_militaire, est_cargo, ordre) VALUES
('KC-767', 'Boeing', 'K767', 'ravitailleur', 22000000, 0, 90000, true, false, 701),
('KC-130', 'Lockheed Martin', 'KC30', 'ravitailleur', 12000000, 0, 30000, true, false, 702),
('A330 MRTT', 'Airbus', 'A3MR', 'ravitailleur', 28000000, 0, 111000, true, false, 703);

-- ============================================================
-- RÉSUMÉ
-- ============================================================
SELECT 
  categorie,
  COUNT(*) as nombre,
  CASE 
    WHEN est_militaire THEN 'Militaire uniquement'
    ELSE 'Civil'
  END as acces
FROM public.types_avion 
GROUP BY categorie, est_militaire
ORDER BY categorie;
