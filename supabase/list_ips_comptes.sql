-- Liste des IP de dernière connexion et comptes associés
-- À exécuter dans l'éditeur SQL Supabase (Dashboard > SQL Editor).
-- Les IP sont enregistrées après validation du code email (ou à la connexion si même IP que la dernière).

SELECT
  id,
  identifiant,
  last_login_ip,
  last_login_at,
  role
FROM public.profiles
WHERE last_login_ip IS NOT NULL
ORDER BY last_login_at DESC NULLS LAST;
