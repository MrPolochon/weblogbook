-- Option admin : activer/désactiver la détection de triche par formulaire AeroSchool

ALTER TABLE aeroschool_forms
  ADD COLUMN IF NOT EXISTS antitriche_enabled BOOLEAN NOT NULL DEFAULT true;
