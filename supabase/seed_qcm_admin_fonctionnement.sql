-- ============================================================
-- Module de questions : Administration & Fonctionnement — MIXOU AIRLINES PTFS
-- Version : V1.0.0 — 300 questions (QCM, 1 bonne réponse).
-- Banque pour AeroSchool (aeroschool_question_modules).
-- Couvre : gestion pilotes, ATC, plans de vol, compagnies, alliances,
--          finances, Discord, incidents, AeroSchool, SIAVI, bot ATIS,
--          réparation, marketplace, problèmes courants et résolutions.
-- ============================================================

INSERT INTO aeroschool_question_modules (title, questions)
SELECT
  'Administration & Fonctionnement du site — Certification Admin',
  $adm$[
  {
    "id": "adm-001",
    "title": "Sur quelle plateforme est hébergé le site weblogbook ?",
    "options": ["Heroku", "Vercel", "AWS EC2", "Netlify"],
    "correct_answers": ["Vercel"]
  },
  {
    "id": "adm-002",
    "title": "Quelle base de données est utilisée par le site ?",
    "options": ["MySQL", "MongoDB", "Supabase (PostgreSQL)", "Firebase"],
    "correct_answers": ["Supabase (PostgreSQL)"]
  },
  {
    "id": "adm-003",
    "title": "Où est hébergé le bot ATIS ?",
    "options": ["Render", "Heroku", "Railway", "AWS Lambda"],
    "correct_answers": ["Railway"]
  },
  {
    "id": "adm-004",
    "title": "Quelle variable d'environnement sur Vercel pointe vers le bot ATIS ?",
    "options": ["BOT_URL", "ATIS_BOT_URL", "ATIS_WEBHOOK_URL", "DISCORD_BOT_ENDPOINT"],
    "correct_answers": ["ATIS_WEBHOOK_URL"]
  },
  {
    "id": "adm-005",
    "title": "Quelle page admin permet de diagnostiquer le bot ATIS ?",
    "options": ["/admin/discord", "/admin/atis", "/admin/atis-bots", "/admin/bots"],
    "correct_answers": ["/admin/atis-bots"]
  },
  {
    "id": "adm-006",
    "title": "Quel secret partagé authentifie les appels entre le site et le bot ATIS ?",
    "options": ["ATIS_BOT_KEY", "ATIS_WEBHOOK_SECRET", "BOT_SHARED_TOKEN", "DISCORD_BOT_SECRET"],
    "correct_answers": ["ATIS_WEBHOOK_SECRET"]
  },
  {
    "id": "adm-007",
    "title": "Que faire en premier si le bot ATIS ne répond plus ?",
    "options": [
      "Supprimer et recréer l'application Discord",
      "Redémarrer le service sur Railway et vérifier les logs",
      "Modifier la variable ATIS_WEBHOOK_URL sur Vercel",
      "Contacter le support Vercel"
    ],
    "correct_answers": ["Redémarrer le service sur Railway et vérifier les logs"]
  },
  {
    "id": "adm-008",
    "title": "Quelle page admin liste tous les pilotes enregistrés sur le site ?",
    "options": ["/admin/comptes", "/admin/utilisateurs", "/admin/pilotes", "/admin/membres"],
    "correct_answers": ["/admin/pilotes"]
  },
  {
    "id": "adm-009",
    "title": "Comment créer un nouveau compte pilote depuis l'interface admin ?",
    "options": [
      "Via /admin/pilotes → bouton 'Créer un pilote'",
      "Directement dans la base Supabase",
      "En envoyant une invitation par email via Discord",
      "Via la commande /webregister du bot Discord"
    ],
    "correct_answers": ["Via /admin/pilotes → bouton 'Créer un pilote'"]
  },
  {
    "id": "adm-010",
    "title": "Que se passe-t-il si un pilote a le rôle 'atc' sur le site ?",
    "options": [
      "Il peut accéder à l'espace pilote ET l'espace ATC",
      "Il est automatiquement redirigé vers /atc lors de la connexion",
      "Il perd l'accès au logbook pilote",
      "Il peut valider les vols des autres pilotes"
    ],
    "correct_answers": ["Il est automatiquement redirigé vers /atc lors de la connexion"]
  },
  {
    "id": "adm-011",
    "title": "Quel champ du profil permet de bloquer temporairement un pilote ?",
    "options": ["blocked_reason", "suspended_until", "blocked_until", "ban_expires_at"],
    "correct_answers": ["blocked_until"]
  },
  {
    "id": "adm-012",
    "title": "Qu'est-ce que le champ 'block_reason' commençant par 'DISCORD:' indique ?",
    "options": [
      "Le pilote a été banni de Discord",
      "Le blocage vient d'une sanction Discord synchronisée",
      "Le pilote a violé les règles Discord",
      "Le compte Discord du pilote a été supprimé"
    ],
    "correct_answers": ["Le blocage vient d'une sanction Discord synchronisée"]
  },
  {
    "id": "adm-013",
    "title": "Un pilote signale ne plus pouvoir se connecter. Quelle est la première vérification ?",
    "options": [
      "Vérifier son mot de passe dans la base",
      "Regarder son statut Discord dans /admin/pilotes/[id]",
      "Lui envoyer un lien de reset par email",
      "Vérifier si le site est en maintenance"
    ],
    "correct_answers": ["Regarder son statut Discord dans /admin/pilotes/[id]"]
  },
  {
    "id": "adm-014",
    "title": "Un pilote est bloqué sur /discord-obligatoire alors qu'il est dans le serveur Discord. Que faire ?",
    "options": [
      "Lui demander de se reconnecter dans 24h",
      "Cliquer sur 'Forcer re-sync Discord' dans /admin/pilotes/[id]",
      "Supprimer et recréer son compte",
      "Modifier manuellement son token Discord"
    ],
    "correct_answers": ["Cliquer sur 'Forcer re-sync Discord' dans /admin/pilotes/[id]"]
  },
  {
    "id": "adm-015",
    "title": "Quand le bot Discord est down et que des utilisateurs sont bloqués, quel est le bon réflexe admin ?",
    "options": [
      "Supprimer et recréer les comptes bloqués",
      "Contacter l'hébergeur du bot pour intervention d'urgence",
      "Redémarrer le bot Railway puis utiliser le bouton 'Forcer re-sync Discord' pour chaque utilisateur bloqué",
      "Attendre que le bot redémarre automatiquement sans intervention"
    ],
    "correct_answers": ["Redémarrer le bot Railway puis utiliser le bouton 'Forcer re-sync Discord' pour chaque utilisateur bloqué"]
  },
  {
    "id": "adm-016",
    "title": "Que signifie le statut Discord 'missing_guild' ?",
    "options": [
      "Le compte Discord n'est pas lié",
      "Le compte Discord n'est plus présent sur le serveur requis",
      "Le rôle Discord requis est manquant",
      "Le bot ne peut pas contacter Discord"
    ],
    "correct_answers": ["Le compte Discord n'est plus présent sur le serveur requis"]
  },
  {
    "id": "adm-017",
    "title": "Que signifie le statut Discord 'missing_role' ?",
    "options": [
      "Le compte Discord n'est pas lié au site",
      "Le compte Discord est présent sur le serveur mais n'a pas le rôle requis",
      "L'utilisateur n'a pas de rôle sur le site",
      "Le bot ne peut pas vérifier le rôle"
    ],
    "correct_answers": ["Le compte Discord est présent sur le serveur mais n'a pas le rôle requis"]
  },
  {
    "id": "adm-018",
    "title": "Quelle variable d'environnement active l'obligation de lier Discord ?",
    "options": ["DISCORD_REQUIRED=true", "DISCORD_LINK_REQUIRED=true", "FORCE_DISCORD=true", "DISCORD_MANDATORY=1"],
    "correct_answers": ["DISCORD_LINK_REQUIRED=true"]
  },
  {
    "id": "adm-019",
    "title": "Quel endpoint reçoit les mises à jour de modération Discord depuis le bot ?",
    "options": [
      "/api/discord/sync",
      "/api/discord/moderation-sync",
      "/api/discord/update",
      "/api/bot/moderation"
    ],
    "correct_answers": ["/api/discord/moderation-sync"]
  },
  {
    "id": "adm-020",
    "title": "Que se passe-t-il si le bot Railway est down et qu'un utilisateur lie son Discord ?",
    "options": [
      "La liaison échoue et l'utilisateur voit une erreur",
      "L'utilisateur obtient un accès temporaire (fail-open) jusqu'à la prochaine sync",
      "L'utilisateur est bloqué jusqu'au redémarrage du bot",
      "Le site utilise un bot de secours"
    ],
    "correct_answers": ["L'utilisateur obtient un accès temporaire (fail-open) jusqu'à la prochaine sync"]
  },
  {
    "id": "adm-021",
    "title": "Quelle page admin permet de gérer les IPs suspectes et les tentatives de connexion anormales ?",
    "options": [
      "/admin/logs",
      "/admin/securite",
      "/admin/ips",
      "/admin/pilotes"
    ],
    "correct_answers": ["/admin/securite"]
  },
  {
    "id": "adm-022",
    "title": "Que fait login_admin_only dans la table site_config ?",
    "options": [
      "Empêche la création de nouveaux comptes",
      "Restreint les connexions aux administrateurs uniquement",
      "Active le mode maintenance",
      "Désactive l'authentification 2FA"
    ],
    "correct_answers": ["Restreint les connexions aux administrateurs uniquement"]
  },
  {
    "id": "adm-023",
    "title": "Quels sont les statuts possibles d'un plan de vol ?",
    "options": [
      "actif, terminé, annulé",
      "depose, en_attente, accepte, en_cours, en_attente_cloture, cloture, annule",
      "nouveau, en_vol, fini",
      "créé, validé, archivé"
    ],
    "correct_answers": ["depose, en_attente, accepte, en_cours, en_attente_cloture, cloture, annule"]
  },
  {
    "id": "adm-024",
    "title": "Que signifie le statut 'en_attente_cloture' pour un plan de vol ?",
    "options": [
      "Le pilote a demandé la clôture, l'ATC doit confirmer",
      "L'ATC attend que le pilote atterrisse",
      "La clôture a échoué et doit être relancée",
      "Le plan est en attente de validation admin"
    ],
    "correct_answers": ["Le pilote a demandé la clôture, l'ATC doit confirmer"]
  },
  {
    "id": "adm-025",
    "title": "Qu'est-ce qu'un plan en 'automonitoring' ?",
    "options": [
      "Un plan géré automatiquement par le système sans ATC",
      "Un plan suivi par l'AFIS SIAVI",
      "Un plan transféré en autosurveillance sans contrôleur actif",
      "Un plan archivé automatiquement"
    ],
    "correct_answers": ["Un plan transféré en autosurveillance sans contrôleur actif"]
  },
  {
    "id": "adm-026",
    "title": "Un admin peut-il annuler un plan de vol clôturé ?",
    "options": [
      "Oui, depuis /admin/plans-vol",
      "Non, un plan clôturé ne peut plus être modifié",
      "Oui, mais seulement dans les 24h",
      "Oui, uniquement si aucun vol n'a été enregistré"
    ],
    "correct_answers": ["Non, un plan clôturé ne peut plus être modifié"]
  },
  {
    "id": "adm-027",
    "title": "Quel outil de strip ATC permet de voir tous les vols actifs sur la carte ?",
    "options": ["Le radar ATC", "L'ODW (Œil Du Web)", "Le plan de vol global", "Le dashboard SIAVI"],
    "correct_answers": ["L'ODW (Œil Du Web)"]
  },
  {
    "id": "adm-028",
    "title": "Que signifie 'DUPE SQUAWK' sur un strip ATC ?",
    "options": [
      "Le squawk est un code d'urgence",
      "Deux avions en mode C utilisent le même code transpondeur",
      "Le transpondeur est en panne",
      "Le squawk n'a pas été saisi par le pilote"
    ],
    "correct_answers": ["Deux avions en mode C utilisent le même code transpondeur"]
  },
  {
    "id": "adm-029",
    "title": "Qu'est-ce que le transpondeur Mode S apporte par rapport au Mode C ?",
    "options": [
      "Une portée radio plus longue",
      "L'identification individuelle de l'aéronef en plus de l'altitude",
      "Un signal GPS plus précis",
      "La possibilité de parler à l'ATC"
    ],
    "correct_answers": ["L'identification individuelle de l'aéronef en plus de l'altitude"]
  },
  {
    "id": "adm-030",
    "title": "Si deux avions en Mode S ont le même squawk, que se passe-t-il sur les strips ?",
    "options": [
      "Les deux strips sont glitchés avec alerte DUPE",
      "Rien, le Mode S peut différencier les aéronefs donc pas d'alerte",
      "Un seul strip est mis en évidence",
      "Les strips passent en rouge"
    ],
    "correct_answers": ["Rien, le Mode S peut différencier les aéronefs donc pas d'alerte"]
  },
  {
    "id": "adm-031",
    "title": "Comment un ATC prend-il en charge un plan de vol ?",
    "options": [
      "En cliquant 'Accepter' depuis le strip",
      "En validant depuis /admin/plans-vol",
      "Le plan est automatiquement assigné",
      "En tapant /prendre dans le chat Discord"
    ],
    "correct_answers": ["En cliquant 'Accepter' depuis le strip"]
  },
  {
    "id": "adm-032",
    "title": "Quelle action de strip ATC crée un incident de vol ?",
    "options": [
      "'Urgence' ou 'CRASH'",
      "'Annuler vol'",
      "'Refuser'",
      "'Transférer'"
    ],
    "correct_answers": ["'Urgence' ou 'CRASH'"]
  },
  {
    "id": "adm-033",
    "title": "Que se passe-t-il avec l'avion de compagnie lors d'un crash signalé par l'ATC ?",
    "options": [
      "L'avion est immédiatement détruit",
      "L'avion est bloqué en attente d'examen par le staff",
      "L'avion est remis en état automatiquement",
      "L'avion est retiré de la flotte de la compagnie"
    ],
    "correct_answers": ["L'avion est bloqué en attente d'examen par le staff"]
  },
  {
    "id": "adm-034",
    "title": "Quelles décisions peut prendre un admin ou agent IFSA sur un incident de vol ?",
    "options": [
      "Valider ou annuler",
      "Remettre en état, détruire ou ne rien faire",
      "Suspendre le pilote ou rembourser",
      "Archiver ou supprimer"
    ],
    "correct_answers": ["Remettre en état, détruire ou ne rien faire"]
  },
  {
    "id": "adm-035",
    "title": "Que fait la décision 'aucune_action' sur un incident de vol ?",
    "options": [
      "L'avion est remis en état à 100%",
      "L'incident est archivé sans toucher à l'avion",
      "L'avion est débloqué avec son usure actuelle sans modification",
      "L'incident est rouvert pour réexamen"
    ],
    "correct_answers": ["L'avion est débloqué avec son usure actuelle sans modification"]
  },
  {
    "id": "adm-036",
    "title": "Que se passe-t-il avec les photos uploadées sur un incident quand il est clôturé ?",
    "options": [
      "Elles sont archivées dans un bucket privé",
      "Elles sont supprimées automatiquement du storage",
      "Elles restent disponibles indéfiniment",
      "Elles sont transférées au pilote concerné"
    ],
    "correct_answers": ["Elles sont supprimées automatiquement du storage"]
  },
  {
    "id": "adm-037",
    "title": "Qu'est-ce qu'un NOTAM permanent sur le site ?",
    "options": [
      "Un NOTAM qui ne peut pas être supprimé",
      "Un NOTAM sans date d'expiration, actif jusqu'à suppression manuelle",
      "Un NOTAM automatiquement renouvelé tous les 30 jours",
      "Un NOTAM visible uniquement par les admins"
    ],
    "correct_answers": ["Un NOTAM sans date d'expiration, actif jusqu'à suppression manuelle"]
  },
  {
    "id": "adm-038",
    "title": "Qui peut créer et supprimer des NOTAMs ?",
    "options": [
      "Uniquement les administrateurs",
      "Les pilotes avec plus de 100 heures de vol",
      "Les administrateurs et les agents IFSA",
      "N'importe quel utilisateur connecté"
    ],
    "correct_answers": ["Les administrateurs et les agents IFSA"]
  },
  {
    "id": "adm-039",
    "title": "Qu'est-ce que le code équipement ICAO Item 10b sur un strip ATC ?",
    "options": [
      "Le type d'avion (Boeing, Airbus...)",
      "Le code de surveillance indiquant le type de transpondeur (/C ou /S)",
      "Le niveau de vol assigné",
      "Le code de la compagnie aérienne"
    ],
    "correct_answers": ["Le code de surveillance indiquant le type de transpondeur (/C ou /S)"]
  },
  {
    "id": "adm-040",
    "title": "Quel bucket Supabase Storage est utilisé pour les photos publiques (avatars, logos, incidents) ?",
    "options": ["avatars", "public-media", "cartes-identite", "images"],
    "correct_answers": ["cartes-identite"]
  },
  {
    "id": "adm-041",
    "title": "Qu'est-ce que la Felitz Bank ?",
    "options": [
      "Une banque réelle partenaire du serveur",
      "Le système de monnaie virtuelle du jeu PTFS",
      "Un système de paiement par virement Discord",
      "Un outil de gestion des abonnements"
    ],
    "correct_answers": ["Le système de monnaie virtuelle du jeu PTFS"]
  },
  {
    "id": "adm-042",
    "title": "Qu'est-ce qu'un VBAN dans la Felitz Bank ?",
    "options": [
      "Un code de validation bancaire",
      "Un numéro de compte virtuel unique par utilisateur ou entité",
      "Un virement automatique bancaire",
      "Un bonus annuel de la banque"
    ],
    "correct_answers": ["Un numéro de compte virtuel unique par utilisateur ou entité"]
  },
  {
    "id": "adm-043",
    "title": "Comment les salaires des pilotes d'une compagnie sont-ils distribués ?",
    "options": [
      "Manuellement par le PDG chaque semaine",
      "Automatiquement à la clôture de chaque vol commercial via un chèque en messagerie",
      "Via un virement mensuel programmé",
      "Lors de la validation des vols par un admin"
    ],
    "correct_answers": ["Automatiquement à la clôture de chaque vol commercial via un chèque en messagerie"]
  },
  {
    "id": "adm-044",
    "title": "Qu'est-ce que le marché passagers sur le site ?",
    "options": [
      "Un forum d'annonces pour recruter des pilotes",
      "Un système dynamique de demande de passagers par liaison aéroportuaire",
      "Un classement des vols les plus populaires",
      "Une place de marché pour vendre des billets d'avion"
    ],
    "correct_answers": ["Un système dynamique de demande de passagers par liaison aéroportuaire"]
  },
  {
    "id": "adm-045",
    "title": "Comment fonctionne le Hangar Market ?",
    "options": [
      "Les pilotes achètent des hangars pour stocker leurs avions",
      "Les compagnies peuvent revendre leurs avions d'occasion, soumis à validation admin",
      "Les pilotes louent des avions à d'autres compagnies",
      "C'est une boutique d'avions neufs"
    ],
    "correct_answers": ["Les compagnies peuvent revendre leurs avions d'occasion, soumis à validation admin"]
  },
  {
    "id": "adm-046",
    "title": "Qu'est-ce qu'un vol ferry sur le site ?",
    "options": [
      "Un vol transocéanique",
      "Un vol de repositionnement sans passagers ni cargo",
      "Un vol de formation pour les pilotes débutants",
      "Un vol d'urgence médicale"
    ],
    "correct_answers": ["Un vol de repositionnement sans passagers ni cargo"]
  },
  {
    "id": "adm-047",
    "title": "Qui paie les frais du vol ferry automatique lors d'une réparation d'avion ?",
    "options": [
      "L'entreprise de réparation",
      "La compagnie propriétaire de l'avion",
      "Le système déduit automatiquement de la Felitz Bank centrale",
      "Le pilote qui a provoqué la panne"
    ],
    "correct_answers": ["La compagnie propriétaire de l'avion"]
  },
  {
    "id": "adm-048",
    "title": "Qu'est-ce que l'usure (usure_percent) d'un avion de compagnie ?",
    "options": [
      "Le pourcentage de carburant restant",
      "L'état de l'avion : 100% = neuf, 0% = à réparer",
      "Le nombre de vols effectués par rapport à la capacité maximale",
      "La durée de vie restante en heures"
    ],
    "correct_answers": ["L'état de l'avion : 100% = neuf, 0% = à réparer"]
  },
  {
    "id": "adm-049",
    "title": "Que se passe-t-il quand l'usure d'un avion atteint 0% ?",
    "options": [
      "L'avion est automatiquement détruit",
      "L'avion est bloqué et doit être envoyé en réparation",
      "L'avion continue de voler normalement",
      "Le PDG reçoit une alerte par email"
    ],
    "correct_answers": ["L'avion est bloqué et doit être envoyé en réparation"]
  },
  {
    "id": "adm-050",
    "title": "Qu'est-ce que le SIAVI sur le site ?",
    "options": [
      "Service d'Identification Aéronautique et de Validation des Instruments",
      "Service d'Information et d'Assistance en Vol — brigade d'urgence médicale",
      "Système Intégré d'Aviation et de Vol Instrumenté",
      "Supervision Internationale des Aéronefs en Vol Illicite"
    ],
    "correct_answers": ["Service d'Information et d'Assistance en Vol — brigade d'urgence médicale"]
  },
  {
    "id": "adm-051",
    "title": "Qu'est-ce qu'une mission MEDEVAC ?",
    "options": [
      "Une mission militaire d'évacuation",
      "Un vol d'évacuation médicale effectué par le SIAVI",
      "Un vol humanitaire international",
      "Une mission de ravitaillement en vol"
    ],
    "correct_answers": ["Un vol d'évacuation médicale effectué par le SIAVI"]
  },
  {
    "id": "adm-052",
    "title": "Quelle est la différence entre un agent AFIS et un agent Pompier SIAVI ?",
    "options": [
      "L'AFIS peut valider des plans de vol, le pompier non",
      "L'AFIS gère la surveillance quand aucun ATC n'est présent, le pompier intervient quand un ATC est en ligne",
      "L'AFIS est senior et le pompier est stagiaire",
      "Il n'y a pas de différence"
    ],
    "correct_answers": ["L'AFIS gère la surveillance quand aucun ATC n'est présent, le pompier intervient quand un ATC est en ligne"]
  },
  {
    "id": "adm-053",
    "title": "Qu'est-ce que l'AeroSchool sur le site ?",
    "options": [
      "Une école virtuelle de pilotage PTFS",
      "Un système d'examens et de QCM pour certifier les membres",
      "Un module de formation uniquement pour les ATC",
      "Une bibliothèque de documents d'aviation"
    ],
    "correct_answers": ["Un système d'examens et de QCM pour certifier les membres"]
  },
  {
    "id": "adm-054",
    "title": "Quels modes de livraison existent pour un formulaire AeroSchool ?",
    "options": [
      "PDF uniquement",
      "Email et Discord webhook",
      "Révision manuelle admin ou envoi par Discord webhook",
      "Automatique et manuel"
    ],
    "correct_answers": ["Révision manuelle admin ou envoi par Discord webhook"]
  },
  {
    "id": "adm-055",
    "title": "Comment un admin corrige une réponse AeroSchool dans l'interface ?",
    "options": [
      "Via /admin/aeroschool → réponses soumises → approuver/rejeter",
      "En modifiant directement la base de données",
      "Via un formulaire envoyé par email",
      "Les réponses sont corrigées automatiquement"
    ],
    "correct_answers": ["Via /admin/aeroschool → réponses soumises → approuver/rejeter"]
  },
  {
    "id": "adm-056",
    "title": "Qu'est-ce qu'un module de questions AeroSchool ?",
    "options": [
      "Un formulaire avec des champs libres",
      "Une banque de questions QCM réutilisable pour créer des examens",
      "Un cours théorique vidéo",
      "Un document PDF de formation"
    ],
    "correct_answers": ["Une banque de questions QCM réutilisable pour créer des examens"]
  },
  {
    "id": "adm-057",
    "title": "Quelle est la conséquence d'un anti-triche détecté lors d'un test AeroSchool ?",
    "options": [
      "Le test est automatiquement noté 0 et la fraude est signalée",
      "Le test est mis en pause",
      "L'utilisateur reçoit un avertissement uniquement",
      "Le test est annulé et doit être recommencé"
    ],
    "correct_answers": ["Le test est automatiquement noté 0 et la fraude est signalée"]
  },
  {
    "id": "adm-058",
    "title": "Qu'est-ce que le Marketplace d'avions sur le site ?",
    "options": [
      "Un marché de l'occasion entre compagnies",
      "Une boutique officielle d'avions neufs avec prix fixes",
      "Un endroit pour enchérir sur des avions militaires",
      "Un espace pour louer des avions"
    ],
    "correct_answers": ["Une boutique officielle d'avions neufs avec prix fixes"]
  },
  {
    "id": "adm-059",
    "title": "Comment un admin valide une demande de revente dans le Hangar Market ?",
    "options": [
      "Via /admin/hangar-market → approuver la demande",
      "En envoyant un message Discord au PDG",
      "Automatiquement si le prix est correct",
      "Via un vote du staff"
    ],
    "correct_answers": ["Via /admin/hangar-market → approuver la demande"]
  },
  {
    "id": "adm-060",
    "title": "Qu'est-ce qu'un PDG dans le système de compagnies ?",
    "options": [
      "Un pilote débutant",
      "Le président-directeur général, propriétaire et administrateur principal de la compagnie",
      "Un co-pilote senior",
      "Un agent de la tour de contrôle"
    ],
    "correct_answers": ["Le président-directeur général, propriétaire et administrateur principal de la compagnie"]
  },
  {
    "id": "adm-061",
    "title": "Qu'est-ce qu'un co-PDG dans une compagnie ?",
    "options": [
      "Un deuxième PDG avec les mêmes droits que le PDG",
      "Un employé senior avec des droits de gestion étendus mais pas propriétaire",
      "Un administrateur externe qui supervise la compagnie",
      "Un pilote qui remplace le PDG en cas d'absence"
    ],
    "correct_answers": ["Un employé senior avec des droits de gestion étendus mais pas propriétaire"]
  },
  {
    "id": "adm-062",
    "title": "Comment un pilote rejoint une compagnie ?",
    "options": [
      "En envoyant une candidature sur le site puis acceptation par le PDG",
      "Automatiquement après 50 heures de vol",
      "Via une invitation du PDG acceptée par le pilote",
      "En achetant des actions de la compagnie"
    ],
    "correct_answers": ["Via une invitation du PDG acceptée par le pilote"]
  },
  {
    "id": "adm-063",
    "title": "Un PDG peut-il quitter une alliance à tout moment ?",
    "options": [
      "Non, il faut un vote du staff admin",
      "Oui, via l'onglet Alliance de sa compagnie",
      "Seulement si la compagnie a moins de 5 membres",
      "Seulement le fondateur de l'alliance peut retirer une compagnie"
    ],
    "correct_answers": ["Oui, via l'onglet Alliance de sa compagnie"]
  },
  {
    "id": "adm-064",
    "title": "Comment un admin crée-t-il une compagnie sur le site ?",
    "options": [
      "Via /admin/compagnies → Créer une compagnie",
      "En modifiant directement la base de données",
      "Via un formulaire dans le Discord",
      "Les compagnies se créent uniquement via le bot"
    ],
    "correct_answers": ["Via /admin/compagnies → Créer une compagnie"]
  },
  {
    "id": "adm-065",
    "title": "Quelle page admin permet de gérer les employés des compagnies ?",
    "options": ["/admin/compagnies/employes", "/admin/employes", "/admin/ressources-humaines", "/admin/membres"],
    "correct_answers": ["/admin/employes"]
  },
  {
    "id": "adm-066",
    "title": "Qu'est-ce que le 'pourcentage_salaire' d'une compagnie ?",
    "options": [
      "Le pourcentage de bénéfice reversé aux actionnaires",
      "Le pourcentage du revenu du vol reversé au pilote comme salaire",
      "La part de taxes prélevée par l'état virtuel",
      "Le taux d'intérêt d'un prêt compagnie"
    ],
    "correct_answers": ["Le pourcentage du revenu du vol reversé au pilote comme salaire"]
  },
  {
    "id": "adm-067",
    "title": "Quel est le rôle de la page /admin/ips ?",
    "options": [
      "Gérer les adresses IP des serveurs",
      "Surveiller et bloquer des adresses IP suspectes",
      "Configurer les IP des aéroports virtuels",
      "Gérer les protocoles Internet du site"
    ],
    "correct_answers": ["Surveiller et bloquer des adresses IP suspectes"]
  },
  {
    "id": "adm-068",
    "title": "Quel est le rôle de la page /admin/securite ?",
    "options": [
      "Gérer les connexions suspectes, tentatives de bruteforce et journaux de sécurité",
      "Configurer les certificats SSL du site",
      "Gérer les pare-feu du serveur Vercel",
      "Activer ou désactiver la 2FA"
    ],
    "correct_answers": ["Gérer les connexions suspectes, tentatives de bruteforce et journaux de sécurité"]
  },
  {
    "id": "adm-069",
    "title": "Quelle page admin affiche le journal de toutes les actions effectuées sur le site ?",
    "options": ["/admin/historique", "/admin/logs", "/admin/audit", "/admin/activite"],
    "correct_answers": ["/admin/logs"]
  },
  {
    "id": "adm-070",
    "title": "Quelle page admin permet de gérer les fichiers stockés dans Supabase Storage ?",
    "options": ["/admin/fichiers", "/admin/storage", "/admin/bucket", "/admin/medias"],
    "correct_answers": ["/admin/storage"]
  },
  {
    "id": "adm-071",
    "title": "Qu'est-ce que la page /admin/storage/orphans ?",
    "options": [
      "Une liste des pilotes sans compagnie",
      "Des fichiers présents en storage mais sans référence en base de données",
      "Des plans de vol sans pilote associé",
      "Des compagnies sans PDG"
    ],
    "correct_answers": ["Des fichiers présents en storage mais sans référence en base de données"]
  },
  {
    "id": "adm-072",
    "title": "Comment fonctionne le système de ponctualité pour les vols commerciaux ?",
    "options": [
      "Basé sur l'heure de décollage uniquement",
      "Basé sur l'écart entre l'heure d'arrivée prévue (du plan) et l'heure d'arrivée réelle (ATD + durée)",
      "Basé sur le nombre de passagers satisfaits",
      "Calculé automatiquement par le bot ATIS"
    ],
    "correct_answers": ["Basé sur l'écart entre l'heure d'arrivée prévue (du plan) et l'heure d'arrivée réelle (ATD + durée)"]
  },
  {
    "id": "adm-073",
    "title": "Les vols militaires sont-ils soumis au calcul de ponctualité ?",
    "options": [
      "Oui, comme tous les vols commerciaux",
      "Non, les vols militaires sont une exception au calcul de ponctualité",
      "Seulement les missions MEDEVAC",
      "Oui, mais avec un coefficient réduit"
    ],
    "correct_answers": ["Non, les vols militaires sont une exception au calcul de ponctualité"]
  },
  {
    "id": "adm-074",
    "title": "Qu'est-ce qu'une mission militaire avec cooldown ?",
    "options": [
      "Une mission qui ne peut être effectuée qu'une fois par jour",
      "Une période d'attente obligatoire entre deux missions du même type",
      "Un temps de refroidissement du moteur de l'avion",
      "Une restriction appliquée après un incident"
    ],
    "correct_answers": ["Une période d'attente obligatoire entre deux missions du même type"]
  },
  {
    "id": "adm-075",
    "title": "Quelle page admin permet de configurer les types de missions militaires ?",
    "options": ["/admin/militaire", "/admin/armee", "/admin/missions", "/admin/siavi/militaire"],
    "correct_answers": ["/admin/armee"]
  },
  {
    "id": "adm-076",
    "title": "Comment est récompensé un pilote militaire après une mission ?",
    "options": [
      "Automatiquement à la clôture du plan de vol via un virement Felitz sur son compte militaire",
      "Via un vote du staff admin",
      "Par un message Discord du commandant",
      "Lors de la validation hebdomadaire des missions"
    ],
    "correct_answers": ["Automatiquement à la clôture du plan de vol via un virement Felitz sur son compte militaire"]
  },
  {
    "id": "adm-077",
    "title": "Qu'est-ce qu'un rapport MEDEVAC ?",
    "options": [
      "Un rapport médical sur la santé des pilotes",
      "Un compte-rendu de mission d'évacuation médicale rédigé par l'agent SIAVI",
      "Un rapport d'accident d'avion",
      "Un bilan mensuel des opérations SIAVI"
    ],
    "correct_answers": ["Un compte-rendu de mission d'évacuation médicale rédigé par l'agent SIAVI"]
  },
  {
    "id": "adm-078",
    "title": "Comment accéder aux demandes de réinitialisation de mot de passe en attente ?",
    "options": ["/admin/mots-de-passe", "/admin/password-reset-requests", "/admin/securite/reset", "/admin/comptes/reset"],
    "correct_answers": ["/admin/password-reset-requests"]
  },
  {
    "id": "adm-079",
    "title": "Que fait la commande /webregister du bot Discord ?",
    "options": [
      "Elle enregistre le site sur Discord",
      "Elle crée un compte site lié au compte Discord de l'utilisateur",
      "Elle vérifie les rôles Discord d'un utilisateur",
      "Elle envoie un webhook de notification"
    ],
    "correct_answers": ["Elle crée un compte site lié au compte Discord de l'utilisateur"]
  },
  {
    "id": "adm-080",
    "title": "Si la commande /webregister ne fonctionne pas, quelle est la première cause à vérifier ?",
    "options": [
      "Le bot Discord est peut-être down sur Railway",
      "Le serveur Discord est en maintenance",
      "Le pilote n'a pas assez de permissions Discord",
      "Le site weblogbook est en maintenance"
    ],
    "correct_answers": ["Le bot Discord est peut-être down sur Railway"]
  },
  {
    "id": "adm-081",
    "title": "Quelle page admin liste les incidents de vol en attente d'examen ?",
    "options": ["/admin/accidents", "/admin/incidents", "/admin/urgences", "/admin/crash"],
    "correct_answers": ["/admin/incidents"]
  },
  {
    "id": "adm-082",
    "title": "Combien de statuts possède un incident de vol dans le système ?",
    "options": ["2 (en_attente, clos)", "3 (en_attente, en_examen, clos)", "4 (signalé, reçu, examiné, archivé)", "5"],
    "correct_answers": ["3 (en_attente, en_examen, clos)"]
  },
  {
    "id": "adm-083",
    "title": "Qui peut prendre en charge un incident de vol pour l'examiner ?",
    "options": [
      "Tout pilote senior",
      "Uniquement les administrateurs",
      "Les administrateurs et les agents IFSA",
      "Le PDG de la compagnie concernée"
    ],
    "correct_answers": ["Les administrateurs et les agents IFSA"]
  },
  {
    "id": "adm-084",
    "title": "Comment est notifié le pilote de la décision prise sur un incident le concernant ?",
    "options": [
      "Par email uniquement",
      "Via un message interne sur le site",
      "Via un message Discord direct",
      "Par une notification push dans l'app"
    ],
    "correct_answers": ["Via un message interne sur le site"]
  },
  {
    "id": "adm-085",
    "title": "Quelle information l'ATC peut-il ajouter lors du signalement d'un incident ?",
    "options": [
      "La météo au moment de l'incident",
      "Une description textuelle et des photos de l'incident",
      "Le log de l'ATC de la session",
      "La liste des autres pilotes présents"
    ],
    "correct_answers": ["Une description textuelle et des photos de l'incident"]
  },
  {
    "id": "adm-086",
    "title": "Comment fonctionne le système de real-time des strips ATC ?",
    "options": [
      "Via WebSockets natifs Node.js",
      "Via Supabase Realtime qui dispatch un événement 'atc-strips-refresh' capté par le board",
      "Via un polling toutes les secondes",
      "Via Firebase Cloud Messaging"
    ],
    "correct_answers": ["Via Supabase Realtime qui dispatch un événement 'atc-strips-refresh' capté par le board"]
  },
  {
    "id": "adm-087",
    "title": "Pourquoi le strip ATC a-t-il été migré de router.refresh() vers /api/atc/strips ?",
    "options": [
      "Pour réduire le coût d'hébergement Vercel",
      "Pour éviter les rechargements complets de page (SSR) et obtenir des mises à jour en ~100ms au lieu de 1-2s",
      "Pour supporter plus d'utilisateurs simultanés",
      "Pour compatibilité avec les navigateurs anciens"
    ],
    "correct_answers": ["Pour éviter les rechargements complets de page (SSR) et obtenir des mises à jour en ~100ms au lieu de 1-2s"]
  },
  {
    "id": "adm-088",
    "title": "Qu'est-ce que la mise à jour optimiste sur les strips ATC ?",
    "options": [
      "Le strip est mis à jour côté serveur d'abord, puis affiché",
      "Le statut est mis à jour visuellement immédiatement (avant la réponse API) pour une UX instantanée",
      "Le strip est optimisé pour les connexions lentes",
      "Un algorithme prédit le prochain statut du vol"
    ],
    "correct_answers": ["Le statut est mis à jour visuellement immédiatement (avant la réponse API) pour une UX instantanée"]
  },
  {
    "id": "adm-089",
    "title": "Un ATC signale que le strip d'un plan ne se met pas à jour après une action. Que vérifier ?",
    "options": [
      "Recharger le navigateur (F5)",
      "Vérifier si le plan n'a pas déjà été traité par un autre ATC (statut désynchronisé)",
      "Contacter l'hébergeur Vercel",
      "Vider le cache de la base de données"
    ],
    "correct_answers": ["Vérifier si le plan n'a pas déjà été traité par un autre ATC (statut désynchronisé)"]
  },
  {
    "id": "adm-090",
    "title": "Que signifie l'erreur 'Ce plan a déjà été traité' sur un strip ATC ?",
    "options": [
      "Un bug technique dans le code",
      "Le statut du plan a changé entre le chargement de la page et l'action de l'ATC",
      "L'ATC n'a pas les permissions pour cette action",
      "La session ATC a expiré"
    ],
    "correct_answers": ["Le statut du plan a changé entre le chargement de la page et l'action de l'ATC"]
  },
  {
    "id": "adm-091",
    "title": "Comment un admin peut-il voir le logbook complet d'un pilote ?",
    "options": [
      "Via /admin/vols filtré par pilote",
      "Via /admin/pilotes/[id]/logbook",
      "En demandant un export PDF au pilote",
      "Via la page /admin/logbooks"
    ],
    "correct_answers": ["Via /admin/pilotes/[id]/logbook"]
  },
  {
    "id": "adm-092",
    "title": "Comment un admin valide un vol en attente ?",
    "options": [
      "Via /admin/vols → cliquer 'Valider'",
      "Les vols sont validés automatiquement après 24h",
      "Via /admin/pilotes/[id] → bouton valider",
      "Via un webhook Discord"
    ],
    "correct_answers": ["Via /admin/vols → cliquer 'Valider'"]
  },
  {
    "id": "adm-093",
    "title": "Qu'est-ce que le champ 'heures_initiales_minutes' sur un profil pilote ?",
    "options": [
      "L'heure à laquelle le pilote s'est inscrit",
      "Des heures de vol ajoutées manuellement pour créditer un historique antérieur",
      "La durée de la dernière session de connexion",
      "Le temps total de formation initiale"
    ],
    "correct_answers": ["Des heures de vol ajoutées manuellement pour créditer un historique antérieur"]
  },
  {
    "id": "adm-094",
    "title": "Quelle est la différence entre un vol 'validé' et un plan de vol 'clôturé' ?",
    "options": [
      "Ce sont deux noms pour la même chose",
      "Le plan de vol clôturé est l'opération ATC, le vol validé est l'enregistrement définitif dans le logbook",
      "Un vol validé est plus récent qu'un plan clôturé",
      "La clôture est pour les vols IFR, la validation pour les vols VFR"
    ],
    "correct_answers": ["Le plan de vol clôturé est l'opération ATC, le vol validé est l'enregistrement définitif dans le logbook"]
  },
  {
    "id": "adm-095",
    "title": "Qu'est-ce que l'IFSA sur le site ?",
    "options": [
      "International Flight Safety Authority — organisme régulateur",
      "L'instance de régulation et de sanctions internes du serveur PTFS",
      "Une formation obligatoire pour les pilotes IFR",
      "Un module de surveillance du trafic aérien"
    ],
    "correct_answers": ["L'instance de régulation et de sanctions internes du serveur PTFS"]
  },
  {
    "id": "adm-096",
    "title": "Comment un agent IFSA émet-il une amende sur le site ?",
    "options": [
      "Via un formulaire dans /ifsa → signalements → émettre amende",
      "En envoyant un message Discord avec la commande /amende",
      "Via /admin/felitz-bank → transaction manuelle",
      "Par email à l'admin"
    ],
    "correct_answers": ["Via un formulaire dans /ifsa → signalements → émettre amende"]
  },
  {
    "id": "adm-097",
    "title": "Comment un pilote paie-t-il une amende IFSA ?",
    "options": [
      "Automatiquement déduit de son solde Felitz",
      "Via le bouton 'Payer' dans le message d'amende reçu dans sa messagerie",
      "Via virement bancaire Discord",
      "En contactant un admin"
    ],
    "correct_answers": ["Via le bouton 'Payer' dans le message d'amende reçu dans sa messagerie"]
  },
  {
    "id": "adm-098",
    "title": "Quelle URL permet d'accéder à la carte ODW publiquement ?",
    "options": ["/odw", "/carte", "/carte-atc", "/radar"],
    "correct_answers": ["/carte-atc"]
  },
  {
    "id": "adm-099",
    "title": "Pourquoi les positions des avions sur l'ODW sont-elles 'simulées' ?",
    "options": [
      "Le serveur de calcul est trop lent",
      "PTFS ne permet pas l'accès aux données de jeu en temps réel — les positions sont calculées depuis les plans de vol",
      "Les données GPS ne sont pas disponibles en Polynésie",
      "Le coût d'une API temps réel est trop élevé"
    ],
    "correct_answers": ["PTFS ne permet pas l'accès aux données de jeu en temps réel — les positions sont calculées depuis les plans de vol"]
  },
  {
    "id": "adm-100",
    "title": "Comment le thème 'Summer Update' est-il activé sur le site ?",
    "options": [
      "Via un paramètre dans la base de données",
      "Via la classe CSS 'pilot-summer-mode' ajoutée au body par AdminModeBg",
      "Via une variable d'environnement SUMMER_MODE=true",
      "Via un cookie de préférence utilisateur"
    ],
    "correct_answers": ["Via la classe CSS 'pilot-summer-mode' ajoutée au body par AdminModeBg"]
  },
  {
    "id": "adm-101",
    "title": "Qu'est-ce que la page /admin/sid-star ?",
    "options": [
      "Une page de gestion des étoiles et distinctions des pilotes",
      "Une interface pour gérer les procédures SID et STAR des aéroports",
      "Une page de gestion des abonnements premium",
      "Un outil de simulation de départ et d'arrivée"
    ],
    "correct_answers": ["Une interface pour gérer les procédures SID et STAR des aéroports"]
  },
  {
    "id": "adm-102",
    "title": "Qu'est-ce qu'un SID dans l'aviation ?",
    "options": [
      "Système Intégré de Données",
      "Standard Instrument Departure — procédure de départ aux instruments",
      "Service d'Identification des Départs",
      "Signal d'Identification Digitale"
    ],
    "correct_answers": ["Standard Instrument Departure — procédure de départ aux instruments"]
  },
  {
    "id": "adm-103",
    "title": "Qu'est-ce qu'une STAR dans l'aviation ?",
    "options": [
      "Standard Terminal Arrival Route — procédure d'arrivée aux instruments",
      "Système de Traitement des Arrivées Radar",
      "Service de Transit Aérien Régional",
      "Standard Traffic Approach Route"
    ],
    "correct_answers": ["Standard Terminal Arrival Route — procédure d'arrivée aux instruments"]
  },
  {
    "id": "adm-104",
    "title": "Quelle page admin permet de gérer les types d'avions disponibles sur le site ?",
    "options": ["/admin/avions/types", "/admin/types-avion", "/admin/catalogue", "/admin/flotte"],
    "correct_answers": ["/admin/types-avion"]
  },
  {
    "id": "adm-105",
    "title": "Qu'est-ce que la colonne 'has_mode_s' dans la table types_avion ?",
    "options": [
      "Indique si l'avion peut voler en mode silencieux",
      "Indique si le type d'avion est équipé d'un transpondeur Mode S",
      "Indique si le Mode Simulation est activé",
      "Indique si l'avion a un système de surveillance avancé"
    ],
    "correct_answers": ["Indique si le type d'avion est équipé d'un transpondeur Mode S"]
  },
  {
    "id": "adm-106",
    "title": "Quel est l'impact du champ 'has_mode_s' pour un pilote ?",
    "options": [
      "Il détermine la vitesse maximale de l'avion",
      "Il conditionne l'accès au bouton Mode S dans l'interface transpondeur",
      "Il active le pilote automatique",
      "Il permet le vol à haute altitude"
    ],
    "correct_answers": ["Il conditionne l'accès au bouton Mode S dans l'interface transpondeur"]
  },
  {
    "id": "adm-107",
    "title": "Quel est le code OACI de l'Airbus A320 dans la base de données du site ?",
    "options": ["A32N", "A32X", "A320", "AB20"],
    "correct_answers": ["A320"]
  },
  {
    "id": "adm-108",
    "title": "Quel est le code OACI du Boeing 787 dans la base de données du site ?",
    "options": ["B787", "B78X", "B788", "B789"],
    "correct_answers": ["B788"]
  },
  {
    "id": "adm-109",
    "title": "Les avions historiques (P-51, Hurricane, Fokker Dr1...) ont-ils le Mode S ?",
    "options": [
      "Oui, tous les avions ont le Mode S",
      "Non, ils n'ont que le Mode C",
      "Seulement les P-51 et Hurricane",
      "Ils n'ont aucun transpondeur"
    ],
    "correct_answers": ["Non, ils n'ont que le Mode C"]
  },
  {
    "id": "adm-110",
    "title": "Comment un admin peut-il modifier les heures de vol initiales d'un pilote ?",
    "options": [
      "Via /admin/pilotes/[id] → champ 'heures initiales'",
      "En modifiant directement la base Supabase",
      "Via /admin/logbooks → ajout manuel",
      "Ce n'est pas possible une fois le compte créé"
    ],
    "correct_answers": ["Via /admin/pilotes/[id] → champ 'heures initiales'"]
  },
  {
    "id": "adm-111",
    "title": "Qu'est-ce que la page /admin/cartographie-temporaire ?",
    "options": [
      "Une carte des incidents temporaires",
      "Un outil d'édition et validation de cartes aéronautiques temporaires",
      "Une carte des pilotes connectés en temps réel",
      "Un système de cartographie des routes aériennes"
    ],
    "correct_answers": ["Un outil d'édition et validation de cartes aéronautiques temporaires"]
  },
  {
    "id": "adm-112",
    "title": "Quelle est la différence entre le bucket 'cartes-identite' et 'documents' ?",
    "options": [
      "cartes-identite est privé, documents est public",
      "cartes-identite est public (images), documents est privé (PDFs et fichiers admin)",
      "Les deux sont identiques",
      "documents est pour les fichiers de plus de 20Mo uniquement"
    ],
    "correct_answers": ["cartes-identite est public (images), documents est privé (PDFs et fichiers admin)"]
  },
  {
    "id": "adm-113",
    "title": "Qu'est-ce que le système de 'location' d'avions entre compagnies ?",
    "options": [
      "Les compagnies peuvent vendre des places dans leurs avions",
      "Une compagnie peut louer un avion à une autre pour une durée déterminée",
      "Les pilotes peuvent louer des avions personnels",
      "C'est un système de partage de flotte permanent"
    ],
    "correct_answers": ["Une compagnie peut louer un avion à une autre pour une durée déterminée"]
  },
  {
    "id": "adm-114",
    "title": "Que fait le bouton 'Créer un strip' dans l'interface ATC ?",
    "options": [
      "Crée un plan de vol automatiquement",
      "Crée un strip manuel sans plan de vol pilote (pour les vols gérés manuellement par l'ATC)",
      "Duplique un strip existant",
      "Crée une nouvelle zone de strips"
    ],
    "correct_answers": ["Crée un strip manuel sans plan de vol pilote (pour les vols gérés manuellement par l'ATC)"]
  },
  {
    "id": "adm-115",
    "title": "Quelle est la signification du code de transpondeur 7700 ?",
    "options": [
      "Panne de communication radio",
      "Détournement d'avion",
      "Urgence générale",
      "Vol de test"
    ],
    "correct_answers": ["Urgence générale"]
  },
  {
    "id": "adm-116",
    "title": "Quelle est la signification du code de transpondeur 7600 ?",
    "options": [
      "Urgence générale",
      "Panne de communication radio",
      "Détournement d'avion",
      "Identification spéciale"
    ],
    "correct_answers": ["Panne de communication radio"]
  },
  {
    "id": "adm-117",
    "title": "Quelle est la signification du code de transpondeur 7500 ?",
    "options": [
      "Panne moteur",
      "Urgence médicale",
      "Détournement d'avion (hijack)",
      "Atterrissage forcé"
    ],
    "correct_answers": ["Détournement d'avion (hijack)"]
  },
  {
    "id": "adm-118",
    "title": "Que se passe-t-il visuellement sur un strip ATC quand le code transpondeur est 7700 ?",
    "options": [
      "Le strip devient orange",
      "Un bandeau 'EMERGENCY' s'affiche et le strip pulse en rouge",
      "Le strip disparaît de la liste",
      "Une alarme sonore se déclenche uniquement"
    ],
    "correct_answers": ["Un bandeau 'EMERGENCY' s'affiche et le strip pulse en rouge"]
  },
  {
    "id": "adm-119",
    "title": "Qu'est-ce que le CTOT affiché sur un strip ATC ?",
    "options": [
      "Controlled Time Of Transfer — heure de transfert",
      "Calculated Take-Off Time — heure de décollage estimée basée sur l'heure de dépôt du plan",
      "Current Traffic Of Track — trafic actuel",
      "Crew Time On Task — temps d'équipage"
    ],
    "correct_answers": ["Calculated Take-Off Time — heure de décollage estimée basée sur l'heure de dépôt du plan"]
  },
  {
    "id": "adm-120",
    "title": "Comment un ATC transfère-t-il un plan vers un autre contrôleur ?",
    "options": [
      "Double-clic droit sur le strip ou via le bouton 'Transférer'",
      "Via la commande /transfert dans Discord",
      "En drag-and-drop vers la zone du collègue",
      "Via le menu admin plans-vol"
    ],
    "correct_answers": ["Double-clic droit sur le strip ou via le bouton 'Transférer'"]
  },
  {
    "id": "adm-121",
    "title": "Quelles zones de strips existent dans le board ATC ?",
    "options": [
      "Entrée, Vol, Sortie",
      "Non assignés, Trafic au sol, Trafic au départ, Trafic à l'arrivée",
      "Attente, En vol, Atterri",
      "Nouveau, En cours, Terminé"
    ],
    "correct_answers": ["Non assignés, Trafic au sol, Trafic au départ, Trafic à l'arrivée"]
  },
  {
    "id": "adm-122",
    "title": "Comment déplacer un strip d'une zone à une autre dans l'interface ATC ?",
    "options": [
      "Via un bouton de changement de zone",
      "Par drag-and-drop depuis la poignée gauche du strip",
      "En cliquant droit puis 'Changer zone'",
      "C'est automatique selon le statut du vol"
    ],
    "correct_answers": ["Par drag-and-drop depuis la poignée gauche du strip"]
  },
  {
    "id": "adm-123",
    "title": "Quel bip sonore se déclenche sur un strip ATC lors d'une erreur d'action ?",
    "options": [
      "Un bip aigu continu",
      "Un bip descendant (880Hz → 440Hz, forme carrée, 350ms)",
      "Un bip de type sonnerie téléphonique",
      "Aucun son — seulement un message d'erreur visuel"
    ],
    "correct_answers": ["Un bip descendant (880Hz → 440Hz, forme carrée, 350ms)"]
  },
  {
    "id": "adm-124",
    "title": "Comment fonctionne la hiérarchie de transfert entre positions ATC ?",
    "options": [
      "N'importe quelle position peut transférer à n'importe quelle autre",
      "Il existe une hiérarchie : Delivery→Ground→Tower→APP/DEP→Center, avec transferts possibles entre niveaux adjacents",
      "Seul le Center peut initier des transferts",
      "Les transferts nécessitent l'approbation de l'admin"
    ],
    "correct_answers": ["Il existe une hiérarchie : Delivery→Ground→Tower→APP/DEP→Center, avec transferts possibles entre niveaux adjacents"]
  },
  {
    "id": "adm-125",
    "title": "Qu'est-ce que le système BRIA sur les strips ATC ?",
    "options": [
      "Bot de Reconnaissance et d'Identification Automatique",
      "Un assistant IA intégré qui suggère les intentions et clearances pour les vols",
      "Base de Référence ICAO Aéronautique",
      "Bureau de Régulation et d'Instruction Aérienne"
    ],
    "correct_answers": ["Un assistant IA intégré qui suggère les intentions et clearances pour les vols"]
  },
  {
    "id": "adm-126",
    "title": "Comment voir les plans de vol en attente de validation par l'ATC depuis la barre latérale ?",
    "options": [
      "Via le bouton 'PLANS EN ATTENTE' en haut à droite",
      "Dans le menu 'Non contrôlés' en bas du board",
      "Via la page /atc/plans-attente",
      "Les deux premiers : barre latérale Plans en attente ET panneau Non contrôlés"
    ],
    "correct_answers": ["Les deux premiers : barre latérale Plans en attente ET panneau Non contrôlés"]
  },
  {
    "id": "adm-127",
    "title": "Qu'est-ce que l'AutoRefresh dans le layout ATC ?",
    "options": [
      "Un rechargement automatique de la page toutes les 60 secondes pour la resynchronisation",
      "Un rechargement toutes les 5 secondes",
      "Un système qui actualise uniquement les strips modifiés",
      "Un bot qui maintient la session active"
    ],
    "correct_answers": ["Un rechargement automatique de la page toutes les 60 secondes pour la resynchronisation"]
  },
  {
    "id": "adm-128",
    "title": "Comment un admin ajoute-t-il un grade ATC ?",
    "options": [
      "Via /admin/atc → Grades",
      "Via /atc/admin → Grades",
      "Via /admin/grades",
      "Via un webhook Discord"
    ],
    "correct_answers": ["Via /atc/admin → Grades"]
  },
  {
    "id": "adm-129",
    "title": "Un pilote dit que son plan de vol est 'déposé' mais l'ATC ne le voit pas. Que vérifier ?",
    "options": [
      "Si l'ATC est bien en service sur le bon aéroport",
      "Si le plan de vol a bien un numéro de vol",
      "Si le pilote a bien validé son email",
      "Si le serveur Vercel fonctionne"
    ],
    "correct_answers": ["Si l'ATC est bien en service sur le bon aéroport"]
  },
  {
    "id": "adm-130",
    "title": "Qu'est-ce qu'un vol local dans le système de dépôt de plan de vol ?",
    "options": [
      "Un vol effectué à basse altitude uniquement",
      "Un vol dont l'aéroport de départ et d'arrivée sont identiques (circuit ou instruction)",
      "Un vol limité à une zone géographique",
      "Un vol effectué en VFR uniquement"
    ],
    "correct_answers": ["Un vol dont l'aéroport de départ et d'arrivée sont identiques (circuit ou instruction)"]
  },
  {
    "id": "adm-131",
    "title": "Quel format est utilisé pour les IDs des questions dans un module AeroSchool ?",
    "options": [
      "UUID aléatoire",
      "Un préfixe + numéro (ex: cdc-001, adm-001)",
      "Timestamp Unix",
      "Numéro séquentiel automatique"
    ],
    "correct_answers": ["Un préfixe + numéro (ex: cdc-001, adm-001)"]
  },
  {
    "id": "adm-132",
    "title": "Comment les questions d'un module AeroSchool sont-elles stockées en base ?",
    "options": [
      "Dans une table séparée 'aeroschool_questions'",
      "En JSON dans la colonne 'questions' de la table 'aeroschool_question_modules'",
      "Dans des fichiers SQL sur le serveur",
      "Dans une table de clés-valeurs"
    ],
    "correct_answers": ["En JSON dans la colonne 'questions' de la table 'aeroschool_question_modules'"]
  },
  {
    "id": "adm-133",
    "title": "Combien de réponses correctes peut avoir une question dans un module AeroSchool ?",
    "options": [
      "Toujours 1 seule",
      "Entre 1 et 4",
      "Toujours 2",
      "Variable selon la configuration du formulaire"
    ],
    "correct_answers": ["Entre 1 et 4"]
  },
  {
    "id": "adm-134",
    "title": "Qu'est-ce que la page /admin/dossiers-formation ?",
    "options": [
      "Un espace pour créer des formations vidéo",
      "Des archives PDF de fins de formation des pilotes, certifiées par les instructeurs",
      "Un système de gestion des stages en entreprise",
      "Un outil de planification des examens"
    ],
    "correct_answers": ["Des archives PDF de fins de formation des pilotes, certifiées par les instructeurs"]
  },
  {
    "id": "adm-135",
    "title": "Qu'est-ce que le système de licences sur le site ?",
    "options": [
      "Des licences logicielles pour les outils de simulation",
      "Des qualifications et certifications aériennes obtenues par les pilotes (VFR, IFR, etc.)",
      "Des autorisations de vol pour certains espaces aériens",
      "Des permis d'exploitation de compagnie"
    ],
    "correct_answers": ["Des qualifications et certifications aériennes obtenues par les pilotes (VFR, IFR, etc.)"]
  },
  {
    "id": "adm-136",
    "title": "Quel est le rôle de la page /admin/licences ?",
    "options": [
      "Vendre des licences aux pilotes",
      "Créer et gérer les types de qualifications disponibles sur le site",
      "Valider les examens AeroSchool",
      "Attribuer des licences manuellement"
    ],
    "correct_answers": ["Créer et gérer les types de qualifications disponibles sur le site"]
  },
  {
    "id": "adm-137",
    "title": "Comment les taxes aéroportuaires fonctionnent-elles sur le site ?",
    "options": [
      "Fixes et identiques pour tous les aéroports",
      "Variables selon l'aéroport et le type d'avion, prélevées automatiquement lors des vols commerciaux",
      "Optionnelles selon la compagnie",
      "Perçues mensuellement par prélèvement automatique"
    ],
    "correct_answers": ["Variables selon l'aéroport et le type d'avion, prélevées automatiquement lors des vols commerciaux"]
  },
  {
    "id": "adm-138",
    "title": "Qu'est-ce que la page /admin/taxes-aeroports ?",
    "options": [
      "La liste des taxes prélevées par aéroport",
      "Un outil de configuration des tarifs de taxes par aéroport et catégorie d'avion",
      "Un historique des paiements de taxes",
      "Une page de remboursement de taxes"
    ],
    "correct_answers": ["Un outil de configuration des tarifs de taxes par aéroport et catégorie d'avion"]
  },
  {
    "id": "adm-139",
    "title": "Comment fonctionne le système de prêt entre compagnies ?",
    "options": [
      "Une compagnie emprunte de l'argent à une autre avec un taux d'intérêt défini",
      "Un PDG prête son propre argent à sa compagnie",
      "Les prêts sont uniquement accordés par la Felitz Bank centrale",
      "Les prêts sont illimités et sans intérêt"
    ],
    "correct_answers": ["Une compagnie emprunte de l'argent à une autre avec un taux d'intérêt défini"]
  },
  {
    "id": "adm-140",
    "title": "Qu'est-ce que le système de hubs d'une compagnie ?",
    "options": [
      "Des aéroports de base désignés pour la compagnie",
      "Des centres logistiques pour le fret",
      "Des salles de conférence virtuelles pour les briefings",
      "Des zones de maintenance exclusives"
    ],
    "correct_answers": ["Des aéroports de base désignés pour la compagnie"]
  },
  {
    "id": "adm-141",
    "title": "Qu'est-ce que la table 'site_config' dans la base de données ?",
    "options": [
      "La configuration du serveur web",
      "Une table avec une seule ligne contenant les paramètres globaux du site (maintenance, login admin only...)",
      "Les paramètres de style et de thème du site",
      "La liste des variables d'environnement"
    ],
    "correct_answers": ["Une table avec une seule ligne contenant les paramètres globaux du site (maintenance, login admin only...)"]
  },
  {
    "id": "adm-142",
    "title": "Comment activer le mode 'connexions réservées aux admins' ?",
    "options": [
      "En modifiant le fichier .env sur Vercel",
      "En mettant login_admin_only=true dans la table site_config",
      "Via le bouton dans /admin/securite",
      "En redéployant avec un flag spécial"
    ],
    "correct_answers": ["En mettant login_admin_only=true dans la table site_config"]
  },
  {
    "id": "adm-143",
    "title": "Comment fonctionne la connexion en deux étapes (2FA) sur le site ?",
    "options": [
      "Via une app d'authentification (Google Authenticator)",
      "Via un code SMS envoyé au téléphone",
      "Via un code envoyé par email, saisi après le mot de passe",
      "Via une clé de sécurité physique"
    ],
    "correct_answers": ["Via un code envoyé par email, saisi après le mot de passe"]
  },
  {
    "id": "adm-144",
    "title": "Quand le code de vérification email est-il exigé lors de la connexion ?",
    "options": [
      "À chaque connexion sans exception",
      "Uniquement lors de la première connexion",
      "Selon la politique configurée — peut être requis selon les appareils ou fréquence de connexion",
      "Uniquement si la connexion vient d'un pays différent"
    ],
    "correct_answers": ["Selon la politique configurée — peut être requis selon les appareils ou fréquence de connexion"]
  },
  {
    "id": "adm-145",
    "title": "Comment un admin peut-il envoyer un message à un pilote depuis le site ?",
    "options": [
      "Via /admin/messages → nouveau message",
      "Via la messagerie interne du site",
      "Via un webhook Discord",
      "Par email directement"
    ],
    "correct_answers": ["Via la messagerie interne du site"]
  },
  {
    "id": "adm-146",
    "title": "Qu'est-ce qu'un message de type 'broadcast' dans la messagerie ?",
    "options": [
      "Un message envoyé à tous les membres d'un groupe spécifique",
      "Un message répété automatiquement",
      "Un message crypté",
      "Un message qui s'autodétruit après lecture"
    ],
    "correct_answers": ["Un message envoyé à tous les membres d'un groupe spécifique"]
  },
  {
    "id": "adm-147",
    "title": "Quelle URL publique permet de voir l'ODW sans être connecté ?",
    "options": [
      "Il n'est pas accessible sans connexion",
      "/carte-atc est accessible sans connexion",
      "/odw/public",
      "/carte-atc/public"
    ],
    "correct_answers": ["/carte-atc est accessible sans connexion"]
  },
  {
    "id": "adm-148",
    "title": "Quels types de vols sont visibles sur l'ODW ?",
    "options": [
      "Uniquement les vols commerciaux IFR",
      "Tous : locaux, militaires, ferry, réparation transit, civils VFR et IFR",
      "Uniquement les vols avec ATC actif",
      "Uniquement les vols en cours (pas les plans déposés)"
    ],
    "correct_answers": ["Tous : locaux, militaires, ferry, réparation transit, civils VFR et IFR"]
  },
  {
    "id": "adm-149",
    "title": "Que signifie 'SCHEDULED' sur le panneau de vol de l'ODW ?",
    "options": [
      "L'heure de départ prévue selon la stripe du plan ATC",
      "L'heure à laquelle le plan a été déposé",
      "L'heure de décollage selon le contrôleur",
      "L'heure estimée d'arrivée"
    ],
    "correct_answers": ["L'heure de départ prévue selon la stripe du plan ATC"]
  },
  {
    "id": "adm-150",
    "title": "Que signifie 'ACTUAL' sur le panneau de vol de l'ODW ?",
    "options": [
      "L'heure réelle de départ saisie par l'ATC dans le strip (ATD)",
      "L'heure actuelle selon l'horloge UTC",
      "L'heure de calcul de la position",
      "L'heure d'atterrissage réel"
    ],
    "correct_answers": ["L'heure réelle de départ saisie par l'ATC dans le strip (ATD)"]
  },
  {
    "id": "adm-151",
    "title": "Comment vérifier la santé du bot ATIS depuis l'admin ?",
    "options": [
      "Via /admin/atis-bots → Relancer le diagnostic",
      "Via /admin/bots/health",
      "Via un ping Discord",
      "En consultant les logs Railway directement"
    ],
    "correct_answers": ["Via /admin/atis-bots → Relancer le diagnostic"]
  },
  {
    "id": "adm-152",
    "title": "Qu'est-ce que le diagnostic admin du bot ATIS vérifie ?",
    "options": [
      "Uniquement si le bot répond",
      "Variables d'env, joignabilité du bot, secret partagé, instances Discord, lignes DB et cohérence",
      "Seulement les instances Discord actives",
      "Le nombre de messages envoyés par le bot"
    ],
    "correct_answers": ["Variables d'env, joignabilité du bot, secret partagé, instances Discord, lignes DB et cohérence"]
  },
  {
    "id": "adm-153",
    "title": "Combien de bots ATIS peuvent fonctionner simultanément ?",
    "options": [
      "1 seul",
      "2 maximum",
      "Illimité, le système est entièrement dynamique",
      "3 maximum selon les licences"
    ],
    "correct_answers": ["Illimité, le système est entièrement dynamique"]
  },
  {
    "id": "adm-154",
    "title": "Pour ajouter un Bot 2 ATIS, que faut-il faire côté Railway ?",
    "options": [
      "Créer un second service Railway",
      "Ajouter la variable DISCORD_TOKEN_2 dans le service existant",
      "Modifier le code source du bot",
      "Contacter le support Railway"
    ],
    "correct_answers": ["Ajouter la variable DISCORD_TOKEN_2 dans le service existant"]
  },
  {
    "id": "adm-155",
    "title": "Quelles migrations SQL sont à exécuter pour activer les transpondeurs Mode S ?",
    "options": [
      "add_transponder.sql",
      "add_mode_s_aircraft.sql",
      "update_transpondeurs.sql",
      "mode_s_migration.sql"
    ],
    "correct_answers": ["add_mode_s_aircraft.sql"]
  },
  {
    "id": "adm-156",
    "title": "Comment vérifier si la migration Mode S a bien été appliquée ?",
    "options": [
      "SELECT * FROM types_avion WHERE has_mode_s IS NOT NULL",
      "SELECT has_mode_s, COUNT(*) FROM types_avion GROUP BY has_mode_s",
      "SHOW COLUMNS FROM types_avion",
      "SELECT version FROM migrations WHERE name='mode_s'"
    ],
    "correct_answers": ["SELECT has_mode_s, COUNT(*) FROM types_avion GROUP BY has_mode_s"]
  },
  {
    "id": "adm-157",
    "title": "Qu'est-ce que le fichier middleware.ts dans le projet Next.js ?",
    "options": [
      "Un fichier de configuration webpack",
      "Un middleware qui s'exécute avant chaque requête pour vérifier l'authentification, Discord et la sécurité",
      "Un fichier de routes API",
      "Un plugin pour la gestion des cookies"
    ],
    "correct_answers": ["Un middleware qui s'exécute avant chaque requête pour vérifier l'authentification, Discord et la sécurité"]
  },
  {
    "id": "adm-158",
    "title": "Quelle est la conséquence d'une erreur dans le middleware.ts ?",
    "options": [
      "Un plantage complet du site avec page 500",
      "Tous les utilisateurs peuvent être redirigés vers /login ou bloqués",
      "Uniquement les nouvelles connexions sont affectées",
      "Seulement les routes API sont impactées"
    ],
    "correct_answers": ["Tous les utilisateurs peuvent être redirigés vers /login ou bloqués"]
  },
  {
    "id": "adm-159",
    "title": "Qu'est-ce que le 'fail-closed' dans la sécurité du middleware ?",
    "options": [
      "En cas d'erreur de la base de données, on déconnecte l'utilisateur par sécurité",
      "En cas d'erreur, on laisse passer l'utilisateur",
      "En cas d'erreur, on affiche une page d'erreur 503",
      "En cas d'erreur, on redirige vers Discord"
    ],
    "correct_answers": ["En cas d'erreur de la base de données, on déconnecte l'utilisateur par sécurité"]
  },
  {
    "id": "adm-160",
    "title": "Quelles routes API sont accessibles sans authentification ?",
    "options": [
      "Toutes les routes /api/",
      "/api/setup, /api/has-admin, /api/site-config, /api/login-logo et les routes AeroSchool publiques",
      "Uniquement /api/health",
      "Aucune — toutes requièrent une session"
    ],
    "correct_answers": ["/api/setup, /api/has-admin, /api/site-config, /api/login-logo et les routes AeroSchool publiques"]
  },
  {
    "id": "adm-161",
    "title": "Qu'est-ce que le 'timing attack' dans la sécurité web ?",
    "options": [
      "Une attaque par déni de service chronométrée",
      "Une attaque qui mesure le temps de réponse pour deviner un secret (ex: mot de passe)",
      "Une attaque qui exploite les timeouts de session",
      "Un piratage via le cache du navigateur"
    ],
    "correct_answers": ["Une attaque qui mesure le temps de réponse pour deviner un secret (ex: mot de passe)"]
  },
  {
    "id": "adm-162",
    "title": "Quelle bonne pratique de sécurité s'applique à toute comparaison de secret ou mot de passe côté serveur ?",
    "options": [
      "Comparer en clair côté client pour plus de rapidité",
      "Utiliser une comparaison à temps constant pour éviter les attaques par analyse de timing",
      "Stocker le secret en clair dans les logs pour vérification",
      "Hacher le secret uniquement à l'affichage"
    ],
    "correct_answers": ["Utiliser une comparaison à temps constant pour éviter les attaques par analyse de timing"]
  },
  {
    "id": "adm-163",
    "title": "Quelle est la cible (target) TypeScript configurée dans tsconfig.json du projet ?",
    "options": ["ES5", "ES2015", "ES2017", "ESNext"],
    "correct_answers": ["ES2017"]
  },
  {
    "id": "adm-164",
    "title": "Pourquoi avoir défini 'target: ES2017' dans tsconfig.json ?",
    "options": [
      "Pour compatibilité avec Internet Explorer 11",
      "Pour permettre l'utilisation de Set/Map spread, async/await sans erreur TypeScript",
      "Pour réduire la taille du bundle",
      "Exigence de Next.js 14"
    ],
    "correct_answers": ["Pour permettre l'utilisation de Set/Map spread, async/await sans erreur TypeScript"]
  },
  {
    "id": "adm-165",
    "title": "Comment voir les pilotes actuellement connectés à l'espace ATC ?",
    "options": [
      "Via /admin/atc/sessions",
      "Via /atc/admin → Sessions en ligne",
      "Dans la page ATC principale → barre de gauche",
      "Via la page /admin/pilotes filtrée par rôle ATC"
    ],
    "correct_answers": ["Via /atc/admin → Sessions en ligne"]
  },
  {
    "id": "adm-166",
    "title": "Qu'est-ce que la position 'Center' pour un ATC ?",
    "options": [
      "Un ATC qui gère tous les aéroports simultanément",
      "Un contrôle régional qui gère les transitions entre espaces aériens",
      "Le centre de commandement des opérations",
      "Une position uniquement pour les entraînements"
    ],
    "correct_answers": ["Un contrôle régional qui gère les transitions entre espaces aériens"]
  },
  {
    "id": "adm-167",
    "title": "Quelle zone de strip est visible uniquement pour un ATC en position 'Center' ?",
    "options": ["Transit", "Survol", "Croisière", "Haute Altitude"],
    "correct_answers": ["Transit"]
  },
  {
    "id": "adm-168",
    "title": "Qu'est-ce que la fonction 'Autosurveillance' lors du transfert d'un strip ATC ?",
    "options": [
      "Le plan est supprimé automatiquement",
      "Le plan est transféré sans ATC assigné et géré automatiquement par le système",
      "Le plan est mis en pause jusqu'au retour de l'ATC",
      "Le plan est archivé immédiatement"
    ],
    "correct_answers": ["Le plan est transféré sans ATC assigné et géré automatiquement par le système"]
  },
  {
    "id": "adm-169",
    "title": "Comment le système détecte-t-il qu'un pilote SIAVI est en service ?",
    "options": [
      "Via la table 'afis_sessions' où l'agent a créé une session",
      "Via son rôle 'siavi' dans les profiles",
      "Via une commande Discord",
      "Via un check-in manuel dans l'admin"
    ],
    "correct_answers": ["Via la table 'afis_sessions' où l'agent a créé une session"]
  },
  {
    "id": "adm-170",
    "title": "Comment un admin voit-il les sessions AFIS actuellement actives ?",
    "options": [
      "Dans la page principale SIAVI",
      "Via /admin/siavi/sessions",
      "Dans la page principale SIAVI, section 'Positions en service'",
      "Via /atc/admin avec un filtre AFIS"
    ],
    "correct_answers": ["Dans la page principale SIAVI, section 'Positions en service'"]
  },
  {
    "id": "adm-171",
    "title": "Comment les positions de vol sur l'ODW sont-elles calculées ?",
    "options": [
      "Via les données GPS transmises par PTFS",
      "Interpolation le long de la route déclarée en fonction du temps écoulé depuis le départ",
      "Via des capteurs installés dans le jeu",
      "Par traitement d'image automatique"
    ],
    "correct_answers": ["Interpolation le long de la route déclarée en fonction du temps écoulé depuis le départ"]
  },
  {
    "id": "adm-172",
    "title": "Qu'est-ce que la carte d'identité d'un pilote sur le site ?",
    "options": [
      "Un document officiel d'identification civile",
      "Une carte virtuelle personnalisée avec photo, compagnie, date d'entrée, visible dans l'annuaire",
      "Un badge de connexion Discord",
      "Un certificat de formation PTFS"
    ],
    "correct_answers": ["Une carte virtuelle personnalisée avec photo, compagnie, date d'entrée, visible dans l'annuaire"]
  },
  {
    "id": "adm-173",
    "title": "Quelle table stocke les données de la carte d'identité d'un pilote ?",
    "options": ["profiles", "pilote_cartes", "cartes_identite", "user_cards"],
    "correct_answers": ["cartes_identite"]
  },
  {
    "id": "adm-174",
    "title": "Comment un admin modifie-t-il la carte d'identité d'un pilote ?",
    "options": [
      "Via /admin/pilotes/[id] → section Carte d'identité",
      "Directement dans la base Supabase",
      "Via la messagerie interne en envoyant les modifications",
      "Seul le pilote peut modifier sa carte d'identité"
    ],
    "correct_answers": ["Via /admin/pilotes/[id] → section Carte d'identité"]
  },
  {
    "id": "adm-175",
    "title": "Quelle page admin liste tous les vols validés de tous les pilotes ?",
    "options": ["/admin/logbook", "/admin/vols", "/admin/flights", "/admin/historique-vols"],
    "correct_answers": ["/admin/vols"]
  },
  {
    "id": "adm-176",
    "title": "Un pilote signale qu'il n'a pas reçu son salaire après un vol commercial. Que vérifier ?",
    "options": [
      "Si le vol est bien validé dans le logbook",
      "Si le plan de vol était bien clôturé ET si la compagnie a un solde Felitz suffisant",
      "Si le PDG de la compagnie a autorisé le paiement",
      "Si le chèque est dans les messages non lus du pilote"
    ],
    "correct_answers": ["Si le plan de vol était bien clôturé ET si la compagnie a un solde Felitz suffisant"]
  },
  {
    "id": "adm-177",
    "title": "Qu'est-ce que la table 'ifsa_signalements' ?",
    "options": [
      "Les signalements de bugs sur le site",
      "Les rapports d'incidents et violations transmis à l'IFSA pour instruction",
      "Les signalements de contenu inapproprié Discord",
      "Les signalements de bugs AeroSchool"
    ],
    "correct_answers": ["Les rapports d'incidents et violations transmis à l'IFSA pour instruction"]
  },
  {
    "id": "adm-178",
    "title": "Comment un signalement IFSA est-il automatiquement créé ?",
    "options": [
      "Par soumission manuelle d'un agent IFSA",
      "Automatiquement lors d'un crash ou atterrissage d'urgence signalé par l'ATC",
      "Via un formulaire Discord rempli par le pilote",
      "Automatiquement après 3 refus de plan de vol"
    ],
    "correct_answers": ["Automatiquement lors d'un crash ou atterrissage d'urgence signalé par l'ATC"]
  },
  {
    "id": "adm-179",
    "title": "Comment consulter les signalements IFSA en attente de traitement ?",
    "options": [
      "Via /admin/signalements",
      "Via /ifsa → liste des signalements",
      "Via /admin/ifsa/signalements",
      "Via la messagerie admin"
    ],
    "correct_answers": ["Via /ifsa → liste des signalements"]
  },
  {
    "id": "adm-180",
    "title": "Quelle est la page admin pour gérer les alliances entre compagnies ?",
    "options": ["/admin/alliances", "/admin/federations", "/admin/groupes", "/admin/coalitions"],
    "correct_answers": ["/admin/alliances"]
  },
  {
    "id": "adm-181",
    "title": "Qu'est-ce que le radar ATC dans l'interface /atc ?",
    "options": [
      "Une carte temps réel similaire à l'ODW mais avec plus d'informations pour les ATC",
      "Un outil de détection des squawks d'urgence",
      "Un système de guidage ILS pour les atterrissages",
      "Un historique des trajectoires de vol"
    ],
    "correct_answers": ["Une carte temps réel similaire à l'ODW mais avec plus d'informations pour les ATC"]
  },
  {
    "id": "adm-182",
    "title": "Qu'est-ce que le système de VHF (radio fréquences) dans l'ATC ?",
    "options": [
      "Un système de communication vocal entre pilotes",
      "Un système de gestion des fréquences radio VHF assignées aux positions ATC",
      "Un système de streaming musical pour les salons Discord ATC",
      "Un outil de simulation de brouillage radio"
    ],
    "correct_answers": ["Un système de gestion des fréquences radio VHF assignées aux positions ATC"]
  },
  {
    "id": "adm-183",
    "title": "Comment configurer les fréquences VHF d'une position ATC ?",
    "options": [
      "Via /admin/atc → Fréquences VHF",
      "Via /atc/admin → Fréquences VHF",
      "En modifiant le fichier de configuration des fréquences",
      "Via un webhook Discord spécial"
    ],
    "correct_answers": ["Via /atc/admin → Fréquences VHF"]
  },
  {
    "id": "adm-184",
    "title": "Qu'est-ce que le système de téléphone ATC ?",
    "options": [
      "Un vrai téléphone entre les contrôleurs ATC",
      "Un système de communication vocale virtuelle intégré entre positions ATC via LiveKit",
      "Un chat texte privé entre ATC",
      "Une notification sonore lors d'un transfert de strip"
    ],
    "correct_answers": ["Un système de communication vocale virtuelle intégré entre positions ATC via LiveKit"]
  },
  {
    "id": "adm-185",
    "title": "Que fait le bouton 'Hors service' dans l'interface ATC ?",
    "options": [
      "Met le site en maintenance",
      "Termine la session ATC de l'utilisateur et libère tous ses strips",
      "Déconnecte tous les pilotes du strip board",
      "Désactive les notifications en temps réel"
    ],
    "correct_answers": ["Termine la session ATC de l'utilisateur et libère tous ses strips"]
  },
  {
    "id": "adm-186",
    "title": "Qu'est-ce que la vue spectateur dans l'ATC ?",
    "options": [
      "Un mode lecture seule permettant de voir les strips d'un autre ATC en temps réel",
      "Une retransmission vidéo des sessions ATC",
      "Un mode formation pour les ATC stagiaires",
      "Un historique des sessions ATC passées"
    ],
    "correct_answers": ["Un mode lecture seule permettant de voir les strips d'un autre ATC en temps réel"]
  },
  {
    "id": "adm-187",
    "title": "Quel est le rôle de la table 'atc_sessions' ?",
    "options": [
      "Stocker les logs de toutes les sessions ATC passées",
      "Enregistrer les sessions ATC actuellement actives avec l'aéroport et la position",
      "Gérer les authentifications ATC",
      "Stocker les préférences de thème des ATC"
    ],
    "correct_answers": ["Enregistrer les sessions ATC actuellement actives avec l'aéroport et la position"]
  },
  {
    "id": "adm-188",
    "title": "Un ATC signale que sa session reste active même après déconnexion. Que faire ?",
    "options": [
      "Supprimer sa session manuellement dans la table atc_sessions via Supabase",
      "Relancer le serveur Vercel",
      "Demander à un autre ATC de le déconnecter",
      "Attendre 30 minutes que le système détecte l'inactivité"
    ],
    "correct_answers": ["Supprimer sa session manuellement dans la table atc_sessions via Supabase"]
  },
  {
    "id": "adm-189",
    "title": "Qu'est-ce que InactivityLogout dans le site ?",
    "options": [
      "Un système qui déconnecte après 30 minutes d'inactivité complète",
      "Un système qui déconnecte automatiquement l'utilisateur après une longue période sans action",
      "Un plugin de sécurité externe",
      "Une déconnexion planifiée à heure fixe"
    ],
    "correct_answers": ["Un système qui déconnecte automatiquement l'utilisateur après une longue période sans action"]
  },
  {
    "id": "adm-190",
    "title": "Qu'est-ce que InactivityLogout sur le site ?",
    "options": [
      "Un système qui déconnecte automatiquement les pilotes inactifs depuis trop longtemps",
      "Un bot qui surveille les connexions Discord inactives",
      "Un outil de déconnexion planifiée à heure fixe",
      "Un système de déconnexion uniquement pour les ATC"
    ],
    "correct_answers": ["Un système qui déconnecte automatiquement les pilotes inactifs depuis trop longtemps"]
  },
  {
    "id": "adm-191",
    "title": "Quelle est l'adresse de la page de configuration initiale du site (setup) ?",
    "options": ["/admin/setup", "/setup", "/config", "/install"],
    "correct_answers": ["/setup"]
  },
  {
    "id": "adm-192",
    "title": "À quoi sert la page /setup ?",
    "options": [
      "Configurer les variables d'environnement",
      "Créer le premier compte administrateur si aucun n'existe",
      "Installer les dépendances du projet",
      "Initialiser la base de données"
    ],
    "correct_answers": ["Créer le premier compte administrateur si aucun n'existe"]
  },
  {
    "id": "adm-193",
    "title": "Que se passe-t-il si la table 'profiles' ne contient aucun admin et qu'un utilisateur tente de se connecter ?",
    "options": [
      "Il est redirigé vers /setup automatiquement",
      "Il reçoit une erreur 403",
      "Il peut se connecter normalement",
      "Le site affiche une page de maintenance"
    ],
    "correct_answers": ["Il est redirigé vers /setup automatiquement"]
  },
  {
    "id": "adm-194",
    "title": "Qu'est-ce que la page /download sur le site ?",
    "options": [
      "Le téléchargement des logs du serveur",
      "Une page publique de téléchargements (outils, apps, etc.) accessible sans connexion",
      "L'export du logbook en PDF",
      "Le téléchargement de la base de données"
    ],
    "correct_answers": ["Une page publique de téléchargements (outils, apps, etc.) accessible sans connexion"]
  },
  {
    "id": "adm-195",
    "title": "Qu'est-ce que le système de 'blocage' d'un avion suite à un incident ?",
    "options": [
      "L'avion est supprimé de la flotte",
      "L'avion reçoit le flag bloque_incident=true et statut='bloque' jusqu'à décision du staff",
      "L'avion est mis aux enchères",
      "L'avion est transféré à une autre compagnie"
    ],
    "correct_answers": ["L'avion reçoit le flag bloque_incident=true et statut='bloque' jusqu'à décision du staff"]
  },
  {
    "id": "adm-196",
    "title": "Comment un admin peut-il voir tous les avions bloqués suite à des incidents ?",
    "options": [
      "Via /admin/incidents → filtre 'avions bloqués'",
      "Via /admin/avions filtré par statut=bloque",
      "Via /admin/compagnies → section incidents",
      "Via une requête SQL : SELECT * FROM compagnie_avions WHERE bloque_incident=true"
    ],
    "correct_answers": ["Via une requête SQL : SELECT * FROM compagnie_avions WHERE bloque_incident=true"]
  },
  {
    "id": "adm-197",
    "title": "Quel rôle de profil peut accéder à l'espace SIAVI ?",
    "options": [
      "Uniquement le rôle 'siavi'",
      "Le rôle 'siavi' ET les admins, plus les utilisateurs avec le flag 'siavi=true'",
      "Tous les pilotes avec plus de 100 heures",
      "Uniquement les instructeurs"
    ],
    "correct_answers": ["Le rôle 'siavi' ET les admins, plus les utilisateurs avec le flag 'siavi=true'"]
  },
  {
    "id": "adm-198",
    "title": "Comment ajouter le flag SIAVI à un pilote depuis l'admin ?",
    "options": [
      "Via /admin/pilotes/[id] → activer le flag SIAVI",
      "Via /admin/siavi → assigner l'utilisateur",
      "En modifiant le rôle principal en 'siavi'",
      "Via un formulaire Discord"
    ],
    "correct_answers": ["Via /admin/pilotes/[id] → activer le flag SIAVI"]
  },
  {
    "id": "adm-199",
    "title": "Qu'est-ce que la table 'reparation_entreprises' ?",
    "options": [
      "Les compagnies spécialisées dans la réparation d'avions PTFS",
      "Les entreprises de maintenance qui possèdent des hangars et effectuent les réparations",
      "Les fournisseurs de pièces détachées virtuelles",
      "Les ateliers de peinture d'avions"
    ],
    "correct_answers": ["Les entreprises de maintenance qui possèdent des hangars et effectuent les réparations"]
  },
  {
    "id": "adm-200",
    "title": "Comment créer une entreprise de réparation depuis l'admin ?",
    "options": [
      "Via /admin/reparation → Créer une entreprise",
      "Via /admin/compagnies → type réparation",
      "Via /admin/marketplace → entreprises",
      "Directement dans la base Supabase"
    ],
    "correct_answers": ["Via /admin/reparation → Créer une entreprise"]
  },
  {
    "id": "adm-201",
    "title": "Un pilote demande comment vérifier son solde Felitz. Où le trouver ?",
    "options": [
      "Sur la page /felitz-bank",
      "Dans son profil /compte",
      "Dans la messagerie, via les chèques reçus",
      "Sur la page /logbook"
    ],
    "correct_answers": ["Sur la page /felitz-bank"]
  },
  {
    "id": "adm-202",
    "title": "Qu'est-ce que le QCM 'Code de Conduite MIXOU AIRLINES PTFS' dans AeroSchool ?",
    "options": [
      "Un test sur le code de la route aérien international",
      "Un questionnaire sur les règles de comportement et d'usage du serveur PTFS",
      "Un examen de pilotage IFR",
      "Un test de connaissances sur les avions de la flotte"
    ],
    "correct_answers": ["Un questionnaire sur les règles de comportement et d'usage du serveur PTFS"]
  },
  {
    "id": "adm-203",
    "title": "Combien de questions contient le module Code de Conduite MIXOU AIRLINES PTFS ?",
    "options": ["100", "200", "300", "500"],
    "correct_answers": ["300"]
  },
  {
    "id": "adm-204",
    "title": "Comment exécuter une migration SQL sur le projet ?",
    "options": [
      "Via une commande CLI Next.js",
      "Dans l'éditeur SQL du dashboard Supabase",
      "Via un fichier .env de migrations",
      "Via le panneau admin du site"
    ],
    "correct_answers": ["Dans l'éditeur SQL du dashboard Supabase"]
  },
  {
    "id": "adm-205",
    "title": "Les migrations SQL du projet sont-elles idempotentes ?",
    "options": [
      "Non, les exécuter deux fois crée des doublons",
      "Oui, elles utilisent IF NOT EXISTS, ON CONFLICT DO NOTHING, etc. pour être sans danger",
      "Seulement certaines d'entre elles",
      "Cela dépend du type de migration"
    ],
    "correct_answers": ["Oui, elles utilisent IF NOT EXISTS, ON CONFLICT DO NOTHING, etc. pour être sans danger"]
  },
  {
    "id": "adm-206",
    "title": "Qu'est-ce qu'une politique RLS dans Supabase ?",
    "options": [
      "Row Level Security — contrôle d'accès aux données par utilisateur au niveau des lignes",
      "Relative Latency System — système d'optimisation des requêtes",
      "Runtime Logging Service — journalisation des erreurs",
      "Role Locking System — verrouillage des rôles"
    ],
    "correct_answers": ["Row Level Security — contrôle d'accès aux données par utilisateur au niveau des lignes"]
  },
  {
    "id": "adm-207",
    "title": "Pourquoi certaines opérations utilisent createAdminClient() plutôt que createClient() ?",
    "options": [
      "Pour des raisons de performance uniquement",
      "createAdminClient() utilise la clé service_role qui bypass les RLS pour les opérations admin",
      "createAdminClient() est plus récent et remplace createClient()",
      "Pour supporter les transactions Supabase"
    ],
    "correct_answers": ["createAdminClient() utilise la clé service_role qui bypass les RLS pour les opérations admin"]
  },
  {
    "id": "adm-208",
    "title": "Un pilote dit qu'il voit ses vols mais pas ceux des autres. C'est probablement dû à ?",
    "options": [
      "Un bug du navigateur",
      "Les politiques RLS de Supabase qui limitent l'accès aux données propres à chaque utilisateur",
      "Un problème de cache",
      "Une limitation de Vercel sur les requêtes"
    ],
    "correct_answers": ["Les politiques RLS de Supabase qui limitent l'accès aux données propres à chaque utilisateur"]
  },
  {
    "id": "adm-209",
    "title": "Comment un admin peut-il voir la liste des avions de toutes les compagnies ?",
    "options": [
      "Via /admin/avions — liste globale de tous les avions enregistrés",
      "Via /admin/flotte",
      "Via /admin/compagnies/[id]/avions pour chaque compagnie",
      "Via une requête SQL uniquement"
    ],
    "correct_answers": ["Via /admin/avions — liste globale de tous les avions enregistrés"]
  },
  {
    "id": "adm-210",
    "title": "Quelle est la différence entre le rôle 'instructeur' et le rôle 'pilote' sur le site ?",
    "options": [
      "L'instructeur a accès à des outils de correction de vols d'instruction",
      "Il n'y a pas de différence fonctionnelle",
      "L'instructeur peut créer des comptes pilotes",
      "L'instructeur est un admin limité"
    ],
    "correct_answers": ["L'instructeur a accès à des outils de correction de vols d'instruction"]
  },
  {
    "id": "adm-211",
    "title": "Qu'est-ce qu'un vol d'instruction sur le site ?",
    "options": [
      "Un vol uniquement en VFR",
      "Un vol enregistré avec un instructeur assigné, qui doit valider le vol au lieu des admins",
      "Un vol simulateur sans avion réel PTFS",
      "Un vol en formation avec plusieurs pilotes"
    ],
    "correct_answers": ["Un vol enregistré avec un instructeur assigné, qui doit valider le vol au lieu des admins"]
  },
  {
    "id": "adm-212",
    "title": "Comment un instructeur valide un vol d'instruction ?",
    "options": [
      "Via /admin/vols → valider",
      "Via /logbook → vols à confirmer — le vol apparaît dans sa liste à confirmer",
      "Via un formulaire spécial /instruction/valider",
      "Automatiquement après 48h sans action"
    ],
    "correct_answers": ["Via /logbook → vols à confirmer — le vol apparaît dans sa liste à confirmer"]
  },
  {
    "id": "adm-213",
    "title": "Quelle action de la messagerie permet à un PDG d'accepter une invitation d'alliance ?",
    "options": [
      "Le bouton 'Accepter' dans le message d'invitation reçu",
      "Via /ma-compagnie → Alliance → Accepter",
      "Via /alliance → Invitations en attente",
      "En répondant au message d'invitation"
    ],
    "correct_answers": ["Le bouton 'Accepter' dans le message d'invitation reçu"]
  },
  {
    "id": "adm-214",
    "title": "Comment un admin peut-il envoyer un message de diffusion à tous les pilotes ?",
    "options": [
      "Via la messagerie → mode diffusion (admin uniquement) → choisir l'audience",
      "Via /admin/messages → diffusion globale",
      "Via un webhook Discord uniquement",
      "Via un email en masse"
    ],
    "correct_answers": ["Via la messagerie → mode diffusion (admin uniquement) → choisir l'audience"]
  },
  {
    "id": "adm-215",
    "title": "Qu'est-ce que la page /aeroschool publique ?",
    "options": [
      "L'espace admin pour créer des modules",
      "Une page accessible sans connexion présentant les formulaires de test publiés",
      "Un portail de candidature pour les nouveaux membres",
      "Une galerie de diplômes des pilotes"
    ],
    "correct_answers": ["Une page accessible sans connexion présentant les formulaires de test publiés"]
  },
  {
    "id": "adm-216",
    "title": "Comment fonctionne l'anti-triche AeroSchool ?",
    "options": [
      "Via une surveillance par webcam",
      "En bloquant le copier-coller, le clic droit et les raccourcis d'impression/sauvegarde pendant le test",
      "Via une comparaison des réponses avec une IA",
      "Par limitation du temps de réponse à 30 secondes par question"
    ],
    "correct_answers": ["En bloquant le copier-coller, le clic droit et les raccourcis d'impression/sauvegarde pendant le test"]
  },
  {
    "id": "adm-217",
    "title": "Où sont stockées les images des avions de compagnie (livery/photo) pour l'ODW ?",
    "options": [
      "Dans la table compagnie_avions colonne avion_image_url",
      "Dans un bucket dédié 'avion-images'",
      "Dans la table types_avion",
      "Dans un CDN externe"
    ],
    "correct_answers": ["Dans la table compagnie_avions colonne avion_image_url"]
  },
  {
    "id": "adm-218",
    "title": "Comment un PDG peut-il ajouter une photo à un avion de sa flotte pour l'ODW ?",
    "options": [
      "Via /ma-compagnie → Flotte → modifier l'avion → uploader une image",
      "Via /admin/avions → modifier",
      "En envoyant l'image par messagerie à un admin",
      "Via une commande Discord"
    ],
    "correct_answers": ["Via /ma-compagnie → Flotte → modifier l'avion → uploader une image"]
  },
  {
    "id": "adm-219",
    "title": "Quel format est utilisé pour les images d'avions après upload ?",
    "options": [
      "PNG 4K non compressé",
      "JPEG recadré en 16:9, 1280x720",
      "WebP optimisé automatiquement",
      "GIF animé"
    ],
    "correct_answers": ["JPEG recadré en 16:9, 1280x720"]
  },
  {
    "id": "adm-220",
    "title": "Qu'est-ce que le script 'gen-cdc-module.mjs' dans le dossier scripts/ ?",
    "options": [
      "Un script de génération de données de test",
      "Un script qui génère le fichier SQL seed du module Code de Conduite depuis un JSON source",
      "Un générateur de migrations Supabase",
      "Un outil de minification du code"
    ],
    "correct_answers": ["Un script qui génère le fichier SQL seed du module Code de Conduite depuis un JSON source"]
  },
  {
    "id": "adm-221",
    "title": "Quelle page affiche le classement des pilotes par différentes catégories ?",
    "options": ["/classement", "/leaderboard", "/ranking", "/palmarès"],
    "correct_answers": ["/classement"]
  },
  {
    "id": "adm-222",
    "title": "Combien de catégories de classement existent sur le site ?",
    "options": ["5", "8", "10", "13"],
    "correct_answers": ["13"]
  },
  {
    "id": "adm-223",
    "title": "Un admin veut voir l'espace disque utilisé par Supabase Storage. Où trouver cette info ?",
    "options": ["/admin/storage-overview", "/admin/storage/usage", "/admin/disque", "/admin/espace"],
    "correct_answers": ["/admin/storage-overview"]
  },
  {
    "id": "adm-224",
    "title": "Quelle route API retourne les informations de configuration du site (maintenance, etc.) ?",
    "options": ["/api/config", "/api/site-config", "/api/settings", "/api/status"],
    "correct_answers": ["/api/site-config"]
  },
  {
    "id": "adm-225",
    "title": "Que fait l'endpoint /api/has-admin ?",
    "options": [
      "Vérifie si l'utilisateur connecté est admin",
      "Vérifie si au moins un compte admin existe dans la base, pour rediriger vers /setup si nécessaire",
      "Liste tous les admins du site",
      "Vérifie les permissions admin d'une route spécifique"
    ],
    "correct_answers": ["Vérifie si au moins un compte admin existe dans la base, pour rediriger vers /setup si nécessaire"]
  },
  {
    "id": "adm-226",
    "title": "Qu'est-ce que la page /admin/radar-beta ?",
    "options": [
      "Une version bêta du radar de trafic aérien",
      "Un accès admin à la fonctionnalité radar en phase de test avant déploiement global",
      "Un tableau de bord des performances radar",
      "Un simulateur de radar ATC"
    ],
    "correct_answers": ["Un accès admin à la fonctionnalité radar en phase de test avant déploiement global"]
  },
  {
    "id": "adm-227",
    "title": "Comment activer l'accès radar bêta pour un pilote ?",
    "options": [
      "Via /admin/pilotes/[id] → activer l'accès radar bêta",
      "En lui attribuant le rôle 'beta_testeur'",
      "Via /admin/radar-beta → whitelist",
      "Automatiquement après 200 heures de vol"
    ],
    "correct_answers": ["Via /admin/pilotes/[id] → activer l'accès radar bêta"]
  },
  {
    "id": "adm-228",
    "title": "Quelle est la page admin pour gérer les connexions Discord et OAuth ?",
    "options": ["/admin/discord", "/admin/oauth", "/admin/connexions", "/admin/securite"],
    "correct_answers": ["/admin/securite"]
  },
  {
    "id": "adm-229",
    "title": "Qu'est-ce que la variable d'environnement DISCORD_REQUIRED_ROLE_ID ?",
    "options": [
      "L'ID du rôle Discord requis pour accéder au site",
      "Le rôle Discord du bot ATIS",
      "Le rôle des admins sur Discord",
      "L'ID du serveur Discord"
    ],
    "correct_answers": ["L'ID du rôle Discord requis pour accéder au site"]
  },
  {
    "id": "adm-230",
    "title": "Quel est le rôle de la variable DISCORD_GUILD_ID côté site ?",
    "options": [
      "L'ID du salon Discord pour les notifications",
      "L'ID du serveur Discord dont les membres peuvent accéder au site",
      "L'ID de l'application Discord OAuth",
      "L'ID du channel ATIS Discord"
    ],
    "correct_answers": ["L'ID du serveur Discord dont les membres peuvent accéder au site"]
  },
  {
    "id": "adm-231",
    "title": "Qu'est-ce que l'Annuaire sur le site ?",
    "options": [
      "Un répertoire téléphonique des membres",
      "Une liste des pilotes avec leurs rôles, Discord et possibilité de leur envoyer un message",
      "Un annuaire des entreprises de réparation",
      "Un listing des aéroports disponibles"
    ],
    "correct_answers": ["Une liste des pilotes avec leurs rôles, Discord et possibilité de leur envoyer un message"]
  },
  {
    "id": "adm-232",
    "title": "Quelle action peut-on faire depuis une carte pilote dans l'Annuaire ?",
    "options": [
      "Voir son logbook complet",
      "Envoyer un message et copier son pseudo Discord",
      "Modifier ses rôles",
      "Démarrer un vol de formation"
    ],
    "correct_answers": ["Envoyer un message et copier son pseudo Discord"]
  },
  {
    "id": "adm-233",
    "title": "Quel format de vols est exigé pour un pilote souhaitant voler avec un avion de compagnie ?",
    "options": [
      "Uniquement les vols IFR",
      "Il dépose un plan de vol en sélectionnant l'avion de sa compagnie dans le formulaire",
      "Il doit d'abord créer un vol en autosurveillance",
      "Il utilise uniquement l'interface ATC pour déclarer le vol"
    ],
    "correct_answers": ["Il dépose un plan de vol en sélectionnant l'avion de sa compagnie dans le formulaire"]
  },
  {
    "id": "adm-234",
    "title": "Quelle vérification est faite lors d'un dépôt de plan de vol commercial avec beaucoup de passagers ?",
    "options": [
      "Que le pilote a la licence appropriée",
      "Que l'avion a une capacité suffisante et que la règle des 25% d'occupation est respectée (sauf vols locaux)",
      "Que la météo est favorable",
      "Que l'aéroport de destination est ouvert"
    ],
    "correct_answers": ["Que l'avion a une capacité suffisante et que la règle des 25% d'occupation est respectée (sauf vols locaux)"]
  },
  {
    "id": "adm-235",
    "title": "Pourquoi les vols locaux (même départ et arrivée) sont-ils exemptés de la règle d'occupation 25% ?",
    "options": [
      "C'est un bug non corrigé",
      "Parce que ce sont des vols d'entraînement ou locaux qui ne génèrent pas de revenus de billets normaux",
      "Parce que la règle ne s'applique qu'aux vols internationaux",
      "Parce que les avions locaux sont plus petits"
    ],
    "correct_answers": ["Parce que ce sont des vols d'entraînement ou locaux qui ne génèrent pas de revenus de billets normaux"]
  },
  {
    "id": "adm-236",
    "title": "Qu'est-ce que le module 'marche-cargo' ?",
    "options": [
      "Un marché pour acheter des avions cargo",
      "Un système de demande de transport de fret par liaison aéroportuaire",
      "Une boutique de marchandises virtuelles",
      "Un outil de gestion du poids des avions"
    ],
    "correct_answers": ["Un système de demande de transport de fret par liaison aéroportuaire"]
  },
  {
    "id": "adm-237",
    "title": "Comment un admin peut-il corriger une erreur de solde Felitz d'un compte ?",
    "options": [
      "Via /admin/felitz-bank → transaction manuelle de correction",
      "En modifiant directement la valeur dans la table felitz_comptes",
      "Via un formulaire de réclamation",
      "Il n'est pas possible de corriger manuellement un solde"
    ],
    "correct_answers": ["Via /admin/felitz-bank → transaction manuelle de correction"]
  },
  {
    "id": "adm-238",
    "title": "Quel type de compte Felitz reçoit les récompenses des missions MEDEVAC ?",
    "options": [
      "Le compte personnel de l'agent SIAVI",
      "Le compte collectif 'siavi' de la brigade",
      "Le compte de la compagnie de l'agent",
      "Un compte bloqué jusqu'à validation admin"
    ],
    "correct_answers": ["Le compte collectif 'siavi' de la brigade"]
  },
  {
    "id": "adm-239",
    "title": "Quel type de compte Felitz reçoit les récompenses des missions militaires ?",
    "options": [
      "Le compte personnel du pilote militaire",
      "Un compte militaire dédié distinct du compte pilote standard",
      "Le compte de l'état virtuel",
      "Le compte de la compagnie militaire"
    ],
    "correct_answers": ["Un compte militaire dédié distinct du compte pilote standard"]
  },
  {
    "id": "adm-240",
    "title": "Comment un admin voit-il toutes les transactions Felitz ?",
    "options": [
      "Via /admin/transactions",
      "Via /admin/felitz-bank — historique complet",
      "Via /admin/finances",
      "Via une requête SQL sur la table felitz_transactions"
    ],
    "correct_answers": ["Via /admin/felitz-bank — historique complet"]
  },
  {
    "id": "adm-241",
    "title": "Quel est le rôle des 'intentions de vol' dans un plan de vol ?",
    "options": [
      "L'objectif commercial ou opérationnel du vol (formation, cargo, passagers, ferry...)",
      "Le plan de navigation détaillé",
      "La durée estimée du vol",
      "Le niveau de vol prévu"
    ],
    "correct_answers": ["L'objectif commercial ou opérationnel du vol (formation, cargo, passagers, ferry...)"]
  },
  {
    "id": "adm-242",
    "title": "Que contient le champ 'instructions_atc' sur un plan de vol ?",
    "options": [
      "Les instructions météo pour le pilote",
      "Les notes et clearances rédigées par l'ATC visible uniquement du pilote",
      "Le log des communications radio",
      "Les instructions de sécurité obligatoires"
    ],
    "correct_answers": ["Les notes et clearances rédigées par l'ATC visible uniquement du pilote"]
  },
  {
    "id": "adm-243",
    "title": "Qu'est-ce que le champ 'route_ifr' dans un plan de vol ?",
    "options": [
      "La classification IFR ou VFR du vol",
      "La route en balises/waypoints pour les vols IFR (ex: TKO UM977 PEPAK...)",
      "Les restrictions de route imposées par l'ATC",
      "Le type de SID/STAR assigné"
    ],
    "correct_answers": ["La route en balises/waypoints pour les vols IFR (ex: TKO UM977 PEPAK...)"]
  },
  {
    "id": "adm-244",
    "title": "Un pilote dit que son plan de vol est 'depose' depuis 2 heures sans ATC. Que faire ?",
    "options": [
      "L'admin doit accepter le plan à la place de l'ATC",
      "Le pilote peut passer son plan en autosurveillance pour le clôturer sans ATC",
      "Annuler le plan et en redéposer un nouveau",
      "Contacter un ATC disponible via Discord"
    ],
    "correct_answers": ["Le pilote peut passer son plan en autosurveillance pour le clôturer sans ATC"]
  },
  {
    "id": "adm-245",
    "title": "Quelle page admin permet de surveiller les demandes de réparation en cours ?",
    "options": ["/admin/reparation", "/admin/maintenance", "/admin/hangar", "/admin/usure"],
    "correct_answers": ["/admin/reparation"]
  },
  {
    "id": "adm-246",
    "title": "Comment fonctionne le vol ferry automatique lors d'une réparation ?",
    "options": [
      "Un ATC virtuel effectue le vol automatiquement",
      "L'avion se déplace virtuellement sans pilote, visible sur l'ODW, depuis sa position vers le hangar",
      "Un pilote réel doit effectuer le ferry manuellement",
      "L'entreprise de réparation envoie un technicien virtuel"
    ],
    "correct_answers": ["L'avion se déplace virtuellement sans pilote, visible sur l'ODW, depuis sa position vers le hangar"]
  },
  {
    "id": "adm-247",
    "title": "Comment un PDG de compagnie peut-il annuler une demande de réparation ?",
    "options": [
      "Via /ma-compagnie → onglet Réparations → Annuler la demande",
      "Via un message à l'entreprise de réparation",
      "En contactant un admin",
      "Il est impossible d'annuler une réparation en cours"
    ],
    "correct_answers": ["Via /ma-compagnie → onglet Réparations → Annuler la demande"]
  },
  {
    "id": "adm-248",
    "title": "Que signifie le statut 'en_transit' pour un avion en réparation ?",
    "options": [
      "L'avion est en cours de livraison à un acheteur",
      "L'avion effectue le vol ferry vers le hangar de réparation",
      "L'avion est en transit international",
      "L'avion attend un créneau de maintenance"
    ],
    "correct_answers": ["L'avion effectue le vol ferry vers le hangar de réparation"]
  },
  {
    "id": "adm-249",
    "title": "Comment l'admin peut-il visualiser l'état de santé général du site ?",
    "options": [
      "Via /admin → tableau de bord avec compteurs (pilotes, vols, compagnies, actions en attente)",
      "Via /admin/health",
      "Via le tableau de bord Vercel",
      "Via /admin/status"
    ],
    "correct_answers": ["Via /admin → tableau de bord avec compteurs (pilotes, vols, compagnies, actions en attente)"]
  },
  {
    "id": "adm-250",
    "title": "Quelles statistiques affiche le dashboard admin principal ?",
    "options": [
      "Uniquement le nombre de pilotes",
      "Nombre de pilotes, compagnies, vols validés, et actions en attente par catégorie",
      "Le solde total de la Felitz Bank",
      "Les performances serveur (CPU, RAM)"
    ],
    "correct_answers": ["Nombre de pilotes, compagnies, vols validés, et actions en attente par catégorie"]
  },
  {
    "id": "adm-251",
    "title": "Un admin veut empêcher tous les nouveaux accès pendant une maintenance. Que faire ?",
    "options": [
      "Couper le service Vercel",
      "Mettre login_admin_only=true dans site_config — seuls les admins peuvent se connecter",
      "Modifier le fichier .env",
      "Bloquer tous les ports réseau"
    ],
    "correct_answers": ["Mettre login_admin_only=true dans site_config — seuls les admins peuvent se connecter"]
  },
  {
    "id": "adm-252",
    "title": "Qu'est-ce que le système de 'BRIA' dans les strips ATC ?",
    "options": [
      "Brigade de Régulation des Incidents Aériens",
      "Bot de Renseignement et d'Intelligence Aéronautique — IA de suggestion pour les ATC",
      "Base de Référence des Instructions ATC",
      "Bilan Régulier des Incidents Aéronautiques"
    ],
    "correct_answers": ["Bot de Renseignement et d'Intelligence Aéronautique — IA de suggestion pour les ATC"]
  },
  {
    "id": "adm-253",
    "title": "Quel format d'heure est utilisé partout sur le site pour les vols ?",
    "options": ["Heure locale", "UTC (Temps Universel Coordonné)", "GMT+12 (Polynésie)", "Heure du serveur Vercel"],
    "correct_answers": ["UTC (Temps Universel Coordonné)"]
  },
  {
    "id": "adm-254",
    "title": "Un pilote dit que l'heure affichée sur son vol est décalée. Que vérifier ?",
    "options": [
      "Que le serveur Vercel est dans le bon fuseau horaire",
      "Que le pilote regarde bien l'heure en UTC, pas en heure locale",
      "Que les logs du serveur sont à jour",
      "Que la base de données Supabase est synchronisée"
    ],
    "correct_answers": ["Que le pilote regarde bien l'heure en UTC, pas en heure locale"]
  },
  {
    "id": "adm-255",
    "title": "Qu'est-ce que la cloche de notifications sur le site pilote ?",
    "options": [
      "Un système d'alerte sonore pour les urgences",
      "Un panneau regroupant les actions requises (plans refusés, clôturés, confirmations) et les notifications classiques",
      "Un accès rapide à la messagerie",
      "Un indicateur de nouvelles mises à jour du site"
    ],
    "correct_answers": ["Un panneau regroupant les actions requises (plans refusés, clôturés, confirmations) et les notifications classiques"]
  },
  {
    "id": "adm-256",
    "title": "Comment un pilote peut-il 'ne pas enregistrer' un plan de vol clôturé depuis la cloche ?",
    "options": [
      "En cliquant 'Ne pas enregistrer ce vol' directement depuis la cloche de notifications",
      "En allant sur /logbook/plans-vol et en supprimant manuellement",
      "En contactant un admin",
      "Le plan est supprimé automatiquement après 7 jours"
    ],
    "correct_answers": ["En cliquant 'Ne pas enregistrer ce vol' directement depuis la cloche de notifications"]
  },
  {
    "id": "adm-257",
    "title": "Quelle page admin affiche les incidents de vol non encore examinés ?",
    "options": ["/admin/incidents filtré 'en attente'", "/admin/urgences", "/admin/sécurité/incidents", "/admin/alerts"],
    "correct_answers": ["/admin/incidents filtré 'en attente'"]
  },
  {
    "id": "adm-258",
    "title": "Comment un admin accède-t-il aux modules AeroSchool pour les modifier ?",
    "options": [
      "Via /admin/aeroschool → Modules",
      "Via /aeroschool/admin",
      "Via /admin/quiz",
      "Via /admin/formation/modules"
    ],
    "correct_answers": ["Via /admin/aeroschool → Modules"]
  },
  {
    "id": "adm-259",
    "title": "Peut-on modifier un module AeroSchool existant via l'interface admin ?",
    "options": [
      "Non, il faut recréer le module",
      "Oui, via /admin/aeroschool/[id] — on peut modifier les questions directement",
      "Seulement le titre peut être modifié",
      "Uniquement en ré-exécutant le script SQL"
    ],
    "correct_answers": ["Oui, via /admin/aeroschool/[id] — on peut modifier les questions directement"]
  },
  {
    "id": "adm-260",
    "title": "Que se passe-t-il si on exécute le seed SQL d'un module AeroSchool deux fois ?",
    "options": [
      "Cela crée un doublon du module",
      "Rien — l'INSERT utilise SELECT ... WHERE NOT EXISTS pour éviter les doublons",
      "Une erreur SQL est générée et l'exécution s'arrête",
      "Le module existant est remplacé"
    ],
    "correct_answers": ["Rien — l'INSERT utilise SELECT ... WHERE NOT EXISTS pour éviter les doublons"]
  },
  {
    "id": "adm-261",
    "title": "Comment un admin voit-il les réponses AeroSchool soumises par les candidats ?",
    "options": [
      "Via /admin/aeroschool/[id]/responses",
      "Via /admin/aeroschool/réponses",
      "Via /admin/examens",
      "Via une notification email"
    ],
    "correct_answers": ["Via /admin/aeroschool/[id]/responses"]
  },
  {
    "id": "adm-262",
    "title": "Qu'est-ce que la détection 'triche sur l'heure' dans AeroSchool ?",
    "options": [
      "Détection si le candidat a mis plus de temps que prévu",
      "Détection si le candidat a soumis le test avant le temps minimum attendu",
      "Détection si l'heure système a été manipulée",
      "Alerte si le candidat s'est connecté depuis plusieurs devices"
    ],
    "correct_answers": ["Détection si le candidat a soumis le test avant le temps minimum attendu"]
  },
  {
    "id": "adm-263",
    "title": "Peut-on utiliser le même avion de compagnie pour plusieurs plans de vol simultanés ?",
    "options": [
      "Oui, sans restriction",
      "Non, un avion ne peut être lié qu'à un seul plan de vol actif à la fois",
      "Oui, mais uniquement pour les vols IFR",
      "Seulement si le PDG l'autorise explicitement"
    ],
    "correct_answers": ["Non, un avion ne peut être lié qu'à un seul plan de vol actif à la fois"]
  },
  {
    "id": "adm-264",
    "title": "Comment le site détermine-t-il quel avion est 'en_vol' vs 'au_sol' ?",
    "options": [
      "Via une API GPS de PTFS",
      "Via le statut du plan de vol associé — si un plan actif existe pour cet avion, il est en vol",
      "Via le statut manuel défini par le PDG",
      "Automatiquement selon les heures de vols planifiées"
    ],
    "correct_answers": ["Via le statut du plan de vol associé — si un plan actif existe pour cet avion, il est en vol"]
  },
  {
    "id": "adm-265",
    "title": "Quelle est la différence entre createClient() et createAdminClient() côté serveur ?",
    "options": [
      "createClient() est pour le front-end, createAdminClient() pour le back-end",
      "createClient() respecte les RLS Supabase (contexte utilisateur), createAdminClient() les bypasse (service_role)",
      "createAdminClient() est plus lent mais plus sécurisé",
      "Il n'y a pas de différence fonctionnelle"
    ],
    "correct_answers": ["createClient() respecte les RLS Supabase (contexte utilisateur), createAdminClient() les bypasse (service_role)"]
  },
  {
    "id": "adm-266",
    "title": "Pourquoi la page /carte-atc est-elle accessible sans connexion ?",
    "options": [
      "C'est un bug de sécurité",
      "L'ODW est public par conception pour permettre à tout le monde de suivre les vols",
      "Parce que les données de vol sont publiques dans PTFS",
      "Pour les utilisateurs qui n'ont pas encore créé de compte"
    ],
    "correct_answers": ["L'ODW est public par conception pour permettre à tout le monde de suivre les vols"]
  },
  {
    "id": "adm-267",
    "title": "Comment fonctionne la pagination des strips dans l'interface ATC ?",
    "options": [
      "Via un défilement infini avec chargement progressif",
      "Via un tableau paginé avec 20 strips par page",
      "Il n'y a pas de pagination — tous les strips sont affichés dans un board scroll horizontal",
      "Via des onglets par zone (sol, départ, arrivée)"
    ],
    "correct_answers": ["Il n'y a pas de pagination — tous les strips sont affichés dans un board scroll horizontal"]
  },
  {
    "id": "adm-268",
    "title": "Qu'est-ce que le champ 'numero_vol' sur un strip ATC (ex: LH1234) ?",
    "options": [
      "Le numéro d'identification du plan de vol dans la base",
      "Le callsign radiophonique du vol, généralement le code OACI de la compagnie + numéro",
      "Le numéro de la piste d'atterrissage",
      "Un code interne du système ATC"
    ],
    "correct_answers": ["Le callsign radiophonique du vol, généralement le code OACI de la compagnie + numéro"]
  },
  {
    "id": "adm-269",
    "title": "Quelle est la différence entre 'ADEP' et 'ADES' sur un strip ATC ?",
    "options": [
      "ADEP = aérodrome de départ, ADES = aérodrome de destination",
      "ADEP = altitude de départ, ADES = altitude de destination",
      "ADEP = autorisation de départ, ADES = autorisation d'arrivée",
      "Ce sont des synonymes"
    ],
    "correct_answers": ["ADEP = aérodrome de départ, ADES = aérodrome de destination"]
  },
  {
    "id": "adm-270",
    "title": "Comment un admin peut-il consulter l'inventaire personnel des avions de tous les pilotes ?",
    "options": [
      "Via /admin/inventaire",
      "Via /admin/avions/personnels",
      "Via /admin/pilotes/[id] → inventaire",
      "Via une requête SQL uniquement"
    ],
    "correct_answers": ["Via /admin/inventaire"]
  },
  {
    "id": "adm-271",
    "title": "Qu'est-ce qu'un avion de l'inventaire personnel vs un avion de compagnie ?",
    "options": [
      "Pas de différence",
      "L'inventaire personnel est possédé par le pilote, l'avion de compagnie appartient à la compagnie",
      "L'inventaire personnel est gratuit, l'avion de compagnie est payant",
      "L'inventaire personnel est plus petit"
    ],
    "correct_answers": ["L'inventaire personnel est possédé par le pilote, l'avion de compagnie appartient à la compagnie"]
  },
  {
    "id": "adm-272",
    "title": "Quel outil admin permet de voir les fichiers orphelins (stockés mais non référencés) ?",
    "options": ["/admin/storage/orphans", "/admin/storage/cleanup", "/admin/fichiers/orphelins", "/admin/gc"],
    "correct_answers": ["/admin/storage/orphans"]
  },
  {
    "id": "adm-273",
    "title": "Pourquoi supprimer les fichiers orphelins du storage ?",
    "options": [
      "Pour améliorer les performances du site",
      "Pour libérer l'espace de stockage Supabase et éviter les frais inutiles",
      "Pour respecter le RGPD",
      "Pour éviter les erreurs 404"
    ],
    "correct_answers": ["Pour libérer l'espace de stockage Supabase et éviter les frais inutiles"]
  },
  {
    "id": "adm-274",
    "title": "Un admin veut voir tous les plans de vol d'une compagnie spécifique. Comment ?",
    "options": [
      "Via /admin/plans-vol filtré par compagnie",
      "Via /admin/compagnies/[id]/logbook",
      "Via une requête SQL sur plans_vol WHERE compagnie_id = '...'",
      "Via /admin/plans-vol → filtre compagnie"
    ],
    "correct_answers": ["Via /admin/plans-vol → filtre compagnie"]
  },
  {
    "id": "adm-275",
    "title": "Qu'est-ce que le code CTOT dans l'ICAO ?",
    "options": [
      "Code de Type d'Opération de Transit",
      "Calculated Take-Off Time — heure de décollage calculée/attribuée",
      "Centre de Traitement des Opérations de Transit",
      "Certificat de Transit et d'Opération de Tour"
    ],
    "correct_answers": ["Calculated Take-Off Time — heure de décollage calculée/attribuée"]
  },
  {
    "id": "adm-276",
    "title": "Comment le site gère-t-il les plans de vol MEDEVAC multi-segments ?",
    "options": [
      "Un seul plan de vol avec plusieurs étapes codées dedans",
      "Plusieurs plans liés entre eux via medevac_mission_id, avec un statut 'planifie_suivant' pour les segments futurs",
      "Des plans indépendants créés manuellement par l'agent SIAVI",
      "Via un module de planification de mission dédié"
    ],
    "correct_answers": ["Plusieurs plans liés entre eux via medevac_mission_id, avec un statut 'planifie_suivant' pour les segments futurs"]
  },
  {
    "id": "adm-277",
    "title": "Que signifie le statut 'en_pause' pour un plan MEDEVAC ?",
    "options": [
      "Le vol a été suspendu pour raisons météo",
      "Le segment en cours est terminé et le pilote attend avant d'activer le segment suivant",
      "L'agent SIAVI a mis la mission en attente",
      "Le plan est en attente de validation SIAVI"
    ],
    "correct_answers": ["Le segment en cours est terminé et le pilote attend avant d'activer le segment suivant"]
  },
  {
    "id": "adm-278",
    "title": "Comment un admin peut-il voir les missions militaires actives ?",
    "options": [
      "Via /admin/militaire → missions actives",
      "Via /militaire/admin",
      "Via /admin/armee → suivi des missions",
      "Via /admin/militaire"
    ],
    "correct_answers": ["Via /admin/militaire"]
  },
  {
    "id": "adm-279",
    "title": "Qu'est-ce que le calcul de l'écart de ponctualité (ecartPonctualiteMin) ?",
    "options": [
      "L'écart en minutes entre l'heure de dépôt du plan et l'heure de décollage réel",
      "L'écart entre l'heure d'arrivée prévue (CTOT + durée) et l'heure d'arrivée réelle (ATD + durée)",
      "L'écart entre la durée prévue et la durée réelle du vol",
      "La différence entre la météo prévue et réelle"
    ],
    "correct_answers": ["L'écart entre l'heure d'arrivée prévue (CTOT + durée) et l'heure d'arrivée réelle (ATD + durée)"]
  },
  {
    "id": "adm-280",
    "title": "Un admin remarque que le site est très lent pour les ATC. Quelle est la cause la plus probable ?",
    "options": [
      "Trop d'utilisateurs connectés simultanément",
      "Le bot ATIS sature la connexion réseau",
      "Le AutoRefresh déclenche trop souvent des rechargements SSR complets",
      "La base Supabase est pleine"
    ],
    "correct_answers": ["Le AutoRefresh déclenche trop souvent des rechargements SSR complets"]
  },
  {
    "id": "adm-281",
    "title": "Quelle est la fréquence actuelle de l'AutoRefresh dans le layout ATC ?",
    "options": ["Toutes les 8 secondes", "Toutes les 30 secondes", "Toutes les 60 secondes", "Toutes les 5 minutes"],
    "correct_answers": ["Toutes les 60 secondes"]
  },
  {
    "id": "adm-282",
    "title": "Pourquoi l'API /api/atc/strips a-t-elle été créée ?",
    "options": [
      "Pour fournir les strips aux appareils mobiles uniquement",
      "Pour remplacer les rechargements SSR complets par un fetch ciblé et rapide (~80ms) lors des actions sur strips",
      "Pour synchroniser les strips entre plusieurs navigateurs",
      "Pour l'audit des actions ATC"
    ],
    "correct_answers": ["Pour remplacer les rechargements SSR complets par un fetch ciblé et rapide (~80ms) lors des actions sur strips"]
  },
  {
    "id": "adm-283",
    "title": "Un ATC signale que le son de clôture ne se déclenche pas. Quelle est la cause habituelle ?",
    "options": [
      "Bug du navigateur",
      "Le navigateur n'a pas autorisé l'audio (l'AudioContext nécessite une interaction utilisateur préalable)",
      "Le serveur ne supporte pas l'audio",
      "Le volume système est coupé"
    ],
    "correct_answers": ["Le navigateur n'a pas autorisé l'audio (l'AudioContext nécessite une interaction utilisateur préalable)"]
  },
  {
    "id": "adm-284",
    "title": "Qu'est-ce que la 'stripsSignature' dans le code ATC ?",
    "options": [
      "La signature numérique des strips pour sécurité",
      "Un hash calculé à partir de l'état des strips pour détecter les changements et déclencher un resync",
      "Un identifiant unique par session ATC",
      "Le watermark visible sur les strips imprimés"
    ],
    "correct_answers": ["Un hash calculé à partir de l'état des strips pour détecter les changements et déclencher un resync"]
  },
  {
    "id": "adm-285",
    "title": "Quel champ est inclus dans la stripsSignature pour détecter les changements de statut ?",
    "options": [
      "Uniquement id et strip_zone",
      "id, strip_zone, strip_order, statut, code_transpondeur, mode_transpondeur",
      "id, numero_vol, statut",
      "Tous les champs du strip"
    ],
    "correct_answers": ["id, strip_zone, strip_order, statut, code_transpondeur, mode_transpondeur"]
  },
  {
    "id": "adm-286",
    "title": "Comment un admin peut-il voir les comptes Felitz de toutes les entités ?",
    "options": [
      "Via /admin/felitz-bank → liste des comptes",
      "Via une requête SQL sur felitz_comptes",
      "Via /admin/finances/comptes",
      "Via la page Felitz Bank standard avec accès admin étendu"
    ],
    "correct_answers": ["Via /admin/felitz-bank → liste des comptes"]
  },
  {
    "id": "adm-287",
    "title": "Que contient le champ 'note_atc' sur un plan de vol ?",
    "options": [
      "Les notes de l'ATC visibles uniquement en interne, pas du pilote",
      "Les instructions de l'ATC transmises au pilote",
      "Les notes de l'admin sur le plan",
      "Les notes de sécurité obligatoires"
    ],
    "correct_answers": ["Les notes de l'ATC visibles uniquement en interne, pas du pilote"]
  },
  {
    "id": "adm-288",
    "title": "Quel est le chemin correct pour accéder à la page de gestion des grades ATC depuis l'admin ATC ?",
    "options": ["/admin/atc/grades", "/atc/admin/grades", "/atc/admin → section Grades", "/admin/grades/atc"],
    "correct_answers": ["/atc/admin → section Grades"]
  },
  {
    "id": "adm-289",
    "title": "Un message d'erreur 'Session ATC expirée' s'affiche. Que doit faire l'ATC ?",
    "options": [
      "Vider le cache navigateur et redémarrer",
      "Se reconnecter au site et se remettre en service depuis l'interface ATC",
      "Contacter un admin pour réinitialiser sa session",
      "Actualiser la page (F5) uniquement"
    ],
    "correct_answers": ["Se reconnecter au site et se remettre en service depuis l'interface ATC"]
  },
  {
    "id": "adm-290",
    "title": "Quelle est la table qui stocke les sessions ATC actuellement actives ?",
    "options": ["atc_sessions_actives", "atc_sessions", "atc_connections", "sessions_atc"],
    "correct_answers": ["atc_sessions"]
  },
  {
    "id": "adm-291",
    "title": "Comment un admin accède-t-il au journal d'activité complet du site ?",
    "options": ["/admin/logs", "/admin/journal", "/admin/activite", "/admin/audit-trail"],
    "correct_answers": ["/admin/logs"]
  },
  {
    "id": "adm-292",
    "title": "Quelle page admin permet de créer un nouveau compte ATC ?",
    "options": ["/admin/atc/nouveau", "/atc/admin → Créer un compte ATC", "/admin/pilotes → Créer avec rôle ATC", "/admin/comptes/atc"],
    "correct_answers": ["/atc/admin → Créer un compte ATC"]
  },
  {
    "id": "adm-293",
    "title": "Comment savoir si un utilisateur a récemment tenté plusieurs connexions échouées ?",
    "options": [
      "Via /admin/securite → tentatives de connexion",
      "Via /admin/logs → filtrer sur les erreurs de connexion",
      "Via /admin/ips → activité suspecte",
      "Toutes ces méthodes sont possibles selon la gravité"
    ],
    "correct_answers": ["Toutes ces méthodes sont possibles selon la gravité"]
  },
  {
    "id": "adm-294",
    "title": "Quel est le délai de validité d'un code de vérification email lors de la connexion ?",
    "options": ["1 minute", "5 minutes", "10 minutes", "30 minutes"],
    "correct_answers": ["10 minutes"]
  },
  {
    "id": "adm-295",
    "title": "Que se passe-t-il si un pilote entre un mauvais code de vérification email 3 fois ?",
    "options": [
      "Son compte est automatiquement bloqué",
      "Il est déconnecté et doit recommencer la connexion",
      "Un email d'alerte est envoyé à l'admin",
      "Il doit attendre 1 heure avant de réessayer"
    ],
    "correct_answers": ["Il est déconnecté et doit recommencer la connexion"]
  },
  {
    "id": "adm-296",
    "title": "Comment fonctionne le système de sanction temporaire Discord sur le site ?",
    "options": [
      "La sanction est gérée entièrement sur Discord sans impact sur le site",
      "Le bot pousse la sanction via /api/discord/moderation-sync → le profil est bloqué jusqu'à la fin de la sanction",
      "L'admin bloque manuellement le compte sur le site",
      "La sanction est automatiquement levée après 24h"
    ],
    "correct_answers": ["Le bot pousse la sanction via /api/discord/moderation-sync → le profil est bloqué jusqu'à la fin de la sanction"]
  },
  {
    "id": "adm-297",
    "title": "Comment vérifier le numéro de version de PTFS Weblogbook déployé sur Vercel ?",
    "options": [
      "Via /admin → pied de page avec la version",
      "Via le hash du dernier commit Vercel dans le dashboard Vercel",
      "Via /api/version",
      "Via le fichier package.json affiché sur le site"
    ],
    "correct_answers": ["Via le hash du dernier commit Vercel dans le dashboard Vercel"]
  },
  {
    "id": "adm-298",
    "title": "Qu'est-ce que le cookie 'pending_login_verification' ?",
    "options": [
      "Un cookie de session de connexion permanente",
      "Un indicateur qu'une vérification email est en cours — redirige vers /login?step=verify si encore présent",
      "Un cookie de préférence de thème",
      "Un token de sécurité pour les opérations admin"
    ],
    "correct_answers": ["Un indicateur qu'une vérification email est en cours — redirige vers /login?step=verify si encore présent"]
  },
  {
    "id": "adm-299",
    "title": "Comment l'admin peut-il débloquer rapidement un pilote bloqué pour raison Discord sans accès SQL ?",
    "options": [
      "Via /admin/pilotes/[id] → bouton 'Forcer re-sync Discord'",
      "En modifiant son rôle dans /admin/pilotes/[id]",
      "Via /admin/securite → débloquer",
      "Il est obligatoire d'utiliser SQL pour cette opération"
    ],
    "correct_answers": ["Via /admin/pilotes/[id] → bouton 'Forcer re-sync Discord'"]
  },
  {
    "id": "adm-300",
    "title": "Quelle est la bonne pratique pour toute modification importante de la base Supabase en production ?",
    "options": [
      "Modifier directement sans backup",
      "Écrire une migration SQL idempotente, la tester, puis l'exécuter dans l'éditeur SQL Supabase",
      "Faire les modifications via l'interface Supabase Table Editor",
      "Demander à Vercel de déployer les changements"
    ],
    "correct_answers": ["Écrire une migration SQL idempotente, la tester, puis l'exécuter dans l'éditeur SQL Supabase"]
  }
]$adm$
WHERE NOT EXISTS (
  SELECT 1 FROM aeroschool_question_modules
  WHERE title = 'Administration & Fonctionnement du site — Certification Admin'
);
