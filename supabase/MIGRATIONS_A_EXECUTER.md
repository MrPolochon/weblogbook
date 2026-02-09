# Migrations à exécuter

## Ordre d'exécution recommandé

Exécutez ces migrations dans l'ordre sur votre base de données Supabase.
**Toujours faire une sauvegarde avant d'exécuter les migrations.**

---

## Migrations prioritaires

### 1. add_statut_annule_plans_vol.sql
**Priorité: CRITIQUE** | **Statut: À exécuter immédiatement**

Ajoute le statut `'annule'` à la contrainte `plans_vol_statut_check`. Sans cette migration, l'annulation des plans de vol échoue avec l'erreur : `violates check constraint "plans_vol_statut_check"`.

---

### 2. fix_pay_siavi_taxes.sql
**Priorité: CRITIQUE** | **Statut: À exécuter si SIAVI est actif**

Corrige la fonction `pay_siavi_taxes` qui créditait directement le compte au lieu de créer un chèque à encaisser. 

**Bug corrigé** : les agents SIAVI étaient crédités deux fois (une fois directement, une fois à l'encaissement).

---

### 3. add_remboursement_pret.sql  
**Priorité: NORMALE** | **Statut: À exécuter si prêts bancaires actifs**

Met à jour la politique RLS pour permettre au PDG de contribuer manuellement au remboursement d'un prêt bancaire.

---

## Migrations de base (à exécuter lors de l'installation initiale)

Si vous partez de zéro, exécutez dans l'ordre :

1. `schema.sql` - Schéma de base
2. `seed_avions_ptfs.sql` - Données des avions
3. Les fichiers `add_*.sql` selon les fonctionnalités souhaitées

---

## Notes sur les fichiers de migration Felitz

Les fichiers suivants sont des versions itératives du système Felitz Bank :
- `add_felitz_bank_system.sql` - Version initiale
- `MIGRATION_FELITZ_V2.sql` - Améliorations V2
- `MIGRATION_FELITZ_V3.sql` - Améliorations V3  
- `MIGRATION_FELITZ_COMPLETE.sql` - Version complète consolidée

**Recommandation** : Utiliser `MIGRATION_FELITZ_COMPLETE.sql` pour une nouvelle installation.

---

## Résumé des bugs corrigés (code)

| Bug | Fichiers modifiés |
|-----|-------------------|
| Annulation plans via modal contournait l'API | `PlansEnAttenteModal.tsx`, `api/plans-vol/[id]/route.ts` |
| Types TypeScript incomplets (Role, Profile) | `src/lib/types.ts` |
| Rôle SIAVI non sélectionnable | `EditPiloteForm.tsx`, `api/pilotes/[id]/route.ts` |
| Bug toggleMute SIAVI (inversé) | `SiaviTelephone.tsx` |
| Bug handleDelete téléphones | `SiaviTelephone.tsx`, `AtcTelephone.tsx` |
| Double encaissement chèques | `api/messages/[id]/route.ts` |
| Virements non atomiques | `api/felitz/virement/route.ts` |
| Transactions admin invisibles | `AdminFelitzClient.tsx` |
| Import useEffect inutilisé | `CreerPlanAtcForm.tsx` |

---

## Fonctionnalités ajoutées

| Fonctionnalité | Fichiers |
|----------------|----------|
| Plans en attente cliquables (modal) | `PlansEnAttenteModal.tsx` |
| ATC en ligne cliquables (modal) | `AtcEnLigneModal.tsx` |
| Mode spectateur ATC temps réel | `spectateur/[userId]/` |
| Remboursement manuel prêts PDG | `api/compagnies/[id]/pret/route.ts` |
| Animations page connexion | `login/page.tsx`, `globals.css` |
