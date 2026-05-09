-- Liste des IP de dernière connexion et comptes associés
-- À exécuter dans l'éditeur SQL Supabase (Dashboard > SQL Editor).
-- Les IP sont stockées dans user_login_tracking (table protégée, non lisible par les comptes utilisateur).

SELECT
  p.id,
  p.identifiant,
  t.last_login_ip,
  t.last_login_at,
  p.role
FROM public.profiles p
JOIN public.user_login_tracking t ON t.user_id = p.id
WHERE t.last_login_ip IS NOT NULL
ORDER BY t.last_login_at DESC NULLS LAST;
