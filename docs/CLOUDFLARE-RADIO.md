# Radio et téléphonie sur Cloudflare

La radio du site, la téléphonie ATC/SIAVI, la radio Windows et la radio Android utilisent le même service Cloudflare Realtime SFU. Discord reste le vocal cockpit. L'hébergement Next.js, Supabase, les comptes et les données restent sur leurs services actuels.

**État au 23 novembre 2026 : Worker déployé sur `weblogbook-realtime.bonnofpf.workers.dev`, identifiants SFU/TURN validés par le script et route `/health` vérifiée. Le raccordement Vercel, la publication du site et une recette audio réelle restent nécessaires avant ouverture.**

## 1. Créer le compte et les ressources

1. Créer un compte sur <https://dash.cloudflare.com/sign-up> et confirmer l'adresse e-mail.
2. Dans **Realtime**, créer une application **SFU**. Conserver son **App ID** et son **App Secret** dans le gestionnaire de secrets.
3. Créer également une clé **TURN** et conserver le **Key ID** et le **API Token** associé. TURN permet de fonctionner sur les réseaux qui bloquent les connexions directes.
4. Générer un secret aléatoire d'au moins 32 caractères pour signer les accès radio. Le même secret doit être installé sur le serveur Next.js et le Worker.

Ne pas mettre ces valeurs dans le navigateur, une variable `NEXT_PUBLIC_*`, un commit, une capture d'écran ou une conversation. Les identifiants TURN transmis aux clients sont temporaires ; les clés de génération restent côté serveur.

