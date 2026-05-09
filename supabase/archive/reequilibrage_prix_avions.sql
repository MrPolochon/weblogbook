-- ============================================================
-- RÉÉQUILIBRAGE DES PRIX DE TOUS LES AVIONS
-- Les compagnies évoluent trop vite → recalcul complet.
--
-- Benchmark : un A320 (180 pax × 100 F$/vol = 18 000 F$/vol)
-- doit se rentabiliser en ~1 500 vols → prix cible = 27 000 000 F$
--
-- Philosophie de pricing :
--   Léger / Entrée     : ×1.5 à ×2   (accessibles pour démarrer)
--   Régional            : ×1.8         (~650 vols pour rentabiliser)
--   Narrow-body         : ×2.5         (~1 500 vols)
--   Wide-body moyen     : ×3           (~1 800 vols)
--   Wide-body lourd     : ×3.5-4       (~2 200 vols)
--   Flagships           : ×4-5         (~3 200 vols)
--   Cargo               : proportionnel au tonnage
--   Militaire           : ×2.5         (budget armée séparé)
-- ============================================================

-- ============================================================
-- AVIONS COMMERCIAUX (Airliners)
-- ============================================================

-- Régionaux (~650 vols pour rentabiliser)
UPDATE public.types_avion SET prix = 4500000    WHERE nom = 'ATR-72';            -- 70 pax → 7K/vol → 643 vols
UPDATE public.types_avion SET prix = 5500000    WHERE nom = 'Bombardier Q400';   -- 78 pax → 7.8K/vol → 705 vols
UPDATE public.types_avion SET prix = 8000000    WHERE nom = 'Bombardier CRJ700'; -- 70 pax → 7K/vol → 1143 vols
UPDATE public.types_avion SET prix = 10000000   WHERE nom = 'Embraer E190';      -- 100 pax → 10K/vol → 1000 vols

-- Narrow-body (~1 500 vols pour rentabiliser)
UPDATE public.types_avion SET prix = 14500000   WHERE nom = 'Boeing 707';        -- 147 pax → 14.7K/vol → 986 vols
UPDATE public.types_avion SET prix = 19000000   WHERE nom = 'Boeing 727';        -- 149 pax → 14.9K/vol → 1275 vols
UPDATE public.types_avion SET prix = 21000000   WHERE nom = 'Airbus A220';       -- 135 pax → 13.5K/vol → 1556 vols
UPDATE public.types_avion SET prix = 24000000   WHERE nom = 'McDonnell Douglas MD-90'; -- 160 pax → 16K/vol → 1500 vols
UPDATE public.types_avion SET prix = 27000000   WHERE nom = 'Airbus A320';       -- 180 pax → 18K/vol → 1500 vols
UPDATE public.types_avion SET prix = 30000000   WHERE nom = 'Boeing 737';        -- 162 pax → 16.2K/vol → 1852 vols

-- Wide-body moyen (~1 800 vols pour rentabiliser)
UPDATE public.types_avion SET prix = 45000000   WHERE nom = 'Boeing 757';        -- 200 pax → 20K/vol → 2250 vols
UPDATE public.types_avion SET prix = 55000000   WHERE nom = 'Lockheed Tristar';  -- 256 pax → 25.6K/vol → 2148 vols
UPDATE public.types_avion SET prix = 60000000   WHERE nom = 'DC-10';             -- 270 pax → 27K/vol → 2222 vols
UPDATE public.types_avion SET prix = 60000000   WHERE nom = 'Boeing 767';        -- 269 pax → 26.9K/vol → 2230 vols
UPDATE public.types_avion SET prix = 65000000   WHERE nom = 'McDonnell Douglas MD-11'; -- 293 pax → 29.3K/vol → 2218 vols

