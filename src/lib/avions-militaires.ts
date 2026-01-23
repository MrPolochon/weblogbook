/**
 * Liste fixe des avions utilisables pour les vols militaires (Espace militaire).
 * Tri alphabétique pour l'affichage.
 * Basé sur les avions PTFS
 */
export const AVIONS_MILITAIRES = [
  // Chasseurs modernes
  'A-10 Warthog',
  'Eurofighter Typhoon',
  'F-14 Tomcat',
  'F-15E Strike Eagle',
  'F-16 Fighting Falcon',
  'F/A-18 Super Hornet',
  'F-22 Raptor',
  'F-35B',
  'Hawk T1',
  'JAS 39 Gripen',
  'Sukhoi Su-27',
  'Sukhoi Su-57',
  
  // Chasseurs historiques
  'A6M Zero',
  'English Electric Lightning',
  'F-4 Phantom',
  'F4U Corsair',
  'Fokker Dr1',
  'Hawker Hurricane',
  'MiG-15',
  'P-38 Lightning',
  'P-51 Mustang',
  
  // Bombardiers
  'Avro Vulcan',
  'B-1 Lancer',
  'B-2 Spirit',
  'B-29 Superfortress',
  'SR-71 Blackbird',
  
  // Transport militaire / VIP
  'Air Force One',
  'Boeing C-17 Globemaster III',
  'C-130 Hercules',
  
  // Surveillance / AWACS
  'Boeing P-8 Poseidon',
  'E-3 Sentry',
  'EC-18B',
  
  // VTOL
  'Hawker Harrier (VTOL)',
  
  // Ravitailleurs
  'A330 MRTT',
  'KC-1',
  'KC-10 Extender',
  'KC-130',
  'KC-707',
  'KC-767',
  
  // Hélicoptères militaires
  'Chinook',
  'UH-60 Black Hawk',
] as const;

export type NomAvionMilitaire = (typeof AVIONS_MILITAIRES)[number];

export const NATURES_VOL_MILITAIRE = [
  'entrainement',
  'escorte',
  'sauvetage',
  'reconnaissance',
  'autre',
] as const;

export type NatureVolMilitaire = (typeof NATURES_VOL_MILITAIRE)[number];
