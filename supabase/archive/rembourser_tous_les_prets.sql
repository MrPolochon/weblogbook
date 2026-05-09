-- ============================================================
-- Rembourser tous les prêts actifs (marquer comme entièrement remboursés)
-- Met à jour tous les prêts avec statut = 'actif' :
--   montant_rembourse = montant_total_du, statut = 'rembourse', rembourse_at = now()
-- Note : ce script ne débite pas les comptes Felitz des compagnies ;
-- il clôture uniquement les prêts en base. Pour un remboursement réel
-- (débit du compte + clôture), utiliser l’interface ou l’API par prêt.
-- À exécuter dans l’éditeur SQL Supabase (service role).
-- ============================================================

-- Optionnel : voir les prêts qui seront clôturés
-- SELECT id, compagnie_id, montant_emprunte, montant_total_du, montant_rembourse,
--        (montant_total_du - montant_rembourse) AS reste_du
-- FROM public.prets_bancaires
-- WHERE statut = 'actif';

UPDATE public.prets_bancaires
SET montant_rembourse = montant_total_du,
    statut = 'rembourse',
    rembourse_at = now()
WHERE statut = 'actif';

-- Vérification : plus aucun prêt actif
-- SELECT statut, count(*) FROM public.prets_bancaires GROUP BY statut;
