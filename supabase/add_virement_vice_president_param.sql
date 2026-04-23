-- Autorise ou non les vice-présidents à effectuer des virements depuis le compte Felitz de l'alliance (sinon seul le président peut le faire). Défaut : true (comportement historique).
ALTER TABLE public.alliance_parametres
  ADD COLUMN IF NOT EXISTS virement_vice_president_autorise BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.alliance_parametres.virement_vice_president_autorise IS
  'Si true, les vice-présidents peuvent virement depuis le compte alliance. Si false, réservé au président.';