Documentation officielle : [SFU](https://developers.cloudflare.com/realtime/sfu/), [clés TURN](https://developers.cloudflare.com/realtime/turn/generate-credentials/), [tarification](https://developers.cloudflare.com/realtime/sfu/platform/pricing/).

## 2. Déployer le Worker

Sous Windows, `realtime-worker/setup.ps1` automatise l'installation de Wrangler, la connexion Cloudflare, les tests du Worker, la vérification des identifiants SFU/TURN, le déploiement et l'installation des cinq secrets. Il demande les identifiants et les deux secrets avec une saisie masquée pour ces derniers. Exécuter depuis un terminal PowerShell normal ayant accès à Internet :

```powershell
cd realtime-worker
.\setup.ps1
```

Le secret partagé avec le site est généré automatiquement et conservé chiffré avec Windows DPAPI dans `.setup/site-secret.dpapi`, exclu de Git. Il est réutilisé aux exécutions suivantes. Sans cette sauvegarde, un Worker déjà configuré nécessite de ressaisir son secret existant, pour éviter une rotation involontaire. Ne pas effacer `.setup` avant d'avoir conservé le secret dans votre gestionnaire de mots de passe. Les secrets SFU/TURN ne sont pas conservés localement par ce script.

Pour copier le secret de signature dans le presse-papiers sans l'afficher dans le terminal : `./setup.ps1 -CopySiteSecret`. Le coller uniquement dans `CLOUDFLARE_REALTIME_SECRET` chez l'hébergeur du site, puis vider le presse-papiers. La vérification HTTP de fin de script ne remplace pas les essais audio.

En cas d'échec SFU/TURN, lancer `./setup.ps1 -CheckCredentials` : ce mode vérifie les deux ressources sans réinstaller Wrangler, sans connexion Wrangler et sans déployer. Il affiche séparément `SFU OK/ECHEC` et `TURN OK/ECHEC`, le code HTTP ou la catégorie réseau/TLS, sans afficher les clés ni la réponse brute. La vérification HTTPS utilise Node pour éviter les réglages TLS anciens de Windows PowerShell 5.1. Un refus 401/403 invite à vérifier le secret associé à la ressource concernée, pas à recréer systématiquement les deux ressources.

Installation manuelle alternative :

Depuis le dossier `realtime-worker` :

```powershell
npm install
npx wrangler login
npx wrangler deploy
npx wrangler secret put SFU_APP_ID
npx wrangler secret put SFU_APP_SECRET
npx wrangler secret put TURN_KEY_ID
npx wrangler secret put TURN_API_TOKEN
npx wrangler secret put REALTIME_TICKET_SECRET
```

Chaque commande `secret put` demande la valeur dans le terminal. Le déploiement crée le Worker et la classe Durable Object `RadioRoom`. Aucun transfert DNS du domaine du site n'est nécessaire.

`ALLOWED_ORIGINS` dans `wrangler.jsonc` contient les deux origines HTTPS du site. `null` et `file://` permettent le client Electron ; une origine acceptée ne remplace jamais le ticket signé. Ajouter explicitement l'origine d'un éventuel site de préproduction. Ne pas utiliser `*`.

La limite initiale est de **100 connexions par fréquence**, configurable par `MAX_ROOM_MEMBERS` (maximum de protection : 200). Les appels privés sont limités à deux connexions. Ce plafond est une limite applicative, pas une validation de capacité réalisée avec 100 appareils.

## 3. Configurer le serveur du site

Dans les variables serveur de l'hébergeur actuel :

| Variable | Valeur |
| --- | --- |
| `CLOUDFLARE_REALTIME_URL` | `wss://weblogbook-realtime.bonnofpf.workers.dev/connect` |
| `CLOUDFLARE_REALTIME_SECRET` | Exactement le même secret que `REALTIME_TICKET_SECRET` |
| `NEXT_PUBLIC_APP_URL` | URL HTTPS canonique du site, déjà utilisée pour les origines autorisées |

Reconstruire et redéployer le site après configuration : la CSP autorise uniquement l'origine du Worker configurée au moment du build. Le site émet des tickets valables 60 secondes, utilisables une fois et liés à une fréquence ou à un appel autorisé. La session établie n'est pas limitée à 60 secondes.

L'App Secret SFU et le token TURN ne sont nécessaires que dans le Worker. Aucune migration SQL n'est nécessaire. Les accès aux appels privés sont vérifiés dans `atc_calls` avec l'identité Supabase existante.

## 4. Mettre à jour les clients

- Web : `/api/realtime/join` et le transport natif WebRTC Cloudflare remplacent le SDK LiveKit.
- Windows : reconstruire `vhf-radio-app` et distribuer cette version avec le site.
- Android : reconstruire `vhf-radio-android`, tester sur un téléphone et distribuer la nouvelle version. Le bouton flottant utilise le nouveau moteur natif.
- Les anciennes applications LiveKit ne peuvent pas rejoindre les salons Cloudflare. L'ancienne route retourne **410** et demande une mise à jour. Prévoir une bascule coordonnée.

Ne résilier l'ancien service LiveKit et ne supprimer ses secrets de production qu'après la recette. Le nouveau code ne les utilise plus.

## 5. Comportement de la COM box

- La connexion commence en **écoute seule**, sans demander le microphone dans la COM box web.
- **Push-to-talk** : le son passe uniquement pendant l'appui. Relâcher le bouton coupe immédiatement le gain audio ; les dialogues cockpit restent hors radio.
- **Micro ouvert** : choix explicite, qui transmet aussi les paroles cockpit. Le navigateur ne sait pas distinguer à qui l'utilisateur s'adresse.
- **Micro coupé** : arrêt de la capture matérielle sur le site.
- Le raccourci clavier est facultatif et fonctionne lorsque le site a le focus. Un site web ne peut pas intercepter une touche globale pendant que Roblox a le focus.
- Une perte de connexion, un changement de fréquence ou une déconnexion remet le micro au repos. Le mode ouvert n'est pas restauré automatiquement.
- Utiliser un casque pour éviter que le microphone reprenne le son Discord provenant des haut-parleurs.

Le micro brut n'est jamais envoyé par la COM box : il passe par un gain initialement nul. Les applications natives publient une piste désactivée avant toute émission. Chaque client utilise une connexion WebRTC pour publier et une autre pour recevoir ; les négociations SDP du récepteur sont sérialisées.

## 6. Vérifications avant ouverture

```powershell
node --test scripts/test-combox-radio.cjs scripts/test-cloudflare-client.cjs scripts/test-cloudflare-join.cjs scripts/test-atc-phone-keyboard.cjs
cd realtime-worker
npm test
# Windows : tests du script de configuration sans reseau ni vrais secrets
.\test\setup.tests.ps1
```

Puis effectuer une recette avec de vrais identifiants de préproduction et au moins deux comptes :

1. Pilote web et contrôleur web sur la même fréquence : son dans les deux sens, volumes, participants, maintien/relâchement PTT.
2. Deux fréquences différentes : aucun audio croisé. Appel privé : un troisième compte doit recevoir un refus.
3. Refus micro, autorisation accordée après annulation, changement de micro, perte de réseau, changement rapide de fréquence et fermeture d'onglet : aucune émission résiduelle.
4. Windows, Android et navigateur ensemble ; Wi-Fi, réseau mobile et un réseau nécessitant TURN ; Bluetooth et bouton flottant Android.
5. Discord cockpit en parallèle : le contrôleur n'entend les paroles que pendant PTT, sauf choix explicite du micro ouvert.
6. Essai progressif à 10 puis 50 participants. Mesurer les pertes, la latence, le CPU des clients, les erreurs Worker et les octets facturés.

Les tests automatiques simulent les échanges et vérifient les droits, les coupures et la négociation. Ils ne remplacent pas un appel réel ni un test de charge réseau.

Validation effectuée dans la copie de travail : tests ciblés, TypeScript web/Windows et lint des nouveaux composants. Le moteur Kotlin a également été compilé séparément contre l'API WebRTC déjà disponible localement. La compilation APK complète avec la nouvelle dépendance et l'essai audio réel restent à effectuer : l'environnement de travail bloque la connexion au processus Gradle et le téléchargement de la nouvelle dépendance.

## Coûts et exploitation

Consulter les tarifs Cloudflare en vigueur avant activation : le transport SFU/TURN est facturé au volume sortant, et le Worker/Durable Object possède sa propre tarification. La consommation dépend notamment du nombre de destinataires, du temps connecté et du temps d'émission. Le silence Opus/DTX limite le trafic mais ne rend pas tous les flux gratuits. Activer les alertes d'usage proposées dans le compte.

Le Worker n'enregistre pas l'audio. Il conserve les participants et les négociations dans les pièces jointes des WebSockets pour supporter l'hibernation. Il retire une connexion dont les battements de présence cessent et ferme ses pistes SFU. Une réponse de négociation ambiguë provoque une déconnexion, pas une répétition aveugle de la requête.