-- Wide-body lourd (~2 500 vols pour rentabiliser)
UPDATE public.types_avion SET prix = 78000000   WHERE nom = 'Airbus A330';       -- 277 pax → 27.7K/vol → 2816 vols
UPDATE public.types_avion SET prix = 90000000   WHERE nom = 'Boeing 787';        -- 296 pax → 29.6K/vol → 3041 vols
UPDATE public.types_avion SET prix = 92000000   WHERE nom = 'Airbus A340';       -- 380 pax → 38K/vol → 2421 vols
UPDATE public.types_avion SET prix = 102000000  WHERE nom = 'Airbus A350';       -- 325 pax → 32.5K/vol → 3138 vols
UPDATE public.types_avion SET prix = 115000000  WHERE nom = 'Boeing 777';        -- 396 pax → 39.6K/vol → 2904 vols

-- Flagships (~3 200 vols pour rentabiliser)
UPDATE public.types_avion SET prix = 132000000  WHERE nom = 'Boeing 747';        -- 416 pax → 41.6K/vol → 3173 vols
UPDATE public.types_avion SET prix = 180000000  WHERE nom = 'Airbus A380';       -- 555 pax → 55.5K/vol → 3243 vols
UPDATE public.types_avion SET prix = 240000000  WHERE nom = 'Concorde';          -- 100 pax → 10K/vol → prestige pur

-- ============================================================
-- AVIONS CARGO
-- ============================================================

UPDATE public.types_avion SET prix = 300000     WHERE nom = 'Cessna Caravan Cargo';           -- était 250,000
UPDATE public.types_avion SET prix = 5500000    WHERE nom = 'ATR 72F';                        -- était 3,000,000
UPDATE public.types_avion SET prix = 21000000   WHERE nom = 'Boeing 727 Cargo';               -- était 10,000,000
UPDATE public.types_avion SET prix = 34000000   WHERE nom = 'Boeing 737 Cargo';               -- était 14,000,000
UPDATE public.types_avion SET prix = 36000000   WHERE nom = 'Antonov An-22';                  -- était 15,000,000
UPDATE public.types_avion SET prix = 48000000   WHERE nom = 'Boeing 757 Cargo';               -- était 18,000,000
UPDATE public.types_avion SET prix = 66000000   WHERE nom = 'DC-10F';                         -- était 22,000,000
UPDATE public.types_avion SET prix = 69000000   WHERE nom = 'McDonnell Douglas MD-11 Cargo';  -- était 24,000,000
UPDATE public.types_avion SET prix = 72000000   WHERE nom = 'Boeing 767 Cargo';               -- était 25,000,000
UPDATE public.types_avion SET prix = 80000000   WHERE nom = 'Airbus A330 Cargo';              -- était 28,000,000
UPDATE public.types_avion SET prix = 105000000  WHERE nom = 'Boeing 777 Cargo';               -- était 35,000,000
UPDATE public.types_avion SET prix = 108000000  WHERE nom = 'Boeing DreamLifter';             -- était 35,000,000
UPDATE public.types_avion SET prix = 117000000  WHERE nom = 'Boeing 747 Cargo';               -- était 38,000,000
UPDATE public.types_avion SET prix = 125000000  WHERE nom = 'Airbus BelugaXL';                -- était 40,000,000
UPDATE public.types_avion SET prix = 300000000  WHERE nom = 'Antonov AN-225';                 -- était 100,000,000

-- ============================================================
-- AVIONS LÉGERS (×1.5-2.5)
-- ============================================================

