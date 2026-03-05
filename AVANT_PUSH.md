# À faire avant de push / déploiement

Checklist des étapes à faire avant de pousser le code et de déployer (ou après un clone / nouveau serveur).

---

## 1. Dépendances

```bash
npm install
```

- Ajout du package **resend** pour l’envoi des codes de vérification par email.

---

## 2. Variables d’environnement

Copier `env.example.txt` vers `.env.local` et remplir. En production (ex. Vercel), ajouter les mêmes variables.

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Oui | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Oui | Clé anon Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Oui | Clé service_role Supabase |
| `RESEND_API_KEY` | Pour les codes email | Clé API Resend (https://resend.com) – si absente, les codes par email sont désactivés |
| `EMAIL_FROM` | Non | Adresse d’envoi (ex. `PTFS Logbook <noreply@domaine.com>`) – défaut Resend en dev |
| `SUPERADMIN_PASSWORD` | Selon usage | Mot de passe superadmin pour certaines actions sensibles |
| `LIVEKIT_*` | Si téléphone ATC/SIAVI | Variables LiveKit |

---

## 3. Migrations SQL Supabase

À exécuter dans l’ordre dans **Supabase → SQL Editor** (une seule fois par environnement, sauf scripts “one-shot” indiqués).

### Sécurité / connexion (récentes)

1. **`supabase/add_login_ip_security.sql`**  
   Colonnes `last_login_ip`, `last_login_at` sur `profiles` + type de message `alerte_connexion`.

2. **`supabase/add_login_email_verification.sql`**  
   Colonne `profiles.email` + table `login_verification_codes`.

3. **`supabase/add_login_pending_email.sql`**  
   Colonne `pending_email` sur `login_verification_codes` (email en attente de vérification).

4. **`supabase/add_site_config.sql`**  
   Table `site_config` (option “Connexions réservées aux admins” dans Admin > Sécurité).

### Scripts one-shot (si besoin)

- **`supabase/revoke_admin_except_mrpolochon.sql`** – Retirer le rôle admin à tous sauf `mrpolochon` (à lancer uniquement si tu veux faire ce nettoyage).
- **`supabase/reset_economie_felitz.sql`** – Remet tous les soldes Felitz à 0 et vide l’historique (uniquement si tu veux reset l’économie).

---

## 4. Vérifications rapides

- [ ] `npm run build` passe sans erreur.
- [ ] Optionnel : `npm run lint`.
- [ ] En local : test de connexion (identifiant + mot de passe puis code email si configuré).
- [ ] Admin > Sécurité : vérifier que le toggle “Connexions réservées aux admins” s’affiche et se met à jour (après avoir exécuté `add_site_config.sql`).

---

## 5. Après déploiement (prod)

- [ ] Ajouter les variables d’environnement sur la plateforme (ex. Vercel).
- [ ] Exécuter les mêmes migrations SQL sur le projet Supabase de prod (si différent du dev).
- [ ] Configurer Resend (domaine d’envoi, clé API) pour que les emails de code partent bien en prod.

---

## Résumé des fichiers SQL à exécuter (ordre)

```
add_login_ip_security.sql
add_login_email_verification.sql
add_login_pending_email.sql
add_site_config.sql
```

Les autres scripts du dossier `supabase/` dépendent de ton état de base déjà migrée ; suivre l’ordre des migrations existantes si tu pars de zéro.
