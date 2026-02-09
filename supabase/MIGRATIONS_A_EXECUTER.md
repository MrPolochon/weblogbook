# Migrations à exécuter

## Ordre d'exécution

Exécutez ces migrations dans l'ordre sur votre base de données Supabase.

---

### 1. fix_pay_siavi_taxes.sql
**Priorité: HAUTE** | **Fichier:** `supabase/fix_pay_siavi_taxes.sql`

Corrige la fonction `pay_siavi_taxes` qui créditait directement le compte au lieu de créer un chèque à encaisser. **Bug critique** : les agents SIAVI étaient crédités deux fois (une fois directement, une fois à l'encaissement).

---

### 2. add_remboursement_pret.sql
**Priorité: NORMALE** | **Fichier:** `supabase/add_remboursement_pret.sql`

Met à jour la politique RLS pour permettre au PDG de contribuer manuellement au remboursement d'un prêt bancaire.

---

## Résumé des changements (code)

### Bugs corrigés

| Bug | Fichier(s) modifié(s) |
|-----|----------------------|
| Rôle SIAVI non sélectionnable comme rôle principal | `EditPiloteForm.tsx`, `api/pilotes/[id]/route.ts` |
| Double encaissement de chèques (race condition) | `api/messages/[id]/route.ts` |
| Virements non atomiques | `api/felitz/virement/route.ts` |
| Délais WebRTC téléphone (500ms → 100ms) | `SiaviTelephone.tsx`, `AtcTelephone.tsx` |

### Nouvelles fonctionnalités

| Fonctionnalité | Fichier(s) |
|----------------|-----------|
| Remboursement manuel de prêt par le PDG | `api/compagnies/[id]/pret/route.ts`, `CompagniePretClient.tsx` |

---

## Notes

- **Toujours faire une sauvegarde** avant d'exécuter les migrations
- Les migrations sont idempotentes (peuvent être exécutées plusieurs fois)
- En cas d'erreur, vérifier les logs Supabase