UPDATE public.types_avion SET prix = 75000      WHERE nom = 'Wright Brothers Plane'; -- était 50,000
UPDATE public.types_avion SET prix = 130000     WHERE nom = 'Piper Cub';             -- était 80,000
UPDATE public.types_avion SET prix = 200000     WHERE nom = 'Cessna 172';            -- était 120,000
UPDATE public.types_avion SET prix = 250000     WHERE nom = 'Piper PA-28';           -- était 150,000
UPDATE public.types_avion SET prix = 300000     WHERE nom = 'Cessna 182';            -- était 180,000
UPDATE public.types_avion SET prix = 350000     WHERE nom = 'Diamond DA50';          -- était 200,000
UPDATE public.types_avion SET prix = 450000     WHERE nom = 'Cessna Caravan';        -- était 250,000
UPDATE public.types_avion SET prix = 500000     WHERE nom = 'Cessna Caravan Skydiving'; -- était 280,000
UPDATE public.types_avion SET prix = 550000     WHERE nom = 'Cirrus Vision SF50';    -- était 300,000
UPDATE public.types_avion SET prix = 550000     WHERE nom = 'Extra 300s';            -- était 350,000
UPDATE public.types_avion SET prix = 650000     WHERE nom = 'Cessna 402';            -- était 350,000
UPDATE public.types_avion SET prix = 800000     WHERE nom = 'King Air 260';          -- était 450,000
UPDATE public.types_avion SET prix = 1200000    WHERE nom = 'DHC-6 Twin Otter';      -- était 600,000
UPDATE public.types_avion SET prix = 3500000    WHERE nom = 'Bombardier Learjet';    -- était 1,500,000

-- ============================================================
-- AVIONS MILITAIRES MODERNES (×2.5)
-- ============================================================

UPDATE public.types_avion SET prix = 4500000    WHERE nom = 'Hawk T1';               -- était 1,800,000
UPDATE public.types_avion SET prix = 8500000    WHERE nom = 'A-10 Warthog';          -- était 3,500,000
UPDATE public.types_avion SET prix = 11000000   WHERE nom = 'F-16 Fighting Falcon';  -- était 4,500,000
UPDATE public.types_avion SET prix = 12500000   WHERE nom = 'F-14 Tomcat';           -- était 5,000,000
UPDATE public.types_avion SET prix = 14000000   WHERE nom = 'Sukhoi Su-27';          -- était 5,500,000
UPDATE public.types_avion SET prix = 15000000   WHERE nom = 'F-15E Strike Eagle';    -- était 6,000,000
UPDATE public.types_avion SET prix = 17500000   WHERE nom = 'F/A-18 Super Hornet';   -- était 7,000,000
UPDATE public.types_avion SET prix = 21000000   WHERE nom = 'JAS 39 Gripen';         -- était 8,500,000
UPDATE public.types_avion SET prix = 22000000   WHERE nom = 'Eurofighter Typhoon';   -- était 9,000,000
UPDATE public.types_avion SET prix = 30000000   WHERE nom = 'F-35B';                 -- était 12,000,000
UPDATE public.types_avion SET prix = 35000000   WHERE nom = 'Sukhoi Su-57';          -- était 14,000,000
UPDATE public.types_avion SET prix = 38000000   WHERE nom = 'F-22 Raptor';           -- était 15,000,000
UPDATE public.types_avion SET prix = 50000000   WHERE nom = 'EC-18B';                -- était 20,000,000
UPDATE public.types_avion SET prix = 62000000   WHERE nom = 'Boeing P-8 Poseidon';   -- était 25,000,000
UPDATE public.types_avion SET prix = 67000000   WHERE nom = 'E-3 Sentry';            -- était 27,000,000
UPDATE public.types_avion SET prix = 70000000   WHERE nom = 'B-1 Lancer';            -- était 28,000,000
UPDATE public.types_avion SET prix = 88000000   WHERE nom = 'Boeing C-17 Globemaster III'; -- était 35,000,000
UPDATE public.types_avion SET prix = 200000000  WHERE nom = 'B-2 Spirit';            -- était 80,000,000

-- ============================================================
-- AVIONS MILITAIRES HISTORIQUES (×2)
-- ============================================================

