# Bot assistance Discord (tickets)

Processus **séparé** des bots ATIS.

## Variables

- `SUPPORT_BOT_TOKEN` — token de l’application Discord dédiée
- `SUPPORT_BOT_SECRET` — même secret que sur Vercel (`x-support-bot-secret`)
- `WEBLOGBOOK_URL` — URL du site (sans slash final)
- Sur Vercel : `SUPPORT_BOT_TOKEN`, `SUPPORT_BOT_SECRET`, optionnel `SUPPORT_LLM_API_KEY` / `OPENAI_API_KEY`

## Lancer

```bash
pip install -r requirements.txt
python main.py
```

## Config site

Admin → Bot assistance Discord : IDs serveur / panel / logs / rôle staff, puis **Créer panel + sections**.
