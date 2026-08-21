# Bot assistance Discord (tickets)

Processus **séparé** des bots ATIS. Ne parle que dans les salons ticket.

## Créer l’application Discord (à faire une fois)

1. https://discord.com/developers/applications → **New Application** (nom ex. `Mixou Assistance`).
2. Onglet **Bot** → Add Bot → Reset Token → **copier le token** (`SUPPORT_BOT_TOKEN`).
3. Activer les **Privileged Gateway Intents** : Server Members Intent, Message Content Intent.
4. OAuth2 → URL Generator :
   - Scopes : `bot`, `applications.commands`
   - Permissions : View Channels, Send Messages, Embed Links, Attach Files, Read Message History, Manage Channels, Manage Roles (ou au minimum Manage Channels), Mention Everyone (pour ping le rôle staff si le rôle n’est pas « mentionnable »).
5. Ouvrir l’URL, inviter le bot **sur le serveur Mixou**.
6. Copier : ID serveur, ID du salon panel, ID du salon logs, ID du rôle staff.

## Variables

### Processus Python (Render / VPS)

| Variable | Rôle |
|---|---|
| `SUPPORT_BOT_TOKEN` | Token du **nouveau** bot (pas ATIS) |
| `SUPPORT_BOT_SECRET` | Secret partagé avec le site (choisis une longue chaîne) |
| `WEBLOGBOOK_URL` | `https://mixouairlinesptfsweblogbook.com` |

### Vercel (site)

| Variable | Rôle |
|---|---|
| `SUPPORT_BOT_TOKEN` | **Le même** token (création salons / panel / transcripts) |
| `SUPPORT_BOT_SECRET` | **Le même** secret |
| `GROQ_API_KEY` | Clé Groq (recommandé, volume) |
| `SUPPORT_LLM_MODEL` | optionnel, défaut Groq : `llama-3.3-70b-versatile` |
| `CRON_SECRET` | déjà utilisé : relances inactivité 6 h |

## Lancer le process

```bash
cd support-bot
pip install -r requirements.txt
cp .env.example .env   # remplir
python main.py
```

Ou Docker : `docker build -t mixou-support-bot . && docker run --env-file .env mixou-support-bot`

Hébergement type **Render Background Worker** / Railway / un VPS, **pas** Vercel (le bot doit rester connecté en gateway).

## Config sur le site

Admin connecté → **Bot assistance Discord** : coller les 4 IDs, **Enregistrer**, puis **Créer panel + sections**.
Le rôle staff doit pouvoir être ping (rôle mentionnable, ou permission Mention Everyone au bot).