UPDATE public.types_avion SET prix = 400000     WHERE nom = 'Fokker Dr1';            -- était 200,000
UPDATE public.types_avion SET prix = 800000     WHERE nom = 'A6M Zero';              -- était 400,000
UPDATE public.types_avion SET prix = 900000     WHERE nom = 'Hawker Hurricane';      -- était 450,000
UPDATE public.types_avion SET prix = 950000     WHERE nom = 'F4U Corsair';           -- était 480,000
UPDATE public.types_avion SET prix = 1000000    WHERE nom = 'P-51 Mustang';          -- était 500,000
UPDATE public.types_avion SET prix = 1100000    WHERE nom = 'P-38 Lightning';        -- était 550,000
UPDATE public.types_avion SET prix = 1200000    WHERE nom = 'MiG-15';               -- était 600,000
UPDATE public.types_avion SET prix = 2400000    WHERE nom = 'B-29 Superfortress';    -- était 1,200,000
UPDATE public.types_avion SET prix = 3000000    WHERE nom = 'English Electric Lightning'; -- était 1,500,000
UPDATE public.types_avion SET prix = 4000000    WHERE nom = 'F-4 Phantom';           -- était 2,000,000
UPDATE public.types_avion SET prix = 5500000    WHERE nom = 'Avro Vulcan';           -- était 2,500,000
UPDATE public.types_avion SET prix = 6500000    WHERE nom = 'Hawker Harrier';        -- était 3,000,000
UPDATE public.types_avion SET prix = 18000000   WHERE nom = 'C-130 Hercules';        -- était 8,000,000
UPDATE public.types_avion SET prix = 25000000   WHERE nom = 'SR-71 Blackbird';       -- était 10,000,000

-- ============================================================
-- AVIONS AMPHIBIES (×1.8)
-- ============================================================

UPDATE public.types_avion SET prix = 180000     WHERE nom = 'Piper Cub Amphibie';            -- était 100,000
UPDATE public.types_avion SET prix = 270000     WHERE nom = 'Cessna 172 Amphibie';            -- était 150,000
UPDATE public.types_avion SET prix = 400000     WHERE nom = 'Cessna 182 Amphibie';            -- était 220,000
UPDATE public.types_avion SET prix = 500000     WHERE nom = 'Cessna Caravan Amphibie';        -- était 300,000
UPDATE public.types_avion SET prix = 500000     WHERE nom = 'Cessna Caravan Cargo Amphibie';  -- était 280,000
UPDATE public.types_avion SET prix = 1400000    WHERE nom = 'DHC-6 Twin Otter Amphibie';      -- était 700,000

-- ============================================================
-- HÉLICOPTÈRES (×2)
-- ============================================================

UPDATE public.types_avion SET prix = 1200000    WHERE nom = 'Airbus H135';           -- était 600,000
UPDATE public.types_avion SET prix = 1600000    WHERE nom = 'Bell 412';              -- était 800,000
UPDATE public.types_avion SET prix = 4000000    WHERE nom = 'Sikorsky S-92';         -- était 1,800,000
UPDATE public.types_avion SET prix = 5500000    WHERE nom = 'UH-60 Black Hawk';      -- était 2,500,000
UPDATE public.types_avion SET prix = 9000000    WHERE nom = 'Chinook';               -- était 4,000,000

-- ============================================================
-- RAVITAILLEURS (×2.5)
-- ============================================================

UPDATE public.types_avion SET prix = 30000000   WHERE nom = 'KC-130';                -- était 12,000,000
UPDATE public.types_avion SET prix = 38000000   WHERE nom = 'KC-1';                  -- était 15,000,000
UPDATE public.types_avion SET prix = 45000000   WHERE nom = 'KC-707';                -- était 18,000,000
UPDATE public.types_avion SET prix = 55000000   WHERE nom = 'KC-767';                -- était 22,000,000
UPDATE public.types_avion SET prix = 62000000   WHERE nom = 'KC-10 Extender';        -- était 25,000,000
UPDATE public.types_avion SET prix = 70000000   WHERE nom = 'A330 MRTT';             -- était 28,000,000

-- ============================================================
-- VÉRIFICATION : Affichage des prix mis à jour
-- ============================================================
SELECT 
  categorie,
  nom,
  constructeur,
  prix AS nouveau_prix,
  capacite_pax,
  capacite_cargo_kg,
  CASE 
    WHEN capacite_pax > 0 THEN ROUND(prix::NUMERIC / (capacite_pax * 100))
    ELSE NULL
  END AS vols_rentabilisation
FROM public.types_avion
WHERE prix > 0
ORDER BY categorie, prix;
