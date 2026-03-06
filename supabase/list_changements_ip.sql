-- Liste de tous les changements d'IP : date, heure, compte, IP (ancienne → nouvelle), type d'appareil
-- À exécuter dans l'éditeur SQL Supabase (Dashboard > SQL Editor).
-- Nécessite d'avoir exécuté la migration add_login_ip_history.sql.

SELECT
  h.created_at AT TIME ZONE 'UTC' AS date_heure_utc,
  to_char(h.created_at AT TIME ZONE 'UTC', 'DD/MM/YYYY') AS date,
  to_char(h.created_at AT TIME ZONE 'UTC', 'HH24:MI:SS') AS heure,
  p.identifiant,
  p.role,
  h.previous_ip AS ip_precedente,
  h.ip AS nouvelle_ip,
  CASE
    WHEN h.user_agent IS NULL THEN '—'
    WHEN h.user_agent ~* 'bot|crawler|spider' THEN 'Bot'
    WHEN h.user_agent ~* 'mobile|android|iphone|ipad|webos' THEN 'Mobile'
    WHEN h.user_agent ~* 'tablet|ipad' THEN 'Tablette'
    ELSE 'Desktop'
  END AS type_appareil,
  left(h.user_agent, 80) AS user_agent_extrait
FROM public.login_ip_history h
JOIN public.profiles p ON p.id = h.user_id
ORDER BY h.created_at DESC;
