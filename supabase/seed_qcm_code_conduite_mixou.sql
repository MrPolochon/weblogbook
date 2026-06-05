-- ============================================================
-- Module de questions : Code de Conduite MIXOU AIRLINES PTFS — Test de Connaissance
-- Version source : V5.0.0.3 — 300 questions (QCM, 1 bonne réponse).
-- Banque pour AeroSchool (aeroschool_question_modules).
-- Généré depuis scripts/cdc-module.json via scripts/gen-cdc-module.mjs — NE PAS éditer à la main.
-- ============================================================
--
-- Non destructif : aucune suppression. L'insertion n'a lieu que si aucun module
-- ne porte déjà ce titre, donc le script peut être relancé sans créer de doublon.
-- (Pour mettre à jour un module existant, modifiez-le via l'admin AeroSchool.)

INSERT INTO aeroschool_question_modules (title, questions)
SELECT
  'Code de Conduite MIXOU AIRLINES PTFS — Test de Connaissance',
  $cdc$[
  {
    "id": "cdc-001",
    "title": "À qui est réservé l'usage du ping sur le serveur MIXOU AIRLINES PTFS ?",
    "options": [
      "À tous les membres sans restriction",
      "Uniquement en cas d'urgence ou à l'utilisation par le staff",
      "Aux membres ayant au moins 1 mois d'ancienneté",
      "Aux membres possédant un rôle communautaire"
    ],
    "correct_answers": [
      "Uniquement en cas d'urgence ou à l'utilisation par le staff"
    ]
  },
  {
    "id": "cdc-002",
    "title": "Qui peut utiliser les pings de notifications sélectionnables dans le salon prévu à cet effet ?",
    "options": [
      "Tous les membres du serveur",
      "Les membres avec un rôle décoratif",
      "Uniquement le staff",
      "Les membres ayant plus de 3 mois d'ancienneté"
    ],
    "correct_answers": [
      "Uniquement le staff"
    ]
  },
  {
    "id": "cdc-003",
    "title": "Que risque un membre qui ping un staff sans raison valable ?",
    "options": [
      "Rien, c'est toléré",
      "Un avertissement",
      "Un bannissement immédiat",
      "Une mise en sourdine définitive"
    ],
    "correct_answers": [
      "Un avertissement"
    ]
  },
  {
    "id": "cdc-004",
    "title": "Qui est autorisé à utiliser le ping de rôles collectifs comme @everyone ou @here ?",
    "options": [
      "Tous les membres",
      "Les membres avec un rôle de modération uniquement",
      "Personne, ces pings sont désactivés",
      "Exclusivement le staff, pour des annonces officielles ou urgences"
    ],
    "correct_answers": [
      "Exclusivement le staff, pour des annonces officielles ou urgences"
    ]
  },
  {
    "id": "cdc-005",
    "title": "Le 'ping spam' — pings excessifs ou répétés d'un même membre — est considéré comme :",
    "options": [
      "Une blague tolérée entre amis",
      "Une forme de harcèlement passible de sanctions",
      "Un comportement mineur sans conséquence",
      "Une infraction uniquement si la cible est un modérateur"
    ],
    "correct_answers": [
      "Une forme de harcèlement passible de sanctions"
    ]
  },
  {
    "id": "cdc-006",
    "title": "Que peut faire un membre ayant reçu un ping non sollicité et répété ?",
    "options": [
      "Répondre par un ping spam en retour",
      "Le signaler au staff via le canal de signalement",
      "Expulser directement le membre concerné",
      "Ignorer la situation sans rien faire"
    ],
    "correct_answers": [
      "Le signaler au staff via le canal de signalement"
    ]
  },
  {
    "id": "cdc-007",
    "title": "Comment les rôles sont-ils attribués sur le serveur MIXOU AIRLINES PTFS ?",
    "options": [
      "Les membres peuvent s'attribuer eux-mêmes n'importe quel rôle",
      "Par le staff selon des critères définis",
      "Par vote des membres du serveur",
      "Automatiquement selon l'ancienneté"
    ],
    "correct_answers": [
      "Par le staff selon des critères définis"
    ]
  },
  {
    "id": "cdc-008",
    "title": "Est-il permis à un membre de se comporter comme s'il détenait un rôle supérieur au sien ?",
    "options": [
      "Oui, si un modérateur l'autorise oralement",
      "Oui, lors des événements spéciaux",
      "Non, c'est strictement interdit",
      "Oui, si le membre est en période de stage"
    ],
    "correct_answers": [
      "Non, c'est strictement interdit"
    ]
  },
  {
    "id": "cdc-009",
    "title": "Laquelle des conditions suivantes peut être requise pour l'obtention d'un rôle ?",
    "options": [
      "Payer une cotisation mensuelle",
      "Avoir été banni au moins une fois",
      "La réussite d'un processus de candidature ou d'entretien",
      "Être membre depuis moins de 7 jours"
    ],
    "correct_answers": [
      "La réussite d'un processus de candidature ou d'entretien"
    ]
  },
  {
    "id": "cdc-010",
    "title": "Le staff peut-il retirer un rôle à un membre ?",
    "options": [
      "Non, jamais sans l'accord du membre",
      "Oui, à tout moment, sans préavis, en cas de manquement",
      "Oui, mais uniquement après un vote communautaire",
      "Oui, uniquement les rôles décoratifs"
    ],
    "correct_answers": [
      "Oui, à tout moment, sans préavis, en cas de manquement"
    ]
  },
  {
    "id": "cdc-011",
    "title": "Que risque un membre qui exerce des pressions sur le staff pour obtenir un rôle ?",
    "options": [
      "Une mise en sourdine de 24h",
      "Aucune conséquence si la demande est polie",
      "Une sanction pour tentative de pression",
      "Un avertissement uniquement en cas de récidive"
    ],
    "correct_answers": [
      "Une sanction pour tentative de pression"
    ]
  },
  {
    "id": "cdc-012",
    "title": "Les rôles décoratifs ou communautaires confèrent-ils des droits supplémentaires en modération ?",
    "options": [
      "Oui, ils permettent de muter des membres",
      "Oui, ils permettent d'accéder aux salons staff",
      "Non, ils n'octroient aucun droit supplémentaire en modération",
      "Oui, uniquement dans les salons vocaux"
    ],
    "correct_answers": [
      "Non, ils n'octroient aucun droit supplémentaire en modération"
    ]
  },
  {
    "id": "cdc-013",
    "title": "Comment un membre peut-il contester le retrait ou l'attribution d'un rôle ?",
    "options": [
      "En publiant un message dans le salon général",
      "En soumettant une contestation écrite au staff via le canal approprié",
      "En contactant directement un Fondateur par DM",
      "En organisant un vote entre membres"
    ],
    "correct_answers": [
      "En soumettant une contestation écrite au staff via le canal approprié"
    ]
  },
  {
    "id": "cdc-014",
    "title": "Quelle est la valeur fondamentale mise en avant à l'article 3 du Code de Conduite ?",
    "options": [
      "La compétitivité entre membres",
      "L'ancienneté et la hiérarchie",
      "Le respect mutuel",
      "La productivité opérationnelle"
    ],
    "correct_answers": [
      "Le respect mutuel"
    ]
  },
  {
    "id": "cdc-015",
    "title": "La discrimination basée sur l'origine, la religion ou le genre est :",
    "options": [
      "Tolérée si elle reste dans le cadre du roleplay",
      "Strictement interdite et passible de sanctions immédiates",
      "Autorisée dans les salons vocaux Chill",
      "Sanctionnée uniquement en cas de plainte"
    ],
    "correct_answers": [
      "Strictement interdite et passible de sanctions immédiates"
    ]
  },
  {
    "id": "cdc-016",
    "title": "Comment doivent être réglés les conflits entre membres ?",
    "options": [
      "Publiquement dans le salon général pour plus de transparence",
      "Par un duel vocal organisé par le staff",
      "De manière calme et respectueuse, avec le staff si nécessaire",
      "En ignorant le conflit jusqu'à ce qu'il se résolve seul"
    ],
    "correct_answers": [
      "De manière calme et respectueuse, avec le staff si nécessaire"
    ]
  },
  {
    "id": "cdc-017",
    "title": "Les pseudonymes à caractère offensant ou imitant un membre du staff sont :",
    "options": [
      "Autorisés si le membre concerné ne s'en plaint pas",
      "Interdits et peuvent entraîner un changement forcé ou une exclusion temporaire",
      "Tolérés uniquement pendant les événements",
      "Sanctionnés uniquement si le pseudo imite un Fondateur"
    ],
    "correct_answers": [
      "Interdits et peuvent entraîner un changement forcé ou une exclusion temporaire"
    ]
  },
  {
    "id": "cdc-018",
    "title": "L'usurpation d'identité d'un membre du staff constitue :",
    "options": [
      "Une infraction mineure",
      "Une faute grave passible d'une exclusion immédiate et définitive",
      "Un comportement sanctionné par un simple avertissement",
      "Une infraction uniquement si le staff concerné porte plainte"
    ],
    "correct_answers": [
      "Une faute grave passible d'une exclusion immédiate et définitive"
    ]
  },
  {
    "id": "cdc-019",
    "title": "Le 'trolling' — comportement visant à perturber délibérément la tranquillité du serveur — est :",
    "options": [
      "Accepté dans les salons Chill uniquement",
      "Toléré si pratiqué entre amis",
      "Sanctionnable",
      "Autorisé pendant les événements spéciaux"
    ],
    "correct_answers": [
      "Sanctionnable"
    ]
  },
  {
    "id": "cdc-020",
    "title": "La publicité pour d'autres serveurs Discord sans autorisation préalable du staff peut entraîner :",
    "options": [
      "Un avertissement verbal",
      "Une mise en sourdine de 48h",
      "Une exclusion immédiate du serveur",
      "La suppression du message uniquement"
    ],
    "correct_answers": [
      "Une exclusion immédiate du serveur"
    ]
  },
  {
    "id": "cdc-021",
    "title": "Est-il permis de simuler un incident terroriste sur le serveur Discord, le site ou en jeu ?",
    "options": [
      "Oui, uniquement dans le cadre d'un scénario roleplay approuvé",
      "Oui, dans les salons vocaux Fréquence uniquement",
      "Non, c'est strictement interdit sur tous les supports",
      "Oui, si tous les membres impliqués sont d'accord"
    ],
    "correct_answers": [
      "Non, c'est strictement interdit sur tous les supports"
    ]
  },
  {
    "id": "cdc-022",
    "title": "Que doit faire un membre qui a connaissance d'un comportement enfreignant le code de conduite ?",
    "options": [
      "Le signaler publiquement pour alerter la communauté",
      "L'ignorer si ce n'est pas dirigé contre lui",
      "Le signaler au staff dans les plus brefs délais",
      "Gérer la situation directement avec le membre fautif"
    ],
    "correct_answers": [
      "Le signaler au staff dans les plus brefs délais"
    ]
  },
  {
    "id": "cdc-023",
    "title": "Que doit faire un membre avant d'envoyer un message dans un salon textuel ?",
    "options": [
      "Demander la permission à un modérateur",
      "Vérifier la description du salon pour s'assurer que son message est dans le sujet prévu",
      "Attendre d'avoir au moins 5 messages dans le serveur",
      "Mentionner le sujet dans son message"
    ],
    "correct_answers": [
      "Vérifier la description du salon pour s'assurer que son message est dans le sujet prévu"
    ]
  },
  {
    "id": "cdc-024",
    "title": "Lequel des contenus suivants est interdit dans les salons HRP ?",
    "options": [
      "Les discussions sur l'aviation",
      "Les contenus à caractère sexuel ou suggestif",
      "Les discussions sur les jeux vidéo",
      "Les captures d'écran de vols"
    ],
    "correct_answers": [
      "Les contenus à caractère sexuel ou suggestif"
    ]
  },
  {
    "id": "cdc-025",
    "title": "Comment le staff peut-il réagir face à des débats politiques ou religieux dans les salons HRP ?",
    "options": [
      "Il ne peut pas intervenir, la liberté d'expression prévaut",
      "Il doit organiser un vote sur le sujet",
      "Il se réserve le droit d'interrompre tout échange jugé problématique",
      "Il doit laisser les membres régler ça entre eux"
    ],
    "correct_answers": [
      "Il se réserve le droit d'interrompre tout échange jugé problématique"
    ]
  },
  {
    "id": "cdc-026",
    "title": "Quel format est prévu pour envoyer un message HRP dans un salon roleplay ?",
    "options": [
      "Il suffit de commencer le message par [HRP]",
      "Les balises comme (( message HRP )) ou tout format défini par le staff",
      "Il faut envoyer le message en italique",
      "Il faut mentionner un modérateur avant d'envoyer le message"
    ],
    "correct_answers": [
      "Les balises comme (( message HRP )) ou tout format défini par le staff"
    ]
  },
  {
    "id": "cdc-027",
    "title": "Le 'RP de mauvaise foi' — comportement incohérent ou absurde visant à perturber un scénario — est :",
    "options": [
      "Toléré si le membre s'excuse ensuite",
      "Interdit et sanctionnable",
      "Autorisé lors des événements compétitifs",
      "Toléré uniquement dans les salons HRP"
    ],
    "correct_answers": [
      "Interdit et sanctionnable"
    ]
  },
  {
    "id": "cdc-028",
    "title": "Le cadre fictif du roleplay justifie-t-il des propos discriminatoires ou offensants ?",
    "options": [
      "Oui, tout ce qui se passe en RP reste en RP",
      "Oui, si les autres joueurs sont d'accord",
      "Non, le cadre fictif ne constitue jamais une justification",
      "Oui, uniquement pour des infractions légères"
    ],
    "correct_answers": [
      "Non, le cadre fictif ne constitue jamais une justification"
    ]
  },
  {
    "id": "cdc-029",
    "title": "Les règles de comportement général de l'article 3 s'appliquent-elles dans les salons vocaux ?",
    "options": [
      "Non, les salons vocaux sont régis par des règles distinctes",
      "Oui, le fait de communiquer à l'oral n'exonère pas du respect des règles",
      "Oui, mais seulement dans les salons vocaux opérationnels",
      "Non, la communication orale est libre de toute contrainte"
    ],
    "correct_answers": [
      "Oui, le fait de communiquer à l'oral n'exonère pas du respect des règles"
    ]
  },
  {
    "id": "cdc-030",
    "title": "L'utilisation de soundboards perturbateurs dans un salon vocal peut entraîner :",
    "options": [
      "Rien tant que les autres membres ne se plaignent pas",
      "Un déplacement, une mise en sourdine ou une expulsion du salon par le staff",
      "Un simple avertissement verbal uniquement",
      "Une restriction d'accès aux salons HRP uniquement"
    ],
    "correct_answers": [
      "Un déplacement, une mise en sourdine ou une expulsion du salon par le staff"
    ]
  },
  {
    "id": "cdc-031",
    "title": "À quoi sont dédiés les salons vocaux Fréquence ?",
    "options": [
      "Aux discussions libres entre membres",
      "Aux cours de formation des nouveaux membres",
      "Aux communications officielles dans le cadre des opérations MIXOU AIRLINES",
      "Aux réunions internes du staff"
    ],
    "correct_answers": [
      "Aux communications officielles dans le cadre des opérations MIXOU AIRLINES"
    ]
  },
  {
    "id": "cdc-032",
    "title": "Les conversations hors contexte opérationnel dans les salons Fréquence sont :",
    "options": [
      "Tolérées en dehors des heures d'opérations",
      "Strictement interdites",
      "Autorisées si elles sont courtes",
      "Autorisées avec l'accord d'un membre du staff"
    ],
    "correct_answers": [
      "Strictement interdites"
    ]
  },
  {
    "id": "cdc-033",
    "title": "Comment un membre doit-il prendre la parole durant un cours en vocal ?",
    "options": [
      "En coupant la parole si sa question est urgente",
      "En envoyant un message dans le salon textuel associé",
      "En demandant la parole, par exemple via la fonctionnalité 'lever la main' Discord, et en attendant l'autorisation",
      "En prenant la parole librement dès que le formateur fait une pause"
    ],
    "correct_answers": [
      "En demandant la parole, par exemple via la fonctionnalité 'lever la main' Discord, et en attendant l'autorisation"
    ]
  },
  {
    "id": "cdc-034",
    "title": "Est-il permis d'enregistrer et de diffuser le contenu d'un cours en vocal sans autorisation ?",
    "options": [
      "Oui, si c'est à des fins personnelles uniquement",
      "Non, le contenu des cours est propriété intellectuelle du serveur et nécessite une autorisation explicite",
      "Oui, tant que l'enregistrement n'est pas public",
      "Oui, si le formateur n'a pas explicitement interdit l'enregistrement"
    ],
    "correct_answers": [
      "Non, le contenu des cours est propriété intellectuelle du serveur et nécessite une autorisation explicite"
    ]
  },
  {
    "id": "cdc-035",
    "title": "Les instructions délivrées dans les salons vocaux d'instructions sont de nature :",
    "options": [
      "Informative et non contraignante",
      "Officielle et contraignante",
      "Optionnelle, à la discrétion de chaque membre",
      "Valable uniquement pour les membres du staff"
    ],
    "correct_answers": [
      "Officielle et contraignante"
    ]
  },
  {
    "id": "cdc-036",
    "title": "Comment un membre doit-il exprimer son désaccord avec une instruction reçue ?",
    "options": [
      "En interrompant la session pour en débattre immédiatement",
      "En ignorant l'instruction et en agissant selon sa propre appréciation",
      "En en faisant part au staff via le canal approprié, après la fin de la session",
      "En votant contre l'instruction dans le salon prévu"
    ],
    "correct_answers": [
      "En en faisant part au staff via le canal approprié, après la fin de la session"
    ]
  },
  {
    "id": "cdc-037",
    "title": "L'utilisation de soundboards dans les salons vocaux Chill est :",
    "options": [
      "Strictement interdite en toutes circonstances",
      "Tolérée à condition qu'elle ne soit pas excessive ou gênante, et doit cesser sur plainte",
      "Autorisée sans aucune restriction",
      "Autorisée uniquement entre 20h et minuit"
    ],
    "correct_answers": [
      "Tolérée à condition qu'elle ne soit pas excessive ou gênante, et doit cesser sur plainte"
    ]
  },
  {
    "id": "cdc-038",
    "title": "Monopoliser un salon Chill en restant muet de manière prolongée pour en bloquer l'accès est :",
    "options": [
      "Toléré tant que le membre est connecté",
      "Interdit, et le staff peut expulser le membre",
      "Autorisé s'il n'y a pas d'autres membres qui souhaitent l'utiliser",
      "Sans conséquence si le membre est un instructeur"
    ],
    "correct_answers": [
      "Interdit, et le staff peut expulser le membre"
    ]
  },
  {
    "id": "cdc-039",
    "title": "Combien d'instances juridiques composent le système de gestion des litiges du serveur ?",
    "options": [
      "Une seule : la Cour Suprême",
      "Trois : le Tribunal, la Cour d'Appel, et la Cour Suprême",
      "Deux : le Tribunal Administratif et la Cour Suprême",
      "Quatre, une par niveau hiérarchique"
    ],
    "correct_answers": [
      "Deux : le Tribunal Administratif et la Cour Suprême"
    ]
  },
  {
    "id": "cdc-040",
    "title": "Est-il permis de régler un différend publiquement dans les salons du serveur ?",
    "options": [
      "Oui, pour plus de transparence",
      "Oui, si les deux parties sont d'accord",
      "Non, c'est strictement interdit",
      "Oui, dans les salons HRP uniquement"
    ],
    "correct_answers": [
      "Non, c'est strictement interdit"
    ]
  },
  {
    "id": "cdc-041",
    "title": "Le Tribunal Administratif est compétent pour traiter :",
    "options": [
      "Tous les litiges du serveur, RP et HRP",
      "Exclusivement les litiges survenant dans le cadre du Roleplay",
      "Les litiges entre membres du staff uniquement",
      "Les litiges liés aux exclusions définitives"
    ],
    "correct_answers": [
      "Exclusivement les litiges survenant dans le cadre du Roleplay"
    ]
  },
  {
    "id": "cdc-042",
    "title": "Que doit fournir le membre saisissant le Tribunal Administratif ?",
    "options": [
      "Uniquement son pseudo et la date des faits",
      "Un exposé clair et détaillé des faits, accompagné de preuves si disponibles",
      "Une liste de témoins uniquement",
      "Un paiement en monnaie RP à titre de frais de dossier"
    ],
    "correct_answers": [
      "Un exposé clair et détaillé des faits, accompagné de preuves si disponibles"
    ]
  },
  {
    "id": "cdc-043",
    "title": "Une décision du Tribunal Administratif peut-elle faire l'objet d'un appel ?",
    "options": [
      "Non, ses décisions sont définitives et sans appel",
      "Oui, auprès de la Cour Suprême, à condition d'apporter des éléments nouveaux ou de justifier d'une irrégularité",
      "Oui, auprès des Fondateurs directement",
      "Oui, mais uniquement dans les 72 heures"
    ],
    "correct_answers": [
      "Oui, auprès de la Cour Suprême, à condition d'apporter des éléments nouveaux ou de justifier d'une irrégularité"
    ]
  },
  {
    "id": "cdc-044",
    "title": "La Cour Suprême est compétente pour traiter :",
    "options": [
      "Uniquement les litiges RP",
      "Uniquement les litiges impliquant des Fondateurs",
      "Tout type de litige, RP ou HRP, et constitue la juridiction de dernier ressort",
      "Uniquement les appels contre le Tribunal Administratif"
    ],
    "correct_answers": [
      "Tout type de litige, RP ou HRP, et constitue la juridiction de dernier ressort"
    ]
  },
  {
    "id": "cdc-045",
    "title": "Les décisions de la Cour Suprême sont :",
    "options": [
      "Susceptibles d'appel auprès des Fondateurs",
      "Définitives et sans appel, s'imposant à tous y compris le staff",
      "Valables uniquement pour 30 jours",
      "Révisables sur demande motivée dans les 48 heures"
    ],
    "correct_answers": [
      "Définitives et sans appel, s'imposant à tous y compris le staff"
    ]
  },
  {
    "id": "cdc-046",
    "title": "La confidentialité des procédures juridiques est :",
    "options": [
      "Optionnelle, les parties peuvent divulguer les informations",
      "Garantie ; la divulgation publique est sanctionnée disciplinairement",
      "Applicable uniquement aux affaires HRP",
      "Requise uniquement pour les Fondateurs"
    ],
    "correct_answers": [
      "Garantie ; la divulgation publique est sanctionnée disciplinairement"
    ]
  },
  {
    "id": "cdc-047",
    "title": "Tenter d'intimider ou corrompre un membre d'une instance juridique constitue :",
    "options": [
      "Un acte sans conséquence si non prouvé",
      "Une infraction légère sanctionnée par un avertissement",
      "Une faute grave sanctionnée indépendamment de l'issue du litige",
      "Un motif d'appel recevable"
    ],
    "correct_answers": [
      "Une faute grave sanctionnée indépendamment de l'issue du litige"
    ]
  },
  {
    "id": "cdc-048",
    "title": "Quel est le rang le plus élevé dans la hiérarchie du serveur MIXOU AIRLINES PTFS ?",
    "options": [
      "L'Administration",
      "Les Modérateurs",
      "Les Fondateurs",
      "Les Instructeurs"
    ],
    "correct_answers": [
      "Les Fondateurs"
    ]
  },
  {
    "id": "cdc-049",
    "title": "Les membres de la direction sont-ils soumis au Code de Conduite ?",
    "options": [
      "Non, ils en sont exemptés en raison de leur rang",
      "Oui, au même titre que les membres ordinaires",
      "Oui, mais avec des sanctions allégées",
      "Non, ils sont uniquement soumis au règlement interne du staff"
    ],
    "correct_answers": [
      "Oui, au même titre que les membres ordinaires"
    ]
  },
  {
    "id": "cdc-050",
    "title": "Combien de Fondateurs dirige le serveur MIXOU AIRLINES PTFS ?",
    "options": [
      "Un seul",
      "Deux",
      "Trois",
      "Cinq"
    ],
    "correct_answers": [
      "Trois"
    ]
  },
  {
    "id": "cdc-051",
    "title": "Qui est habilité à modifier ou abroger le Code de Conduite ?",
    "options": [
      "N'importe quel membre du staff",
      "L'Administration uniquement",
      "Les Fondateurs uniquement",
      "La Cour Suprême"
    ],
    "correct_answers": [
      "Les Fondateurs uniquement"
    ]
  },
  {
    "id": "cdc-052",
    "title": "Comment les Fondateurs prennent-ils les décisions majeures ?",
    "options": [
      "De manière individuelle, chaque Fondateur décide dans son domaine",
      "De manière collégiale, dans un esprit de consensus",
      "Par délégation à l'Administration",
      "Par vote des membres du serveur"
    ],
    "correct_answers": [
      "De manière collégiale, dans un esprit de consensus"
    ]
  },
  {
    "id": "cdc-053",
    "title": "Selon l'amendement V5.0.0.3, qu'est-ce qu'une décision majeure ?",
    "options": [
      "Toute décision prise sans consulter les membres",
      "Toute décision ayant un impact structurel, irréversible ou engageant durablement l'avenir du serveur",
      "Toute décision impliquant une sanction disciplinaire",
      "Toute décision organisationnelle quotidienne"
    ],
    "correct_answers": [
      "Toute décision ayant un impact structurel, irréversible ou engageant durablement l'avenir du serveur"
    ]
  },
  {
    "id": "cdc-054",
    "title": "Une décision non majeure peut-elle être prise par un seul Fondateur ?",
    "options": [
      "Non, toujours collégiale",
      "Oui, sans nécessiter de concertation collégiale préalable",
      "Oui, mais elle doit être validée sous 24h par les autres Fondateurs",
      "Non, elle doit être soumise à l'Administration"
    ],
    "correct_answers": [
      "Oui, sans nécessiter de concertation collégiale préalable"
    ]
  },
  {
    "id": "cdc-055",
    "title": "Qui nomme les membres de l'Administration ?",
    "options": [
      "Les membres du serveur par vote",
      "La Modération",
      "Les Fondateurs",
      "La Cour Suprême"
    ],
    "correct_answers": [
      "Les Fondateurs"
    ]
  },
  {
    "id": "cdc-056",
    "title": "L'Administration est chargée de superviser :",
    "options": [
      "Uniquement les événements communautaires",
      "La Modération et le Staff Stagiaire",
      "Uniquement les Instructeurs",
      "Les membres ordinaires uniquement"
    ],
    "correct_answers": [
      "La Modération et le Staff Stagiaire"
    ]
  },
  {
    "id": "cdc-057",
    "title": "La Modération constitue quel échelon dans la hiérarchie ?",
    "options": [
      "Le premier échelon",
      "Le deuxième échelon",
      "Le troisième échelon",
      "Le quatrième échelon"
    ],
    "correct_answers": [
      "Le deuxième échelon"
    ]
  },
  {
    "id": "cdc-058",
    "title": "Un modérateur peut-il prendre des décisions engageant le serveur de manière irréversible sans accord de l'Administration ?",
    "options": [
      "Oui, c'est sa prérogative",
      "Oui, en cas d'urgence uniquement",
      "Non, il doit en référer à l'Administration ou aux Fondateurs",
      "Oui, s'il est titulaire depuis plus de 6 mois"
    ],
    "correct_answers": [
      "Non, il doit en référer à l'Administration ou aux Fondateurs"
    ]
  },
  {
    "id": "cdc-059",
    "title": "Le Staff Stagiaire représente quel échelon dans la hiérarchie ?",
    "options": [
      "Le deuxième échelon",
      "Le troisième échelon",
      "Le quatrième échelon",
      "Le cinquième échelon"
    ],
    "correct_answers": [
      "Le quatrième échelon"
    ]
  },
  {
    "id": "cdc-060",
    "title": "À l'issue de la période de stage, quelles sont les issues possibles ?",
    "options": [
      "Titularisation ou fin de stage uniquement",
      "Titularisation, prolongation du stage, ou fin du stage",
      "Titularisation ou bannissement",
      "Uniquement la titularisation si le stage est complété"
    ],
    "correct_answers": [
      "Titularisation, prolongation du stage, ou fin du stage"
    ]
  },
  {
    "id": "cdc-061",
    "title": "Les Instructeurs disposent-ils d'un pouvoir disciplinaire ?",
    "options": [
      "Oui, ils peuvent prononcer des avertissements",
      "Oui, mais uniquement dans les salons vocaux",
      "Non, ils n'ont aucun pouvoir disciplinaire",
      "Oui, s'ils sont désignés par l'Administration"
    ],
    "correct_answers": [
      "Non, ils n'ont aucun pouvoir disciplinaire"
    ]
  },
  {
    "id": "cdc-062",
    "title": "Que doit faire un Instructeur face à une situation nécessitant une intervention disciplinaire ?",
    "options": [
      "Gérer la situation lui-même pour ne pas déranger le staff",
      "Alerter immédiatement un membre de la Modération ou de l'Administration",
      "Prononcer un avertissement verbal en attendant un modérateur",
      "Ignorer la situation si elle est mineure"
    ],
    "correct_answers": [
      "Alerter immédiatement un membre de la Modération ou de l'Administration"
    ]
  },
  {
    "id": "cdc-063",
    "title": "Les deux catégories de sanctions définies à l'article 8 sont :",
    "options": [
      "Sanctions verbales et sanctions écrites",
      "Sanctions légères et sanctions lourdes",
      "Sanctions RP et sanctions HRP",
      "Sanctions internes et sanctions externes"
    ],
    "correct_answers": [
      "Sanctions RP et sanctions HRP"
    ]
  },
  {
    "id": "cdc-064",
    "title": "Un membre ordinaire peut-il sanctionner un autre membre ?",
    "options": [
      "Oui, en cas d'urgence",
      "Non, cela relève de la compétence exclusive de la direction",
      "Oui, s'il a été désigné représentant de la communauté",
      "Oui, pour des infractions mineures uniquement"
    ],
    "correct_answers": [
      "Non, cela relève de la compétence exclusive de la direction"
    ]
  },
  {
    "id": "cdc-065",
    "title": "Quel principe est au cœur du système de sanctions du serveur ?",
    "options": [
      "Le principe de tolérance zéro",
      "Le principe d'équité communautaire",
      "Le principe de proportionnalité",
      "Le principe de sévérité maximale"
    ],
    "correct_answers": [
      "Le principe de proportionnalité"
    ]
  },
  {
    "id": "cdc-066",
    "title": "Comment s'appelle le dispositif de protection contre les raids sur le serveur ?",
    "options": [
      "L'Escudo Anti-Raid",
      "Le Bouclier MIXOU",
      "Le Parapluie Anti-Raid",
      "La Forteresse Discord"
    ],
    "correct_answers": [
      "Le Parapluie Anti-Raid"
    ]
  },
  {
    "id": "cdc-067",
    "title": "Quels sont les deux bots de modération officielle du serveur ?",
    "options": [
      "MEE6 et Dyno",
      "JeanJacques et Wick",
      "Carlbot et Atlas",
      "Wick et Rythm"
    ],
    "correct_answers": [
      "JeanJacques et Wick"
    ]
  },
  {
    "id": "cdc-068",
    "title": "Tenter de contourner ou désactiver les bots JeanJacques ou Wick peut entraîner :",
    "options": [
      "Un avertissement verbal",
      "Une mise en sourdine de 24 heures",
      "Des sanctions immédiates pouvant aller jusqu'au bannissement définitif",
      "La perte d'un rôle décoratif"
    ],
    "correct_answers": [
      "Des sanctions immédiates pouvant aller jusqu'au bannissement définitif"
    ]
  },
  {
    "id": "cdc-069",
    "title": "L'avertissement verbal RP est prononcé pour :",
    "options": [
      "Des infractions graves et répétées",
      "Des infractions mineures et ponctuelles",
      "Toute infraction aux règles RP quelle que soit sa gravité",
      "Uniquement pour les membres en période de stage"
    ],
    "correct_answers": [
      "Des infractions mineures et ponctuelles"
    ]
  },
  {
    "id": "cdc-070",
    "title": "Combien d'avertissements écrits RP entraînent automatiquement un blâme RP ?",
    "options": [
      "Deux",
      "Trois",
      "Quatre",
      "Cinq"
    ],
    "correct_answers": [
      "Trois"
    ]
  },
  {
    "id": "cdc-071",
    "title": "L'amende RP est prélevée sur :",
    "options": [
      "Le compte bancaire réel du membre",
      "Les fonds du membre ou de sa compagnie dans l'économie simulée",
      "Le budget du serveur Discord",
      "Le solde de récompenses communautaires du membre"
    ],
    "correct_answers": [
      "Les fonds du membre ou de sa compagnie dans l'économie simulée"
    ]
  },
  {
    "id": "cdc-072",
    "title": "Que se passe-t-il si une amende RP n'est pas payée dans le délai imparti ?",
    "options": [
      "Elle est annulée automatiquement",
      "Des pénalités supplémentaires peuvent s'appliquer, allant jusqu'à la suspension des activités RP",
      "Elle est transmise à la Cour Suprême",
      "Elle est doublée et transformée en blâme"
    ],
    "correct_answers": [
      "Des pénalités supplémentaires peuvent s'appliquer, allant jusqu'à la suspension des activités RP"
    ]
  },
  {
    "id": "cdc-073",
    "title": "La mise sous surveillance de licence est :",
    "options": [
      "La sanction la plus grave liée aux licences",
      "Une mesure préventive pouvant précéder une suspension ou un retrait de licence",
      "Une sanction identique à la suspension de licence",
      "Une restriction uniquement applicable aux pilotes"
    ],
    "correct_answers": [
      "Une mesure préventive pouvant précéder une suspension ou un retrait de licence"
    ]
  },
  {
    "id": "cdc-074",
    "title": "Le retrait définitif de licence entraîne :",
    "options": [
      "La perte de la licence pour 30 jours",
      "La perte permanente et irrévocable de la licence, sauf décision exceptionnelle des Fondateurs",
      "La perte de la licence jusqu'au passage d'un nouvel examen",
      "La suspension des activités de la compagnie"
    ],
    "correct_answers": [
      "La perte permanente et irrévocable de la licence, sauf décision exceptionnelle des Fondateurs"
    ]
  },
  {
    "id": "cdc-075",
    "title": "La dissolution forcée d'une compagnie est prononcée par :",
    "options": [
      "N'importe quel membre de la Modération",
      "Le Tribunal Administratif uniquement",
      "Exclusivement les Fondateurs ou la Cour Suprême",
      "L'Administration sur simple décision"
    ],
    "correct_answers": [
      "Exclusivement les Fondateurs ou la Cour Suprême"
    ]
  },
  {
    "id": "cdc-076",
    "title": "La rétrogradation RP consiste en :",
    "options": [
      "L'exclusion temporaire de tous les salons",
      "La perte d'un ou plusieurs grades ou rôles dans le cadre du roleplay",
      "La réinitialisation du logbook du pilote",
      "La suspension du compte Discord du membre"
    ],
    "correct_answers": [
      "La perte d'un ou plusieurs grades ou rôles dans le cadre du roleplay"
    ]
  },
  {
    "id": "cdc-077",
    "title": "L'exclusion RP définitive entraîne :",
    "options": [
      "L'interdiction de rejoindre le serveur Discord",
      "L'interdiction permanente de participer à toute activité RP, avec réinitialisation complète du dossier RP",
      "La perte de tous les rôles décoratifs",
      "La suspension des droits vocaux pour 30 jours"
    ],
    "correct_answers": [
      "L'interdiction permanente de participer à toute activité RP, avec réinitialisation complète du dossier RP"
    ]
  },
  {
    "id": "cdc-078",
    "title": "La mise en sourdine (Mute) est une restriction :",
    "options": [
      "Définitive et irrévocable",
      "Temporaire, empêchant d'envoyer des messages et/ou de parler en vocal",
      "Applicable uniquement dans les salons RP",
      "Prononcée uniquement par les Fondateurs"
    ],
    "correct_answers": [
      "Temporaire, empêchant d'envoyer des messages et/ou de parler en vocal"
    ]
  },
  {
    "id": "cdc-079",
    "title": "Quelle est la différence entre un kick et un bannissement temporaire ?",
    "options": [
      "Il n'y a aucune différence",
      "Le kick est une expulsion temporaire avec possibilité de rejoindre ; le bannissement temporaire est une exclusion pour une durée déterminée",
      "Le kick est prononcé par les Fondateurs ; le bannissement par la Modération",
      "Le kick s'applique aux salons vocaux ; le bannissement aux salons textuels"
    ],
    "correct_answers": [
      "Le kick est une expulsion temporaire avec possibilité de rejoindre ; le bannissement temporaire est une exclusion pour une durée déterminée"
    ]
  },
  {
    "id": "cdc-080",
    "title": "Qui est le seul à pouvoir prononcer un bannissement définitif ?",
    "options": [
      "N'importe quel modérateur",
      "L'Administration",
      "La Cour Suprême",
      "Exclusivement les Fondateurs"
    ],
    "correct_answers": [
      "Exclusivement les Fondateurs"
    ]
  },
  {
    "id": "cdc-081",
    "title": "Le bannissement définitif peut-il faire l'objet d'un appel auprès des instances internes ?",
    "options": [
      "Oui, auprès de la Cour Suprême",
      "Oui, auprès des Fondateurs dans les 30 jours",
      "Non, seuls les Fondateurs peuvent le lever, à titre exceptionnel et après délai à leur discrétion",
      "Oui, si le membre apporte des preuves nouvelles"
    ],
    "correct_answers": [
      "Non, seuls les Fondateurs peuvent le lever, à titre exceptionnel et après délai à leur discrétion"
    ]
  },
  {
    "id": "cdc-082",
    "title": "Laquelle des situations suivantes constitue une circonstance AGGRAVANTE ?",
    "options": [
      "Être à sa première infraction",
      "Avoir spontanément reconnu les faits",
      "Avoir commis l'infraction avec préméditation",
      "Avoir coopéré activement avec le staff"
    ],
    "correct_answers": [
      "Avoir commis l'infraction avec préméditation"
    ]
  },
  {
    "id": "cdc-083",
    "title": "Laquelle des situations suivantes constitue une circonstance ATTÉNUANTE ?",
    "options": [
      "La récidive",
      "L'incitation d'autres membres à participer à l'infraction",
      "La dissimulation des faits malgré des preuves",
      "La coopération active du membre avec le staff"
    ],
    "correct_answers": [
      "La coopération active du membre avec le staff"
    ]
  },
  {
    "id": "cdc-084",
    "title": "Un membre faisant l'objet d'une procédure disciplinaire dispose-t-il du droit d'être entendu ?",
    "options": [
      "Non, la décision est prise sans audition",
      "Oui, sauf en cas d'urgence nécessitant une intervention immédiate",
      "Oui, mais uniquement pour les sanctions RP",
      "Non, c'est la prérogative exclusive du staff"
    ],
    "correct_answers": [
      "Oui, sauf en cas d'urgence nécessitant une intervention immédiate"
    ]
  },
  {
    "id": "cdc-085",
    "title": "Toute sanction prononcée doit être notifiée :",
    "options": [
      "Oralement uniquement",
      "Par affichage public dans le salon d'annonces",
      "Par écrit, en précisant la nature de l'infraction, la sanction, sa durée et les voies de recours",
      "Uniquement si le membre la conteste"
    ],
    "correct_answers": [
      "Par écrit, en précisant la nature de l'infraction, la sanction, sa durée et les voies de recours"
    ]
  },
  {
    "id": "cdc-086",
    "title": "Les événements organisés sur le serveur sont-ils soumis au Code de Conduite ?",
    "options": [
      "Non, les événements ont leurs propres règles indépendantes",
      "Oui, tous les événements sont soumis aux règles du Code de Conduite",
      "Uniquement les événements compétitifs",
      "Uniquement les événements roleplay"
    ],
    "correct_answers": [
      "Oui, tous les événements sont soumis aux règles du Code de Conduite"
    ]
  },
  {
    "id": "cdc-087",
    "title": "L'organisation des événements relève de la compétence de :",
    "options": [
      "N'importe quel membre ayant plus de 30 jours d'ancienneté",
      "L'Administration et des Fondateurs",
      "La Modération uniquement",
      "Un comité d'événements élu par les membres"
    ],
    "correct_answers": [
      "L'Administration et des Fondateurs"
    ]
  },
  {
    "id": "cdc-088",
    "title": "Un membre inscrit à un événement et ne pouvant pas y participer doit :",
    "options": [
      "Ne rien faire, les absences sont toujours excusées",
      "En informer le staff organisateur dans les meilleurs délais",
      "Se faire remplacer par un autre membre sans prévenir",
      "Annuler son inscription 24h à l'avance minimum"
    ],
    "correct_answers": [
      "En informer le staff organisateur dans les meilleurs délais"
    ]
  },
  {
    "id": "cdc-089",
    "title": "Dans quel délai une contestation des résultats d'un événement compétitif doit-elle être soumise ?",
    "options": [
      "48 heures",
      "72 heures",
      "24 heures",
      "1 semaine"
    ],
    "correct_answers": [
      "24 heures"
    ]
  },
  {
    "id": "cdc-090",
    "title": "En cas de suspicion de triche lors d'un événement compétitif, le staff peut :",
    "options": [
      "Uniquement émettre un avertissement",
      "Disqualifier immédiatement le membre ou l'équipe concernée",
      "Annuler l'événement pour tout le monde",
      "Demander un revote des participants"
    ],
    "correct_answers": [
      "Disqualifier immédiatement le membre ou l'équipe concernée"
    ]
  },
  {
    "id": "cdc-091",
    "title": "Les événements spéciaux peuvent-ils déroger à certaines règles habituelles ?",
    "options": [
      "Non, jamais",
      "Oui, dans les limites définies par les Fondateurs et précisées dans l'annonce",
      "Oui, sans aucune limite",
      "Uniquement avec l'accord unanime du staff"
    ],
    "correct_answers": [
      "Oui, dans les limites définies par les Fondateurs et précisées dans l'annonce"
    ]
  },
  {
    "id": "cdc-092",
    "title": "Que se passe-t-il si un événement est interrompu à cause du comportement d'un membre ?",
    "options": [
      "L'événement est simplement reporté sans sanction",
      "Les sanctions prévues à l'article 8 sont appliquées aux membres responsables",
      "Un vote est organisé pour décider des sanctions",
      "Seul un avertissement verbal est émis"
    ],
    "correct_answers": [
      "Les sanctions prévues à l'article 8 sont appliquées aux membres responsables"
    ]
  },
  {
    "id": "cdc-093",
    "title": "Le logbook est une obligation pour quel type de membre ?",
    "options": [
      "Tous les membres du serveur",
      "Uniquement les membres du staff",
      "Tout membre titulaire d'une licence de pilotage RP",
      "Uniquement les commandants de bord"
    ],
    "correct_answers": [
      "Tout membre titulaire d'une licence de pilotage RP"
    ]
  },
  {
    "id": "cdc-094",
    "title": "L'enregistrement dans le logbook est-il automatique ?",
    "options": [
      "Oui, via le système du site MIXOU AIRLINES",
      "Non, c'est une démarche exclusivement manuelle",
      "Oui, pour les vols commerciaux uniquement",
      "Oui, dès lors que le membre est connecté en jeu"
    ],
    "correct_answers": [
      "Non, c'est une démarche exclusivement manuelle"
    ]
  },
  {
    "id": "cdc-095",
    "title": "Lequel des éléments suivants N'est PAS requis dans une entrée de logbook ?",
    "options": [
      "La date et l'heure du vol RP",
      "L'aéroport de départ et d'arrivée",
      "Le numéro de série de l'aéronef",
      "La durée du vol"
    ],
    "correct_answers": [
      "Le numéro de série de l'aéronef"
    ]
  },
  {
    "id": "cdc-096",
    "title": "L'absence de tenue du logbook ou des entrées incomplètes peuvent entraîner :",
    "options": [
      "Un blâme HRP",
      "Une mise sous surveillance de licence",
      "Un bannissement temporaire",
      "La perte du rôle de pilote uniquement"
    ],
    "correct_answers": [
      "Une mise sous surveillance de licence"
    ]
  },
  {
    "id": "cdc-097",
    "title": "Que doit faire un pompier RP ou un ATC RP lorsqu'il met fin à son service ?",
    "options": [
      "Envoyer un message dans le salon opérationnel",
      "Déconnecter sa position avant de quitter le jeu ou Discord",
      "Informer un modérateur par DM",
      "Transférer sa position à un collègue disponible"
    ],
    "correct_answers": [
      "Déconnecter sa position avant de quitter le jeu ou Discord"
    ]
  },
  {
    "id": "cdc-098",
    "title": "Qu'est-ce qu'une déconnexion administrative ?",
    "options": [
      "Une déconnexion volontaire effectuée par le staff",
      "Une déconnexion forcée par le système du site en l'absence de déconnexion volontaire",
      "Une déconnexion suite à une sanction HRP",
      "Une déconnexion planifiée pour maintenance"
    ],
    "correct_answers": [
      "Une déconnexion forcée par le système du site en l'absence de déconnexion volontaire"
    ]
  },
  {
    "id": "cdc-099",
    "title": "Une déconnexion administrative entraîne automatiquement :",
    "options": [
      "Un avertissement écrit HRP",
      "Une sanction RP par le système du site, de manière indépendante",
      "La suspension du compte Discord du membre",
      "La perte immédiate de la licence concernée"
    ],
    "correct_answers": [
      "Une sanction RP par le système du site, de manière indépendante"
    ]
  },
  {
    "id": "cdc-100",
    "title": "Le non-respect répété des obligations opérationnelles de l'article 10 constitue :",
    "options": [
      "Une circonstance atténuante",
      "Un motif d'exclusion automatique",
      "Une circonstance aggravante au sens de l'article 8.37",
      "Un motif de prolongation du stage pour les stagiaires"
    ],
    "correct_answers": [
      "Une circonstance aggravante au sens de l'article 8.37"
    ]
  },
  {
    "id": "cdc-101",
    "title": "Selon l'article 1.2, les pings de notifications sont sélectionnables dans quel lieu ?",
    "options": [
      "Le salon des règles",
      "Le salon prévu à cet effet",
      "Le salon des annonces",
      "Le salon général"
    ],
    "correct_answers": [
      "Le salon prévu à cet effet"
    ]
  },
  {
    "id": "cdc-102",
    "title": "Un membre peut-il pinger un autre membre hors du cercle d'amis de ce dernier ?",
    "options": [
      "Oui, librement",
      "Oui, en cas d'urgence uniquement",
      "Non, seul le staff peut pinger des personnes en dehors du cercle d'amis",
      "Oui, s'il détient un rôle communautaire"
    ],
    "correct_answers": [
      "Non, seul le staff peut pinger des personnes en dehors du cercle d'amis"
    ]
  },
  {
    "id": "cdc-103",
    "title": "La hiérarchie des rôles est-elle stricte sur le serveur ?",
    "options": [
      "Non, elle est flexible selon les besoins",
      "Oui, il est interdit de se comporter comme détenteur d'un rôle supérieur",
      "Oui, mais uniquement pour les membres du staff",
      "Non, les membres peuvent librement choisir leur rôle"
    ],
    "correct_answers": [
      "Oui, il est interdit de se comporter comme détenteur d'un rôle supérieur"
    ]
  },
  {
    "id": "cdc-104",
    "title": "La diffusion de rumeurs ou de propos diffamatoires envers un membre est :",
    "options": [
      "Tolérée si non prouvée",
      "Formellement prohibée",
      "Autorisée dans les salons HRP uniquement",
      "Sanctionnée uniquement si la victime porte plainte"
    ],
    "correct_answers": [
      "Formellement prohibée"
    ]
  },
  {
    "id": "cdc-105",
    "title": "Les menaces directes ou indirectes entre membres sont :",
    "options": [
      "Tolérées dans le cadre du roleplay",
      "Formellement prohibées sur l'ensemble du serveur",
      "Sanctionnées uniquement si répétées",
      "Autorisées si les deux parties sont consentantes"
    ],
    "correct_answers": [
      "Formellement prohibées sur l'ensemble du serveur"
    ]
  },
  {
    "id": "cdc-106",
    "title": "Le spam — envoi répété de messages sans valeur ajoutée — est :",
    "options": [
      "Toléré dans les salons Chill",
      "Strictement interdit dans l'ensemble des salons textuels",
      "Autorisé dans les salons HRP le week-end",
      "Sanctionné uniquement s'il dure plus de 5 messages"
    ],
    "correct_answers": [
      "Strictement interdit dans l'ensemble des salons textuels"
    ]
  },
  {
    "id": "cdc-107",
    "title": "L'utilisation d'un microphone de mauvaise qualité générant des nuisances persistantes malgré les remarques peut être sanctionnée ?",
    "options": [
      "Non, c'est hors du contrôle du membre",
      "Oui, cela est listé parmi les perturbations interdites",
      "Uniquement si le salon est un salon Fréquence",
      "Non, la qualité audio est personnelle"
    ],
    "correct_answers": [
      "Oui, cela est listé parmi les perturbations interdites"
    ]
  },
  {
    "id": "cdc-108",
    "title": "Rejoindre un salon de cours en cours de session sans y être invité peut entraîner :",
    "options": [
      "Un avertissement verbal",
      "Une expulsion immédiate du salon",
      "Une mise en sourdine de 10 minutes",
      "Aucune conséquence si le membre reste silencieux"
    ],
    "correct_answers": [
      "Une expulsion immédiate du salon"
    ]
  },
  {
    "id": "cdc-109",
    "title": "Les membres participant à un cours doivent couper leur micro :",
    "options": [
      "Seulement quand le formateur le demande explicitement",
      "Lorsqu'ils n'ont pas la parole, sauf instruction contraire du formateur",
      "Jamais, pour permettre des échanges spontanés",
      "Uniquement pendant les exercices pratiques"
    ],
    "correct_answers": [
      "Lorsqu'ils n'ont pas la parole, sauf instruction contraire du formateur"
    ]
  },
  {
    "id": "cdc-110",
    "title": "Le Tribunal Administratif est-il compétent pour les litiges HRP ?",
    "options": [
      "Oui, pour tous les types de litiges",
      "Oui, mais uniquement pour les litiges HRP mineurs",
      "Non, tout litige avec une dimension HRP relève de la Cour Suprême",
      "Oui, en première instance seulement"
    ],
    "correct_answers": [
      "Non, tout litige avec une dimension HRP relève de la Cour Suprême"
    ]
  },
  {
    "id": "cdc-111",
    "title": "La Cour Suprême peut-elle recommander des réformes du Code de Conduite ?",
    "options": [
      "Non, c'est la prérogative exclusive des Fondateurs",
      "Oui, si une affaire révèle un vide juridique ou une disposition inadaptée",
      "Oui, à la majorité simple de ses membres",
      "Non, le Code ne peut pas être modifié par une instance juridique"
    ],
    "correct_answers": [
      "Oui, si une affaire révèle un vide juridique ou une disposition inadaptée"
    ]
  },
  {
    "id": "cdc-112",
    "title": "Selon l'amendement V5.0.0.3, le Code de Conduite a été adopté :",
    "options": [
      "Par décision unilatérale des Fondateurs",
      "Par vote unanime des membres du serveur",
      "À la majorité, après soumission au vote de l'ensemble du staff",
      "Sans vote, par publication directe"
    ],
    "correct_answers": [
      "À la majorité, après soumission au vote de l'ensemble du staff"
    ]
  },
  {
    "id": "cdc-113",
    "title": "En cas de désaccord entre Fondateurs sur la qualification d'une décision, que se passe-t-il ?",
    "options": [
      "Le Fondateur le plus ancien tranche",
      "La décision est annulée définitivement",
      "La procédure de vote interne s'applique et la décision est suspendue jusqu'à l'issue du vote",
      "L'Administration est consultée pour arbitrage"
    ],
    "correct_answers": [
      "La procédure de vote interne s'applique et la décision est suspendue jusqu'à l'issue du vote"
    ]
  },
  {
    "id": "cdc-114",
    "title": "La fin du stage entraîne-t-elle une sanction disciplinaire contre le stagiaire ?",
    "options": [
      "Oui, un blâme HRP est automatiquement inscrit",
      "Non, la fin du stage n'entraîne aucune sanction disciplinaire",
      "Oui, un avertissement écrit est prononcé",
      "Cela dépend des raisons de la fin du stage"
    ],
    "correct_answers": [
      "Non, la fin du stage n'entraîne aucune sanction disciplinaire"
    ]
  },
  {
    "id": "cdc-115",
    "title": "L'avertissement verbal RP fait-il l'objet d'une inscription formelle dans le dossier RP du membre ?",
    "options": [
      "Oui, toujours",
      "Non, mais il est noté en interne par le staff",
      "Oui, mais uniquement en cas de récidive",
      "Non, il n'est jamais consigné"
    ],
    "correct_answers": [
      "Non, mais il est noté en interne par le staff"
    ]
  },
  {
    "id": "cdc-116",
    "title": "La mise sous administration provisoire d'une compagnie est prononcée par :",
    "options": [
      "N'importe quel modérateur",
      "Le Tribunal Administratif ou l'Administration du serveur",
      "La Cour Suprême uniquement",
      "Les Fondateurs uniquement"
    ],
    "correct_answers": [
      "Le Tribunal Administratif ou l'Administration du serveur"
    ]
  },
  {
    "id": "cdc-117",
    "title": "Avoir incité d'autres membres à participer à une infraction est :",
    "options": [
      "Une circonstance atténuante",
      "Neutre, sans impact sur la sanction",
      "Une circonstance aggravante",
      "Pris en compte uniquement pour les infractions HRP"
    ],
    "correct_answers": [
      "Une circonstance aggravante"
    ]
  },
  {
    "id": "cdc-118",
    "title": "Les sanctions prononcées peuvent-elles être révisées à la baisse ?",
    "options": [
      "Non, les sanctions sont irréversibles",
      "Oui, si le membre démontre une évolution positive de son comportement",
      "Oui, uniquement pour les sanctions RP",
      "Oui, mais uniquement à la demande des Fondateurs"
    ],
    "correct_answers": [
      "Oui, si le membre démontre une évolution positive de son comportement"
    ]
  },
  {
    "id": "cdc-119",
    "title": "Un événement peut-il exclure délibérément des membres sur des critères discriminatoires ?",
    "options": [
      "Oui, si l'événement requiert des compétences spécifiques",
      "Non, aucun événement ne peut être conçu de manière discriminatoire",
      "Oui, pour les événements compétitifs",
      "Oui, si les Fondateurs l'approuvent"
    ],
    "correct_answers": [
      "Non, aucun événement ne peut être conçu de manière discriminatoire"
    ]
  },
  {
    "id": "cdc-120",
    "title": "Le staff peut-il annuler un événement sans préavis ?",
    "options": [
      "Non, il doit prévenir 24h à l'avance",
      "Oui, en cas de force majeure",
      "Non, uniquement le reporter",
      "Oui, à condition de rembourser les récompenses promises"
    ],
    "correct_answers": [
      "Oui, en cas de force majeure"
    ]
  },
  {
    "id": "cdc-121",
    "title": "Le format du logbook (numérique, papier RP, formulaire du site) est laissé à la discrétion du pilote, sous quelle condition ?",
    "options": [
      "Qu'il soit validé par un instructeur",
      "Que les informations requises soient clairement renseignées et vérifiables",
      "Qu'il soit soumis chaque semaine à l'Administration",
      "Qu'il soit synchronisé avec le système du site"
    ],
    "correct_answers": [
      "Que les informations requises soient clairement renseignées et vérifiables"
    ]
  },
  {
    "id": "cdc-122",
    "title": "Les situations suivantes constituent des infractions à l'obligation de déconnexion de position, SAUF :",
    "options": [
      "Quitter le jeu sans déconnecter sa position ATC",
      "Se déconnecter de Discord en laissant une position active",
      "Déconnecter sa position avant de quitter le jeu",
      "Laisser une position active prolongée sans assurer le service"
    ],
    "correct_answers": [
      "Déconnecter sa position avant de quitter le jeu"
    ]
  },
  {
    "id": "cdc-123",
    "title": "Quelle est la mission principale de la Modération ?",
    "options": [
      "Organiser les événements du serveur",
      "Assurer un environnement sain, respectueux et agréable au quotidien",
      "Gérer les finances du serveur en RP",
      "Former les nouveaux membres uniquement"
    ],
    "correct_answers": [
      "Assurer un environnement sain, respectueux et agréable au quotidien"
    ]
  },
  {
    "id": "cdc-124",
    "title": "Les sanctions HRP sont prononcées par :",
    "options": [
      "Uniquement les Fondateurs",
      "La Modération, l'Administration ou les Fondateurs selon la gravité",
      "Uniquement la Cour Suprême",
      "N'importe quel membre de la direction"
    ],
    "correct_answers": [
      "La Modération, l'Administration ou les Fondateurs selon la gravité"
    ]
  },
  {
    "id": "cdc-125",
    "title": "Combien d'instances composent le système juridique interne du serveur ?",
    "options": [
      "Une",
      "Deux",
      "Trois",
      "Quatre"
    ],
    "correct_answers": [
      "Deux"
    ]
  },
  {
    "id": "cdc-126",
    "title": "L'ancienneté sur le serveur peut-elle être une condition d'obtention d'un rôle ?",
    "options": [
      "Non, l'ancienneté n'est jamais prise en compte",
      "Oui, une ancienneté minimale peut être requise",
      "Oui, mais uniquement pour les rôles décoratifs",
      "Non, seules les compétences comptent"
    ],
    "correct_answers": [
      "Oui, une ancienneté minimale peut être requise"
    ]
  },
  {
    "id": "cdc-127",
    "title": "L'incitation à la haine ou à la violence est :",
    "options": [
      "Tolérée dans le contexte du RP",
      "Formellement prohibée sur l'ensemble du serveur",
      "Sanctionnée uniquement si publique",
      "Gérée uniquement par la Cour Suprême"
    ],
    "correct_answers": [
      "Formellement prohibée sur l'ensemble du serveur"
    ]
  },
  {
    "id": "cdc-128",
    "title": "Les salons vocaux Chill peuvent-ils être utilisés pour délivrer des instructions officielles ?",
    "options": [
      "Oui, si aucun salon opérationnel n'est disponible",
      "Oui, avec l'accord du staff",
      "Non, tout échange opérationnel doit se tenir dans les salons prévus à cet effet",
      "Oui, uniquement pour les membres du staff"
    ],
    "correct_answers": [
      "Non, tout échange opérationnel doit se tenir dans les salons prévus à cet effet"
    ]
  },
  {
    "id": "cdc-129",
    "title": "Les sanctions RP sont-elles indépendantes des sanctions HRP ?",
    "options": [
      "Non, elles s'excluent mutuellement",
      "Oui, elles sont indépendantes et peuvent être prononcées simultanément",
      "Non, les sanctions RP priment toujours sur les HRP",
      "Oui, mais seulement pour les infractions légères"
    ],
    "correct_answers": [
      "Oui, elles sont indépendantes et peuvent être prononcées simultanément"
    ]
  },
  {
    "id": "cdc-130",
    "title": "Les sanctions sont consignées dans :",
    "options": [
      "Le salon d'annonces public",
      "Un registre interne tenu par l'Administration",
      "Le logbook du membre",
      "Un document public accessible à tous"
    ],
    "correct_answers": [
      "Un registre interne tenu par l'Administration"
    ]
  },
  {
    "id": "cdc-131",
    "title": "Les Instructeurs sont nommés par :",
    "options": [
      "Les Fondateurs",
      "Un vote des membres de la communauté",
      "L'Administration, sur la base de leurs connaissances et pédagogie",
      "La Modération"
    ],
    "correct_answers": [
      "L'Administration, sur la base de leurs connaissances et pédagogie"
    ]
  },
  {
    "id": "cdc-132",
    "title": "Un salon RP peut-il être soumis à des règles additionnelles ?",
    "options": [
      "Non, les règles de l'article 4 sont suffisantes",
      "Oui, affichées dans la description du salon ou épinglées par le staff",
      "Oui, mais uniquement définies par les membres",
      "Non, pour garantir l'uniformité des règles"
    ],
    "correct_answers": [
      "Oui, affichées dans la description du salon ou épinglées par le staff"
    ]
  },
  {
    "id": "cdc-133",
    "title": "Les événements roleplay peuvent-ils avoir des conséquences officielles sur la simulation ?",
    "options": [
      "Non, les événements sont sans conséquences sur la simulation",
      "Oui, notamment en matière de finances, licences, grades ou statut des compagnies",
      "Oui, uniquement financières",
      "Non, sauf décision exceptionnelle des Fondateurs"
    ],
    "correct_answers": [
      "Oui, notamment en matière de finances, licences, grades ou statut des compagnies"
    ]
  },
  {
    "id": "cdc-134",
    "title": "Une tentative de raid contre le serveur expose ses participants à :",
    "options": [
      "Un bannissement temporaire de 7 jours",
      "Un avertissement officiel",
      "Un bannissement définitif sans possibilité de recours",
      "Une mise en sourdine de 30 jours"
    ],
    "correct_answers": [
      "Un bannissement définitif sans possibilité de recours"
    ]
  },
  {
    "id": "cdc-135",
    "title": "La révocation de l'agrément d'une compagnie est plus ou moins grave que la dissolution forcée ?",
    "options": [
      "Plus grave",
      "Moins grave, la dissolution est la sanction ultime",
      "Équivalente",
      "Cela dépend du contexte"
    ],
    "correct_answers": [
      "Moins grave, la dissolution est la sanction ultime"
    ]
  },
  {
    "id": "cdc-136",
    "title": "Le logbook doit être accessible sur demande de qui ?",
    "options": [
      "Uniquement des Fondateurs",
      "Du staff, de l'IFSA RP ou du NTSB RP",
      "Uniquement des modérateurs",
      "De n'importe quel membre du serveur"
    ],
    "correct_answers": [
      "Du staff, de l'IFSA RP ou du NTSB RP"
    ]
  },
  {
    "id": "cdc-137",
    "title": "Comment un membre peut-il contester une sanction automatique jugée erronée du système ?",
    "options": [
      "En publiant un message dans le salon général",
      "En soumettant une demande de révision au staff via le canal prévu",
      "En contactant directement un Fondateur",
      "En déposant un appel auprès de la Cour Suprême directement"
    ],
    "correct_answers": [
      "En soumettant une demande de révision au staff via le canal prévu"
    ]
  },
  {
    "id": "cdc-138",
    "title": "L'accès aux salons Fréquence peut être soumis à :",
    "options": [
      "Un paiement en monnaie RP",
      "La détention d'un rôle spécifique ou la participation à une opération en cours",
      "L'accord unanime des membres présents",
      "L'ancienneté de plus de 3 mois"
    ],
    "correct_answers": [
      "La détention d'un rôle spécifique ou la participation à une opération en cours"
    ]
  },
  {
    "id": "cdc-139",
    "title": "Lors de l'instruction d'une affaire, la Cour Suprême peut-elle convoquer des témoins ?",
    "options": [
      "Non, les témoignages écrits suffisent",
      "Oui, tout témoin jugé utile peut être convoqué",
      "Oui, mais uniquement des membres du staff",
      "Non, la procédure est strictement entre les parties"
    ],
    "correct_answers": [
      "Oui, tout témoin jugé utile peut être convoqué"
    ]
  },
  {
    "id": "cdc-140",
    "title": "Les événements roleplay peuvent-ils faire appel à des rôles temporaires ?",
    "options": [
      "Non, uniquement les rôles permanents sont utilisables",
      "Oui, des rôles temporaires peuvent être attribués pour la durée de l'événement",
      "Oui, mais ils doivent être validés par la Cour Suprême",
      "Non, les rôles temporaires sont réservés aux événements compétitifs"
    ],
    "correct_answers": [
      "Oui, des rôles temporaires peuvent être attribués pour la durée de l'événement"
    ]
  },
  {
    "id": "cdc-141",
    "title": "Le non-respect répété de règles mineures peut-il mener à une escalade des sanctions ?",
    "options": [
      "Non, seules les infractions graves entraînent des sanctions progressives",
      "Oui, conformément aux dispositions sur les sanctions",
      "Non, les infractions mineures sont toujours amnistiées",
      "Oui, mais uniquement si le membre est en période de stage"
    ],
    "correct_answers": [
      "Oui, conformément aux dispositions sur les sanctions"
    ]
  },
  {
    "id": "cdc-142",
    "title": "Comment un membre peut-il obtenir un rôle décoratif ?",
    "options": [
      "En faisant une demande au staff par DM",
      "Via le salon prévu à cet effet",
      "Automatiquement après 1 mois d'ancienneté",
      "En participant à un événement compétitif"
    ],
    "correct_answers": [
      "Via le salon prévu à cet effet"
    ]
  },
  {
    "id": "cdc-143",
    "title": "L'absence de remise en question ou de regret exprimé est :",
    "options": [
      "Une circonstance atténuante",
      "Sans impact sur la sanction",
      "Une circonstance aggravante",
      "Un motif de renvoi automatique vers la Cour Suprême"
    ],
    "correct_answers": [
      "Une circonstance aggravante"
    ]
  },
  {
    "id": "cdc-144",
    "title": "Les membres de la Modération doivent rendre compte de leurs actions à :",
    "options": [
      "La Cour Suprême",
      "Les membres ordinaires du serveur",
      "L'Administration",
      "Le Tribunal Administratif"
    ],
    "correct_answers": [
      "L'Administration"
    ]
  },
  {
    "id": "cdc-145",
    "title": "Seul le membre habilité délivrant les consignes est autorisé à parler dans un salon d'instructions vocal, sauf :",
    "options": [
      "Si un modérateur intervient",
      "Si une demande explicite est adressée aux participants",
      "Si l'instruction concerne la sécurité",
      "Si le salon est en mode Chill"
    ],
    "correct_answers": [
      "Si une demande explicite est adressée aux participants"
    ]
  },
  {
    "id": "cdc-146",
    "title": "Un membre faisant l'objet d'une sanction RP peut-il contester cette décision ?",
    "options": [
      "Non, les sanctions RP sont irrévocables",
      "Oui, auprès du Tribunal Administratif, puis en appel auprès de la Cour Suprême",
      "Oui, uniquement auprès des Fondateurs",
      "Non, sauf si la sanction est un retrait définitif de licence"
    ],
    "correct_answers": [
      "Oui, auprès du Tribunal Administratif, puis en appel auprès de la Cour Suprême"
    ]
  },
  {
    "id": "cdc-147",
    "title": "Les liens suspects ou non vérifiés dans les salons HRP sont :",
    "options": [
      "Tolérés si l'expéditeur les présente comme sûrs",
      "Interdits",
      "Autorisés dans les salons de discussion générale",
      "Autorisés entre membres de confiance"
    ],
    "correct_answers": [
      "Interdits"
    ]
  },
  {
    "id": "cdc-148",
    "title": "L'Administration peut-elle organiser des événements officiels du serveur ?",
    "options": [
      "Non, c'est la prérogative exclusive des Fondateurs",
      "Oui, c'est parmi ses missions de planifier les événements",
      "Non, c'est délégué aux Instructeurs",
      "Oui, mais uniquement les événements HRP"
    ],
    "correct_answers": [
      "Oui, c'est parmi ses missions de planifier les événements"
    ]
  },
  {
    "id": "cdc-149",
    "title": "Tout membre participant à un événement s'engage à adopter un comportement :",
    "options": [
      "Compétitif avant tout",
      "Fair-play, respectueux et conforme à l'esprit de l'événement",
      "Adapté aux règles spécifiques de l'événement uniquement",
      "Libre, les événements étant en dehors du code de conduite"
    ],
    "correct_answers": [
      "Fair-play, respectueux et conforme à l'esprit de l'événement"
    ]
  },
  {
    "id": "cdc-150",
    "title": "Les obligations opérationnelles de l'article 10 s'appliquent-elles aux membres du staff ?",
    "options": [
      "Non, le staff est exempté",
      "Oui, aucun statut hiérarchique ne dispense d'y satisfaire, y compris le staff",
      "Oui, mais avec des exigences allégées",
      "Non, uniquement aux membres titulaires d'une licence RP"
    ],
    "correct_answers": [
      "Oui, aucun statut hiérarchique ne dispense d'y satisfaire, y compris le staff"
    ]
  },
  {
    "id": "cdc-151",
    "title": "Que peut faire le staff face à des pings abusifs répétés d'un membre envers un autre ?",
    "options": [
      "Rien, les pings entre membres sont libres",
      "Appliquer des sanctions pouvant aller d'un avertissement à une exclusion temporaire ou définitive",
      "Uniquement envoyer un avertissement verbal",
      "Désactiver les pings pour l'ensemble du serveur"
    ],
    "correct_answers": [
      "Appliquer des sanctions pouvant aller d'un avertissement à une exclusion temporaire ou définitive"
    ]
  },
  {
    "id": "cdc-152",
    "title": "Le respect du code de conduite sans antécédents disciplinaires récents est :",
    "options": [
      "Un critère optionnel pour l'obtention d'un rôle",
      "Une condition pouvant être exigée pour l'obtention d'un rôle",
      "Un critère applicable uniquement aux rôles de staff",
      "Hors du champ des critères d'attribution des rôles"
    ],
    "correct_answers": [
      "Une condition pouvant être exigée pour l'obtention d'un rôle"
    ]
  },
  {
    "id": "cdc-153",
    "title": "Le harcèlement verbal répété est :",
    "options": [
      "Toléré s'il reste dans les salons textuels",
      "Formellement prohibé",
      "Sanctionné uniquement s'il est public",
      "Géré uniquement si la victime est un membre du staff"
    ],
    "correct_answers": [
      "Formellement prohibé"
    ]
  },
  {
    "id": "cdc-154",
    "title": "Les membres sont-ils responsables de vérifier la description d'un salon avant d'y envoyer un message ?",
    "options": [
      "Non, c'est la responsabilité du staff de les orienter",
      "Oui, chaque membre est responsable de s'assurer que son contenu correspond à l'usage prévu",
      "Non, les salons sont ouverts à tous types de messages",
      "Oui, mais uniquement pour les salons RP"
    ],
    "correct_answers": [
      "Oui, chaque membre est responsable de s'assurer que son contenu correspond à l'usage prévu"
    ]
  },
  {
    "id": "cdc-155",
    "title": "La diffusion de musique dans un salon vocal sans accord préalable est :",
    "options": [
      "Tolérée dans les salons Chill uniquement",
      "Interdite dans l'ensemble des salons vocaux",
      "Autorisée si personne ne se plaint",
      "Libre, la musique est considérée comme un fond sonore neutre"
    ],
    "correct_answers": [
      "Interdite dans l'ensemble des salons vocaux"
    ]
  },
  {
    "id": "cdc-156",
    "title": "Un litige comportant une dimension HRP, même partiellement, relève de :",
    "options": [
      "La compétence du Tribunal Administratif",
      "La compétence exclusive de la Cour Suprême",
      "La compétence partagée des deux instances",
      "La compétence de l'Administration uniquement"
    ],
    "correct_answers": [
      "La compétence exclusive de la Cour Suprême"
    ]
  },
  {
    "id": "cdc-157",
    "title": "Les Instructeurs exercent-ils leur mission en remplacement ou en complémentarité du reste de la direction ?",
    "options": [
      "En remplacement du staff dans le domaine pédagogique",
      "En complémentarité avec le reste de la direction, sans s'y substituer",
      "En remplacement uniquement pour les cours vocaux",
      "En complémentarité uniquement pour les événements"
    ],
    "correct_answers": [
      "En complémentarité avec le reste de la direction, sans s'y substituer"
    ]
  },
  {
    "id": "cdc-158",
    "title": "Les antécédents disciplinaires d'un membre sont-ils pris en compte lors d'une nouvelle sanction ?",
    "options": [
      "Non, chaque infraction est jugée indépendamment",
      "Oui, le registre interne permet de prendre en compte les antécédents",
      "Oui, mais uniquement pour les sanctions HRP",
      "Non, les antécédents sont effacés chaque année"
    ],
    "correct_answers": [
      "Oui, le registre interne permet de prendre en compte les antécédents"
    ]
  },
  {
    "id": "cdc-159",
    "title": "Un événement communautaire est-il ouvert à l'ensemble des membres ?",
    "options": [
      "Non, uniquement aux membres actifs",
      "Oui, en principe, sauf indication contraire",
      "Non, uniquement aux membres avec un rôle spécifique",
      "Oui, mais uniquement après inscription préalable obligatoire"
    ],
    "correct_answers": [
      "Oui, en principe, sauf indication contraire"
    ]
  },
  {
    "id": "cdc-160",
    "title": "L'article 10 définit les obligations opérationnelles pour quels membres ?",
    "options": [
      "Tous les membres du serveur",
      "Uniquement les membres du staff",
      "Les pilotes, pompiers et contrôleurs aériens RP",
      "Uniquement les membres titulaires d'un rôle de commandant de bord"
    ],
    "correct_answers": [
      "Les pilotes, pompiers et contrôleurs aériens RP"
    ]
  },
  {
    "id": "cdc-161",
    "title": "Un ping de rôle collectif par le staff est autorisé dans quel cadre ?",
    "options": [
      "À tout moment, sans restriction",
      "Annonces officielles ou situations nécessitant une communication urgente à l'ensemble du serveur",
      "Uniquement pour les opérations RP",
      "Uniquement en cas de raid"
    ],
    "correct_answers": [
      "Annonces officielles ou situations nécessitant une communication urgente à l'ensemble du serveur"
    ]
  },
  {
    "id": "cdc-162",
    "title": "Les contenus portant atteinte à la vie privée d'un membre sont-ils autorisés dans les salons HRP ?",
    "options": [
      "Oui, si le membre concerné est prévenu",
      "Oui, dans les salons de discussion générale",
      "Non, ils sont interdits",
      "Oui, si c'est dans un cadre humoristique"
    ],
    "correct_answers": [
      "Non, ils sont interdits"
    ]
  },
  {
    "id": "cdc-163",
    "title": "Monopoliser une fréquence sans raison valable est :",
    "options": [
      "Autorisé si le membre est en opération",
      "Interdit ; chaque membre doit libérer la ligne dès que son intervention est terminée",
      "Toléré pendant 5 minutes maximum",
      "Autorisé pour les membres du staff uniquement"
    ],
    "correct_answers": [
      "Interdit ; chaque membre doit libérer la ligne dès que son intervention est terminée"
    ]
  },
  {
    "id": "cdc-164",
    "title": "La Cour Suprême délibère :",
    "options": [
      "En présence des parties pour garantir la transparence",
      "En interne, à l'abri de toute pression extérieure",
      "En public dans le salon d'annonces",
      "En présence obligatoire d'un représentant des Fondateurs"
    ],
    "correct_answers": [
      "En interne, à l'abri de toute pression extérieure"
    ]
  },
  {
    "id": "cdc-165",
    "title": "Les membres de l'Administration peuvent-ils traiter des affaires disciplinaires complexes transmises par la Modération ?",
    "options": [
      "Non, c'est la prérogative exclusive de la Cour Suprême",
      "Oui, c'est parmi leurs missions",
      "Non, seulement les Fondateurs peuvent le faire",
      "Oui, mais uniquement les affaires RP"
    ],
    "correct_answers": [
      "Oui, c'est parmi leurs missions"
    ]
  },
  {
    "id": "cdc-166",
    "title": "Les amendes RP peuvent-elles être prononcées cumulativement à d'autres sanctions RP ?",
    "options": [
      "Non, elles s'appliquent toujours de manière isolée",
      "Oui, elles peuvent être prononcées en complément d'une autre sanction RP",
      "Non, elles remplacent systématiquement les autres sanctions",
      "Oui, mais uniquement avec un blâme RP"
    ],
    "correct_answers": [
      "Oui, elles peuvent être prononcées en complément d'une autre sanction RP"
    ]
  },
  {
    "id": "cdc-167",
    "title": "Comment un membre peut-il proposer un événement ?",
    "options": [
      "En le publiant directement dans le salon d'annonces",
      "En soumettant sa proposition via le canal prévu à cet effet",
      "En envoyant un DM à un Fondateur",
      "En créant un sondage dans le salon général"
    ],
    "correct_answers": [
      "En soumettant sa proposition via le canal prévu à cet effet"
    ]
  },
  {
    "id": "cdc-168",
    "title": "Les conflits entre membres doivent-ils être réglés publiquement dans les salons du serveur ?",
    "options": [
      "Oui, pour la transparence communautaire",
      "Non, c'est strictement interdit",
      "Oui, mais uniquement dans les salons HRP",
      "Oui, avec la supervision d'un modérateur"
    ],
    "correct_answers": [
      "Non, c'est strictement interdit"
    ]
  },
  {
    "id": "cdc-169",
    "title": "Le blâme HRP est prononcé en cas de :",
    "options": [
      "Première infraction mineure",
      "Récidive suite à des avertissements écrits HRP, ou pour une infraction de gravité modérée",
      "Tentative de raid uniquement",
      "Uniquement sur décision de la Cour Suprême"
    ],
    "correct_answers": [
      "Récidive suite à des avertissements écrits HRP, ou pour une infraction de gravité modérée"
    ]
  },
  {
    "id": "cdc-170",
    "title": "Le nom du commandant de bord doit-il figurer dans le logbook pour un vol en équipage ?",
    "options": [
      "Non, uniquement l'immatriculation de l'appareil",
      "Oui, si le vol est effectué en équipage",
      "Non, le logbook ne concerne que le pilote signataire",
      "Oui, uniquement pour les vols commerciaux"
    ],
    "correct_answers": [
      "Oui, si le vol est effectué en équipage"
    ]
  },
  {
    "id": "cdc-171",
    "title": "Un membre peut-il signaler un ping non sollicité au staff ?",
    "options": [
      "Non, le staff ne gère pas les litiges de ping",
      "Oui, via le canal de signalement prévu",
      "Non, il doit régler ça directement avec l'expéditeur",
      "Oui, mais uniquement si le ping vient d'un membre du staff"
    ],
    "correct_answers": [
      "Oui, via le canal de signalement prévu"
    ]
  },
  {
    "id": "cdc-172",
    "title": "Les décisions finales sur les litiges concernant les rôles appartiennent à :",
    "options": [
      "La communauté des membres",
      "La direction du serveur, et sont sans appel",
      "La Cour Suprême uniquement",
      "Un comité de rôles élu"
    ],
    "correct_answers": [
      "La direction du serveur, et sont sans appel"
    ]
  },
  {
    "id": "cdc-173",
    "title": "Tout message dans un salon RP doit être rédigé :",
    "options": [
      "En français obligatoirement",
      "Dans le cadre du roleplay en cours",
      "Selon les directives du formateur présent",
      "Dans un format standardisé défini par le staff"
    ],
    "correct_answers": [
      "Dans le cadre du roleplay en cours"
    ]
  },
  {
    "id": "cdc-174",
    "title": "Les cris ou hurlements visant à gêner les membres dans un salon vocal sont :",
    "options": [
      "Tolérés dans les salons Chill uniquement",
      "Interdits et considérés comme perturbation volontaire",
      "Autorisés lors des événements compétitifs",
      "Gérés uniquement par les Fondateurs"
    ],
    "correct_answers": [
      "Interdits et considérés comme perturbation volontaire"
    ]
  },
  {
    "id": "cdc-175",
    "title": "Les parties impliquées dans une procédure devant une instance juridique sont-elles tenues de coopérer ?",
    "options": [
      "Non, elles peuvent refuser de témoigner",
      "Oui, elles doivent coopérer pleinement et s'abstenir de tout comportement nuisible",
      "Oui, mais uniquement pour les affaires HRP",
      "Non, la coopération est optionnelle"
    ],
    "correct_answers": [
      "Oui, elles doivent coopérer pleinement et s'abstenir de tout comportement nuisible"
    ]
  },
  {
    "id": "cdc-176",
    "title": "Le Staff Stagiaire est placé sous la supervision directe de :",
    "options": [
      "Les Fondateurs uniquement",
      "La Cour Suprême",
      "La Modération et de l'Administration",
      "Les Instructeurs"
    ],
    "correct_answers": [
      "La Modération et de l'Administration"
    ]
  },
  {
    "id": "cdc-177",
    "title": "L'avertissement officiel adressé à une compagnie est la sanction :",
    "options": [
      "La plus grave applicable aux compagnies",
      "La moins grave, première dans l'échelle des sanctions compagnies",
      "Équivalente à une amende compagnie",
      "Applicable uniquement aux compagnies en dissolution"
    ],
    "correct_answers": [
      "La moins grave, première dans l'échelle des sanctions compagnies"
    ]
  },
  {
    "id": "cdc-178",
    "title": "Les récompenses des événements compétitifs sont attribuées par :",
    "options": [
      "Un tirage au sort parmi les participants",
      "Un vote des membres présents",
      "Exclusivement le staff organisateur",
      "La Cour Suprême"
    ],
    "correct_answers": [
      "Exclusivement le staff organisateur"
    ]
  },
  {
    "id": "cdc-179",
    "title": "La déconnexion de position doit être effectuée par :",
    "options": [
      "Un modérateur désigné",
      "Le membre lui-même, via la procédure prévue sur le site ou l'interface du serveur",
      "Automatiquement par le système après 30 minutes d'inactivité",
      "Un autre ATC ou pompier prenant la relève"
    ],
    "correct_answers": [
      "Le membre lui-même, via la procédure prévue sur le site ou l'interface du serveur"
    ]
  },
  {
    "id": "cdc-180",
    "title": "Les représailles contre un membre ayant signalé de bonne foi un comportement contraire aux règles sont :",
    "options": [
      "Tolérées dans le cadre des relations entre membres",
      "Interdites et non tolérées",
      "Gérées uniquement si la victime porte plainte à son tour",
      "Sans conséquence formelle"
    ],
    "correct_answers": [
      "Interdites et non tolérées"
    ]
  },
  {
    "id": "cdc-181",
    "title": "Les Fondateurs peuvent-ils déléguer certaines de leurs prérogatives à l'Administration ?",
    "options": [
      "Non, leurs prérogatives sont inaliénables",
      "Oui, sans se dessaisir de leur autorité suprême, et de manière révocable",
      "Oui, mais seulement de manière permanente",
      "Non, sauf en cas d'absence prolongée"
    ],
    "correct_answers": [
      "Oui, sans se dessaisir de leur autorité suprême, et de manière révocable"
    ]
  },
  {
    "id": "cdc-182",
    "title": "L'ancienneté et le bon comportement général d'un membre constituent :",
    "options": [
      "Une circonstance aggravante",
      "Un élément neutre",
      "Une circonstance atténuante",
      "Un motif d'immunité totale"
    ],
    "correct_answers": [
      "Une circonstance atténuante"
    ]
  },
  {
    "id": "cdc-183",
    "title": "En cas d'annulation d'un événement, une annonce officielle est publiée :",
    "options": [
      "Dans les 72 heures",
      "Uniquement si le staff le juge nécessaire",
      "Dans les meilleurs délais dans le salon d'annonces",
      "Après avoir informé chaque participant par DM"
    ],
    "correct_answers": [
      "Dans les meilleurs délais dans le salon d'annonces"
    ]
  },
  {
    "id": "cdc-184",
    "title": "La sanction automatique du système du site est-elle dépendante de l'intervention du staff ?",
    "options": [
      "Oui, le staff doit toujours la valider",
      "Non, elle est indépendante et automatique",
      "Oui, uniquement pour les pompiers",
      "Non, sauf en cas d'appel du membre"
    ],
    "correct_answers": [
      "Non, elle est indépendante et automatique"
    ]
  },
  {
    "id": "cdc-185",
    "title": "Quelle est la première étape de la procédure devant la Cour Suprême ?",
    "options": [
      "L'instruction des témoins",
      "La délibération interne",
      "Le dépôt du dossier avec les pièces justificatives",
      "L'examen de recevabilité"
    ],
    "correct_answers": [
      "Le dépôt du dossier avec les pièces justificatives"
    ]
  },
  {
    "id": "cdc-186",
    "title": "Les cours vocaux sont placés sous l'autorité directe de :",
    "options": [
      "N'importe quel membre du staff",
      "Le membre du staff ou le formateur désigné qui dirige la session",
      "Les Fondateurs",
      "L'Administration exclusivement"
    ],
    "correct_answers": [
      "Le membre du staff ou le formateur désigné qui dirige la session"
    ]
  },
  {
    "id": "cdc-187",
    "title": "La validation par un ou plusieurs membres du staff peut-elle être requise pour l'obtention d'un rôle ?",
    "options": [
      "Non, seule l'ancienneté compte",
      "Oui, c'est une des conditions possibles d'obtention",
      "Non, les rôles sont attribués automatiquement",
      "Oui, mais uniquement pour les rôles de staff"
    ],
    "correct_answers": [
      "Oui, c'est une des conditions possibles d'obtention"
    ]
  },
  {
    "id": "cdc-188",
    "title": "La suspension temporaire des activités d'une compagnie est-elle définitive ?",
    "options": [
      "Oui, toujours définitive",
      "Non, elle est temporaire pour une durée déterminée",
      "Non, mais elle peut devenir définitive en cas de récidive",
      "Oui, sauf décision exceptionnelle des Fondateurs"
    ],
    "correct_answers": [
      "Non, elle est temporaire pour une durée déterminée"
    ]
  },
  {
    "id": "cdc-189",
    "title": "Les membres de la Modération sont nommés par :",
    "options": [
      "Les Fondateurs uniquement",
      "L'Administration, avec validation des Fondateurs",
      "Un vote du staff",
      "Les Instructeurs"
    ],
    "correct_answers": [
      "L'Administration, avec validation des Fondateurs"
    ]
  },
  {
    "id": "cdc-190",
    "title": "La nature de la mission (vol commercial, MEDEVAC, cargo, etc.) doit-elle figurer dans le logbook ?",
    "options": [
      "Non, c'est optionnel",
      "Oui, c'est une mention obligatoire",
      "Oui, uniquement pour les vols MEDEVAC",
      "Non, uniquement le type d'aéronef est requis"
    ],
    "correct_answers": [
      "Oui, c'est une mention obligatoire"
    ]
  },
  {
    "id": "cdc-191",
    "title": "Les débats religieux dans les salons HRP sont :",
    "options": [
      "Fortement encouragés pour enrichir la communauté",
      "Fortement déconseillés pour préserver la cohésion",
      "Interdits et passibles de sanctions",
      "Autorisés si le débat reste respectueux"
    ],
    "correct_answers": [
      "Fortement déconseillés pour préserver la cohésion"
    ]
  },
  {
    "id": "cdc-192",
    "title": "Une sanction sans analyse préalable des faits est-elle valide ?",
    "options": [
      "Oui, en cas d'urgence",
      "Non, aucune sanction ne peut être prononcée sans analyse préalable",
      "Oui, si le membre reconnaît les faits",
      "Oui, pour les avertissements verbaux uniquement"
    ],
    "correct_answers": [
      "Non, aucune sanction ne peut être prononcée sans analyse préalable"
    ]
  },
  {
    "id": "cdc-193",
    "title": "Les annonces d'événements officiels doivent contenir au minimum :",
    "options": [
      "La liste des participants inscrits",
      "La nature, la date, les conditions de participation et les éventuelles récompenses",
      "Le nom du staff organisateur uniquement",
      "Le règlement complet de l'événement"
    ],
    "correct_answers": [
      "La nature, la date, les conditions de participation et les éventuelles récompenses"
    ]
  },
  {
    "id": "cdc-194",
    "title": "Les Instructeurs ont-ils accès aux outils de gestion et de modération du serveur ?",
    "options": [
      "Oui, les mêmes que la Modération",
      "Oui, mais avec des accès limités",
      "Non, ils ne disposent pas de pouvoir disciplinaire ni d'outils de modération",
      "Oui, uniquement pour gérer les salons de cours"
    ],
    "correct_answers": [
      "Non, ils ne disposent pas de pouvoir disciplinaire ni d'outils de modération"
    ]
  },
  {
    "id": "cdc-195",
    "title": "La Cour Suprême est composée de :",
    "options": [
      "Tous les membres du staff",
      "Membres du staff de haut rang désignés par la direction",
      "Les trois Fondateurs uniquement",
      "Un jury de membres tirés au sort"
    ],
    "correct_answers": [
      "Membres du staff de haut rang désignés par la direction"
    ]
  },
  {
    "id": "cdc-196",
    "title": "Le blâme RP signifie que tout nouvel écart entraînera :",
    "options": [
      "Un simple avertissement supplémentaire",
      "Des sanctions significativement plus sévères, pouvant affecter licences ou compagnie",
      "Un bannissement automatique",
      "La convocation obligatoire devant la Cour Suprême"
    ],
    "correct_answers": [
      "Des sanctions significativement plus sévères, pouvant affecter licences ou compagnie"
    ]
  },
  {
    "id": "cdc-197",
    "title": "L'usurpation d'identité d'un membre ordinaire est-elle sanctionnable ?",
    "options": [
      "Non, uniquement l'usurpation d'identité de staff est interdite",
      "Oui, l'usurpation d'identité de tout membre est strictement interdite",
      "Oui, mais sanctionnée uniquement par un avertissement",
      "Non, si le membre usurpé n'est pas actif"
    ],
    "correct_answers": [
      "Oui, l'usurpation d'identité de tout membre est strictement interdite"
    ]
  },
  {
    "id": "cdc-198",
    "title": "Un membre peut-il être exclu d'un événement sans préavis par le staff ?",
    "options": [
      "Non, le staff doit toujours prévenir 15 minutes à l'avance",
      "Oui, si son comportement est jugé incompatible avec le bon déroulement",
      "Non, une procédure disciplinaire formelle est toujours nécessaire",
      "Oui, uniquement pour les événements compétitifs"
    ],
    "correct_answers": [
      "Oui, si son comportement est jugé incompatible avec le bon déroulement"
    ]
  },
  {
    "id": "cdc-199",
    "title": "Les salons vocaux Chill ont-ils pour vocation de favoriser :",
    "options": [
      "Les formations opérationnelles informelles",
      "Les échanges informels et la convivialité",
      "La préparation des opérations RP",
      "Les réunions du staff uniquement"
    ],
    "correct_answers": [
      "Les échanges informels et la convivialité"
    ]
  },
  {
    "id": "cdc-200",
    "title": "En cas de litige relatif à une sanction automatique, quel article régit le recours ?",
    "options": [
      "Article 7, Section C",
      "Article 8, Section B",
      "Article 6, Section A — Tribunal Administratif",
      "Article 9, Section D"
    ],
    "correct_answers": [
      "Article 6, Section A — Tribunal Administratif"
    ]
  },
  {
    "id": "cdc-201",
    "title": "Le ping est qualifié d'outil réservé à l'urgence. Quelle autre utilisation est explicitement autorisée ?",
    "options": [
      "Toutes les annonces RP",
      "L'utilisation par le staff",
      "Les discussions privées entre amis",
      "Les demandes d'aide technique"
    ],
    "correct_answers": [
      "L'utilisation par le staff"
    ]
  },
  {
    "id": "cdc-202",
    "title": "Qu'est-ce qui justifie l'opposabilité du Code de Conduite selon l'amendement 7.4.1 ?",
    "options": [
      "Sa publication sur le site officiel",
      "Son adoption à la majorité lors d'un vote du staff",
      "La signature des Fondateurs",
      "L'approbation de la Cour Suprême"
    ],
    "correct_answers": [
      "Son adoption à la majorité lors d'un vote du staff"
    ]
  },
  {
    "id": "cdc-203",
    "title": "Une infraction mixte (RP + HRP) peut-elle entraîner des sanctions des deux catégories simultanément ?",
    "options": [
      "Non, seule la catégorie la plus grave s'applique",
      "Oui, les sanctions RP et HRP peuvent être prononcées cumulativement",
      "Non, la Cour Suprême décide quelle catégorie s'applique",
      "Oui, mais uniquement si les Fondateurs l'approuvent"
    ],
    "correct_answers": [
      "Oui, les sanctions RP et HRP peuvent être prononcées cumulativement"
    ]
  },
  {
    "id": "cdc-204",
    "title": "Un conflit survenant en RP et menaçant de devenir un conflit réel doit être :",
    "options": [
      "Résolu exclusivement par les joueurs impliqués",
      "Signalé immédiatement au staff",
      "Géré par le Tribunal Administratif uniquement après la fin du scénario",
      "Ignoré car le RP et le HRP sont compartimentés"
    ],
    "correct_answers": [
      "Signalé immédiatement au staff"
    ]
  },
  {
    "id": "cdc-205",
    "title": "Après le rendu de décision de la Cour Suprême, celle-ci est exécutoire :",
    "options": [
      "Après un délai de 48 heures",
      "Immédiatement dès sa notification aux parties",
      "Après validation par les Fondateurs",
      "Après l'expiration du délai d'appel"
    ],
    "correct_answers": [
      "Immédiatement dès sa notification aux parties"
    ]
  },
  {
    "id": "cdc-206",
    "title": "Un membre ayant participé à une session d'instructions en vocal est considéré :",
    "options": [
      "En avoir pris connaissance uniquement s'il a confirmé par écrit",
      "Réputé en avoir pris connaissance et tenu de s'y conformer",
      "Libre de les appliquer ou non selon son jugement",
      "Informé uniquement si la session a été enregistrée"
    ],
    "correct_answers": [
      "Réputé en avoir pris connaissance et tenu de s'y conformer"
    ]
  },
  {
    "id": "cdc-207",
    "title": "La configuration des bots JeanJacques et Wick relève de la responsabilité de :",
    "options": [
      "La Modération",
      "N'importe quel membre du staff compétent techniquement",
      "Exclusivement les Fondateurs et l'Administration",
      "Les Instructeurs spécialisés"
    ],
    "correct_answers": [
      "Exclusivement les Fondateurs et l'Administration"
    ]
  },
  {
    "id": "cdc-208",
    "title": "Les membres de l'Administration ont-ils accès aux outils de gestion du serveur ?",
    "options": [
      "Non, c'est réservé aux Fondateurs",
      "Oui, un accès étendu, à utiliser de manière responsable",
      "Oui, mais uniquement pour la gestion des événements",
      "Non, ils supervisent sans accès direct"
    ],
    "correct_answers": [
      "Oui, un accès étendu, à utiliser de manière responsable"
    ]
  },
  {
    "id": "cdc-209",
    "title": "Les règles de l'article 4 s'appliquent-elles aux événements roleplay ?",
    "options": [
      "Non, les événements ont leurs propres règles RP",
      "Oui, les événements RP sont soumis à l'ensemble des règles de l'article 4",
      "Oui, uniquement les règles de la Section B",
      "Non, uniquement les règles de l'article 8 s'appliquent lors des événements"
    ],
    "correct_answers": [
      "Oui, les événements RP sont soumis à l'ensemble des règles de l'article 4"
    ]
  },
  {
    "id": "cdc-210",
    "title": "Le staff peut-il compléter les dispositions de l'article 10 par des instructions opérationnelles spécifiques ?",
    "options": [
      "Non, l'article 10 est exhaustif et non modifiable par le staff",
      "Oui, en les publiant dans les canaux appropriés",
      "Oui, mais uniquement après vote des Fondateurs",
      "Non, seuls les Fondateurs peuvent ajouter des dispositions"
    ],
    "correct_answers": [
      "Oui, en les publiant dans les canaux appropriés"
    ]
  },
  {
    "id": "cdc-211",
    "title": "Quelle attitude un membre doit-il adopter vis-à-vis de tous les membres, y compris les Fondateurs ?",
    "options": [
      "Respectueuse uniquement envers le staff",
      "Respectueuse, courtoise et bienveillante envers l'ensemble des membres",
      "Formelle uniquement avec la direction",
      "Libre, tant que les règles de base sont respectées"
    ],
    "correct_answers": [
      "Respectueuse, courtoise et bienveillante envers l'ensemble des membres"
    ]
  },
  {
    "id": "cdc-212",
    "title": "Le retrait temporaire de licence nécessite que le membre soumette une demande de restitution :",
    "options": [
      "Automatiquement à l'issue du délai",
      "Auprès du Tribunal Administratif, accompagnée des justificatifs nécessaires",
      "Auprès de la Cour Suprême uniquement",
      "Auprès des Fondateurs directement"
    ],
    "correct_answers": [
      "Auprès du Tribunal Administratif, accompagnée des justificatifs nécessaires"
    ]
  },
  {
    "id": "cdc-213",
    "title": "La Cour Suprême peut-elle annuler une décision rendue par le Tribunal Administratif ?",
    "options": [
      "Non, le Tribunal est souverain dans son domaine",
      "Oui, elle dispose d'un pouvoir de nullité des décisions antérieures",
      "Oui, uniquement pour les affaires RP",
      "Non, elle peut uniquement confirmer ou modifier la sanction"
    ],
    "correct_answers": [
      "Oui, elle dispose d'un pouvoir de nullité des décisions antérieures"
    ]
  },
  {
    "id": "cdc-214",
    "title": "Les événements spéciaux sont organisés à l'occasion de :",
    "options": [
      "Chaque début de mois",
      "Moments particuliers de la vie du serveur",
      "Chaque palier d'abonnés Discord",
      "Uniquement des événements aéronautiques réels"
    ],
    "correct_answers": [
      "Moments particuliers de la vie du serveur"
    ]
  },
  {
    "id": "cdc-215",
    "title": "Le staff peut-il expulser un membre perturbateur d'un salon vocal sans avertissement préalable ?",
    "options": [
      "Non, un avertissement préalable est toujours requis",
      "Oui, si la situation l'exige",
      "Non, une procédure formelle doit être suivie",
      "Oui, mais uniquement dans les salons Fréquence"
    ],
    "correct_answers": [
      "Oui, si la situation l'exige"
    ]
  },
  {
    "id": "cdc-216",
    "title": "Combien d'avertissements écrits HRP entraînent automatiquement un blâme HRP ?",
    "options": [
      "Deux",
      "Trois",
      "Quatre",
      "Cinq"
    ],
    "correct_answers": [
      "Trois"
    ]
  },
  {
    "id": "cdc-217",
    "title": "Le Staff Stagiaire peut-il prendre des décisions disciplinaires majeures de manière autonome ?",
    "options": [
      "Oui, c'est son rôle d'apprentissage",
      "Non, il doit systématiquement en référer à un modérateur ou à l'Administration",
      "Oui, pour les infractions mineures uniquement",
      "Oui, après 2 mois de stage"
    ],
    "correct_answers": [
      "Non, il doit systématiquement en référer à un modérateur ou à l'Administration"
    ]
  },
  {
    "id": "cdc-218",
    "title": "Quelle sanction l'émoji-spam répété dans un salon peut-il entraîner ?",
    "options": [
      "Aucune, les emojis ne sont pas concernés par la règle anti-spam",
      "Des sanctions, car c'est considéré comme du spam",
      "Un changement de salon uniquement",
      "Un mute de 5 minutes"
    ],
    "correct_answers": [
      "Des sanctions, car c'est considéré comme du spam"
    ]
  },
  {
    "id": "cdc-219",
    "title": "Quel est le délai accordé au Tribunal Administratif pour rendre sa décision ?",
    "options": [
      "24 heures strictement",
      "72 heures maximum",
      "Un délai raisonnable",
      "7 jours calendaires"
    ],
    "correct_answers": [
      "Un délai raisonnable"
    ]
  },
  {
    "id": "cdc-220",
    "title": "Se déconnecter du serveur Discord en laissant une position ATC active constitue :",
    "options": [
      "Une infraction mineure tolérée",
      "Une infraction à l'obligation de déconnexion de position",
      "Une déconnexion administrative non sanctionnable",
      "Un comportement acceptable en cas d'urgence"
    ],
    "correct_answers": [
      "Une infraction à l'obligation de déconnexion de position"
    ]
  },
  {
    "id": "cdc-221",
    "title": "La nomination ou révocation d'un membre de l'Administration est une décision :",
    "options": [
      "Non majeure, pouvant être prise par un seul Fondateur",
      "Majeure, nécessitant une décision collégiale des Fondateurs",
      "Déléguée à l'Administration elle-même",
      "Soumise à un vote du staff"
    ],
    "correct_answers": [
      "Majeure, nécessitant une décision collégiale des Fondateurs"
    ]
  },
  {
    "id": "cdc-222",
    "title": "La reconnaissance spontanée des faits et les excuses sincères constituent :",
    "options": [
      "Une circonstance aggravante",
      "Un élément sans impact sur la sanction",
      "Une circonstance atténuante",
      "Un motif d'immunité pour les premières infractions"
    ],
    "correct_answers": [
      "Une circonstance atténuante"
    ]
  },
  {
    "id": "cdc-223",
    "title": "Le comportement mature et responsable est une obligation pour :",
    "options": [
      "Les membres du staff uniquement",
      "Tous les membres du serveur",
      "Les membres ayant un rôle officiel",
      "Les membres ayant plus de 3 mois d'ancienneté"
    ],
    "correct_answers": [
      "Tous les membres du serveur"
    ]
  },
  {
    "id": "cdc-224",
    "title": "Les actions de JeanJacques et Wick sont considérées comme :",
    "options": [
      "Des actes automatiques sans valeur officielle",
      "Des actes officiels du serveur",
      "Des actes provisoires soumis à validation du staff",
      "Des actes purement préventifs non sanctionnables"
    ],
    "correct_answers": [
      "Des actes officiels du serveur"
    ]
  },
  {
    "id": "cdc-225",
    "title": "La participation à des événements est-elle systématiquement soumise à inscription ?",
    "options": [
      "Oui, toujours",
      "Non, certains événements n'imposent pas d'inscription",
      "Oui, pour tous les événements officiels",
      "Non, uniquement pour les événements compétitifs"
    ],
    "correct_answers": [
      "Non, certains événements n'imposent pas d'inscription"
    ]
  },
  {
    "id": "cdc-226",
    "title": "Les échanges dans les salons Fréquence doivent rester :",
    "options": [
      "En lien direct avec les opérations en cours et le cadre simulé de la compagnie",
      "Libres, pour favoriser la communication",
      "Limités à 3 participants maximum",
      "Exclusivement en termes aéronautiques anglais"
    ],
    "correct_answers": [
      "En lien direct avec les opérations en cours et le cadre simulé de la compagnie"
    ]
  },
  {
    "id": "cdc-227",
    "title": "La Modération représente quel aspect de la direction ?",
    "options": [
      "Le bras juridique",
      "Le bras opérationnel, en contact direct et permanent avec les membres",
      "Le bras administratif",
      "Le bras pédagogique"
    ],
    "correct_answers": [
      "Le bras opérationnel, en contact direct et permanent avec les membres"
    ]
  },
  {
    "id": "cdc-228",
    "title": "Un membre peut-il régler un différend par voie de pression ou de menace ?",
    "options": [
      "Oui, si l'autre partie refuse de coopérer",
      "Non, c'est strictement contraire au Code de Conduite",
      "Oui, si le staff est informé",
      "Non, uniquement pour les litiges HRP"
    ],
    "correct_answers": [
      "Non, c'est strictement contraire au Code de Conduite"
    ]
  },
  {
    "id": "cdc-229",
    "title": "Le staff s'engage à faire preuve de quel principe dans l'application des sanctions ?",
    "options": [
      "Sévérité maximale",
      "Tolérance zéro",
      "Cohérence",
      "Indulgence progressive"
    ],
    "correct_answers": [
      "Cohérence"
    ]
  },
  {
    "id": "cdc-230",
    "title": "Quel organisme RP (en plus du staff) peut demander la consultation du logbook d'un pilote ?",
    "options": [
      "La Cour Suprême RP",
      "L'IFSA RP ou le NTSB RP",
      "Le Tribunal Administratif RP",
      "L'Administration Générale du serveur"
    ],
    "correct_answers": [
      "L'IFSA RP ou le NTSB RP"
    ]
  },
  {
    "id": "cdc-231",
    "title": "Quel article encadre l'utilisation des pings sur le serveur MIXOU AIRLINES PTFS ?",
    "options": [
      "Article 2",
      "Article 1",
      "Article 3",
      "Article 5"
    ],
    "correct_answers": [
      "Article 1"
    ]
  },
  {
    "id": "cdc-232",
    "title": "L'envoi de fichiers répétés sans valeur ajoutée est-il assimilé au spam ?",
    "options": [
      "Non, seuls les messages texte constituent du spam",
      "Oui, l'envoi répété de fichiers sans valeur ajoutée est du spam",
      "Non, si les fichiers sont en rapport avec le sujet du salon",
      "Oui, uniquement si les fichiers sont des images"
    ],
    "correct_answers": [
      "Oui, l'envoi répété de fichiers sans valeur ajoutée est du spam"
    ]
  },
  {
    "id": "cdc-233",
    "title": "Un ajustement organisationnel ponctuel est-il une décision majeure ?",
    "options": [
      "Oui, tout changement organisationnel est majeur",
      "Non, c'est une décision non majeure relevant de la gestion courante",
      "Oui, si plus de 10 membres sont affectés",
      "Non, seulement si approuvé par tous les Fondateurs"
    ],
    "correct_answers": [
      "Non, c'est une décision non majeure relevant de la gestion courante"
    ]
  },
  {
    "id": "cdc-234",
    "title": "Un membre banni temporairement peut-il rejoindre le serveur pendant la durée du bannissement ?",
    "options": [
      "Oui, via un lien d'invitation valide",
      "Non, le bannissement temporaire exclut le membre pour une durée déterminée",
      "Oui, avec la permission d'un Fondateur",
      "Non, sauf pour contester la sanction"
    ],
    "correct_answers": [
      "Non, le bannissement temporaire exclut le membre pour une durée déterminée"
    ]
  },
  {
    "id": "cdc-235",
    "title": "Dans quel délai l'Administration examine-t-elle une proposition d'événement ?",
    "options": [
      "48 heures maximum",
      "Un délai raisonnable",
      "7 jours ouvrés",
      "Dans le mois suivant la proposition"
    ],
    "correct_answers": [
      "Un délai raisonnable"
    ]
  },
  {
    "id": "cdc-236",
    "title": "La saisine du Tribunal Administratif se fait via :",
    "options": [
      "Un DM envoyé à un modérateur",
      "Le canal officiel prévu à cet effet",
      "Le salon général du serveur",
      "Un formulaire sur le site MIXOU AIRLINES"
    ],
    "correct_answers": [
      "Le canal officiel prévu à cet effet"
    ]
  },
  {
    "id": "cdc-237",
    "title": "Les sanctions relatives aux compagnies sont-elles indépendantes des sanctions individuelles de leurs responsables ?",
    "options": [
      "Oui, une amende à la compagnie peut être infligée indépendamment des sanctions individuelles",
      "Non, elles sont toujours liées",
      "Oui, mais uniquement pour les amendes",
      "Non, la compagnie ne peut être sanctionnée que si son responsable l'est aussi"
    ],
    "correct_answers": [
      "Oui, une amende à la compagnie peut être infligée indépendamment des sanctions individuelles"
    ]
  },
  {
    "id": "cdc-238",
    "title": "Les conflits doivent être signalés au staff via :",
    "options": [
      "Le salon général",
      "Le canal de signalement prévu à cet effet",
      "Un DM à n'importe quel modérateur",
      "Le salon d'annonces"
    ],
    "correct_answers": [
      "Le canal de signalement prévu à cet effet"
    ]
  },
  {
    "id": "cdc-239",
    "title": "Un cours en vocal peut-il être enregistré librement par les participants ?",
    "options": [
      "Oui, à des fins personnelles",
      "Oui, si le formateur n'a pas interdit l'enregistrement",
      "Non, une autorisation explicite du staff est toujours requise",
      "Oui, si le cours est théorique"
    ],
    "correct_answers": [
      "Non, une autorisation explicite du staff est toujours requise"
    ]
  },
  {
    "id": "cdc-240",
    "title": "L'obligation de déclaration de position concerne quel type de membres ?",
    "options": [
      "Tous les pilotes RP",
      "Les pompiers RP et les contrôleurs aériens (ATC) RP",
      "Uniquement les membres du staff en opération",
      "Tous les membres actifs lors d'une opération"
    ],
    "correct_answers": [
      "Les pompiers RP et les contrôleurs aériens (ATC) RP"
    ]
  },
  {
    "id": "cdc-241",
    "title": "Combien d'échelons compose la hiérarchie du serveur MIXOU AIRLINES PTFS ?",
    "options": [
      "Trois",
      "Quatre",
      "Cinq",
      "Six"
    ],
    "correct_answers": [
      "Cinq"
    ]
  },
  {
    "id": "cdc-242",
    "title": "Un membre ordinaire peut-il se faire sanctionner par un autre membre ordinaire ?",
    "options": [
      "Oui, si le membre sanctionnant est plus ancien",
      "Non, seule la direction peut sanctionner",
      "Oui, lors des événements communautaires",
      "Oui, pour les infractions mineures en l'absence de staff"
    ],
    "correct_answers": [
      "Non, seule la direction peut sanctionner"
    ]
  },
  {
    "id": "cdc-243",
    "title": "En cas d'inactivité prolongée, un rôle peut-il être retiré ?",
    "options": [
      "Non, un rôle est permanent une fois accordé",
      "Oui, le staff peut retirer un rôle en cas d'inactivité prolongée",
      "Oui, mais uniquement les rôles décoratifs",
      "Non, sauf si le membre a commis une infraction"
    ],
    "correct_answers": [
      "Oui, le staff peut retirer un rôle en cas d'inactivité prolongée"
    ]
  },
  {
    "id": "cdc-244",
    "title": "Les règles spécifiques à un événement compétitif sont précisées dans :",
    "options": [
      "Le Code de Conduite uniquement",
      "L'annonce officielle de l'événement",
      "Un règlement interne non public",
      "Les règles de l'article 4"
    ],
    "correct_answers": [
      "L'annonce officielle de l'événement"
    ]
  },
  {
    "id": "cdc-245",
    "title": "La Cour Suprême peut-elle traiter une affaire impliquant un membre du staff dans l'exercice de ses fonctions ?",
    "options": [
      "Non, les membres du staff sont jugés par les Fondateurs uniquement",
      "Oui, c'est l'une de ses compétences",
      "Non, c'est géré en interne par l'Administration",
      "Oui, uniquement pour les membres de la Modération"
    ],
    "correct_answers": [
      "Oui, c'est l'une de ses compétences"
    ]
  },
  {
    "id": "cdc-246",
    "title": "Qui peut interrompre un échange dans un salon HRP jugé problématique ?",
    "options": [
      "N'importe quel membre présent",
      "Le staff, qui se réserve ce droit",
      "Uniquement les Fondateurs",
      "N'importe quel membre avec un rôle communautaire"
    ],
    "correct_answers": [
      "Le staff, qui se réserve ce droit"
    ]
  },
  {
    "id": "cdc-247",
    "title": "Le système de sanctions RP est conçu pour refléter :",
    "options": [
      "Les lois françaises en vigueur",
      "La réalité du monde aéronautique et entrepreneurial simulé",
      "Les règles de Discord en matière de modération",
      "Les standards de l'OACI"
    ],
    "correct_answers": [
      "La réalité du monde aéronautique et entrepreneurial simulé"
    ]
  },
  {
    "id": "cdc-248",
    "title": "Les Instructeurs transmettent les situations problématiques à :",
    "options": [
      "La Cour Suprême directement",
      "La Modération ou à l'Administration, sans intervenir directement",
      "Les Fondateurs uniquement",
      "Leurs collègues Instructeurs pour délibération"
    ],
    "correct_answers": [
      "La Modération ou à l'Administration, sans intervenir directement"
    ]
  },
  {
    "id": "cdc-249",
    "title": "Quel comportement est formellement prohibé selon l'article 3.3 ?",
    "options": [
      "Poster des captures d'écran de vols",
      "Partager des liens vers des serveurs amis avec autorisation",
      "Les insultes et attaques personnelles",
      "Demander un nouveau rôle"
    ],
    "correct_answers": [
      "Les insultes et attaques personnelles"
    ]
  },
  {
    "id": "cdc-250",
    "title": "Le type d'aéronef utilisé doit-il figurer dans le logbook ?",
    "options": [
      "Non, uniquement la compagnie aérienne",
      "Oui, c'est une mention obligatoire",
      "Non, uniquement la destination",
      "Oui, uniquement pour les gros porteurs"
    ],
    "correct_answers": [
      "Oui, c'est une mention obligatoire"
    ]
  },
  {
    "id": "cdc-251",
    "title": "Selon l'article 1.5, qui examine la situation en cas de ping harcelant signalé ?",
    "options": [
      "La victime du ping, avec l'aide d'un ami",
      "Le staff, via le canal de signalement",
      "La Cour Suprême",
      "Un vote des membres présents"
    ],
    "correct_answers": [
      "Le staff, via le canal de signalement"
    ]
  },
  {
    "id": "cdc-252",
    "title": "Un salon Chill libéré d'obligations opérationnelles reste néanmoins soumis à :",
    "options": [
      "Aucune règle spécifique",
      "L'article 3 (comportement général) et les dispositions générales de l'article 5",
      "Uniquement les règles de l'article 5",
      "Les règles fixées librement par les membres présents"
    ],
    "correct_answers": [
      "L'article 3 (comportement général) et les dispositions générales de l'article 5"
    ]
  },
  {
    "id": "cdc-253",
    "title": "La Cour Suprême peut être saisie directement pour :",
    "options": [
      "Tout litige mineur pour aller plus vite",
      "Lorsque la nature ou la gravité du litige justifie un traitement immédiat",
      "Uniquement en appel du Tribunal Administratif",
      "Uniquement pour les affaires impliquant le staff"
    ],
    "correct_answers": [
      "Lorsque la nature ou la gravité du litige justifie un traitement immédiat"
    ]
  },
  {
    "id": "cdc-254",
    "title": "La suspension RP est une exclusion :",
    "options": [
      "Définitive de toute activité sur le serveur",
      "Temporaire de toute activité roleplay sur le serveur",
      "Permanente des salons vocaux",
      "Temporaire des salons textuels uniquement"
    ],
    "correct_answers": [
      "Temporaire de toute activité roleplay sur le serveur"
    ]
  },
  {
    "id": "cdc-255",
    "title": "L'annonce d'un événement doit être publiée dans quel salon ?",
    "options": [
      "Le salon général",
      "Le salon d'annonces dédié",
      "Le salon RP actif",
      "Le salon de propositions d'événements"
    ],
    "correct_answers": [
      "Le salon d'annonces dédié"
    ]
  },
  {
    "id": "cdc-256",
    "title": "La révocation d'un membre de l'Administration relève de :",
    "options": [
      "La Cour Suprême",
      "L'Administration elle-même",
      "La seule autorité des Fondateurs",
      "Un vote du staff"
    ],
    "correct_answers": [
      "La seule autorité des Fondateurs"
    ]
  },
  {
    "id": "cdc-257",
    "title": "Les règles additionnelles d'un salon RP s'appliquent-elles en complément ou à la place des dispositions générales ?",
    "options": [
      "À la place des dispositions générales",
      "En complément des dispositions générales",
      "Selon le choix du staff",
      "Uniquement si elles sont validées par les Fondateurs"
    ],
    "correct_answers": [
      "En complément des dispositions générales"
    ]
  },
  {
    "id": "cdc-258",
    "title": "Avoir commis une infraction en groupe est :",
    "options": [
      "Une circonstance atténuante",
      "Un élément neutre",
      "Une circonstance aggravante",
      "Un motif de réduction de la sanction individuelle"
    ],
    "correct_answers": [
      "Une circonstance aggravante"
    ]
  },
  {
    "id": "cdc-259",
    "title": "Quel canal doit être utilisé pour saisir le Tribunal Administratif ?",
    "options": [
      "Le salon général du serveur",
      "Le canal officiel prévu à cet effet",
      "Un DM envoyé à un modérateur",
      "Le salon d'annonces"
    ],
    "correct_answers": [
      "Le canal officiel prévu à cet effet"
    ]
  },
  {
    "id": "cdc-260",
    "title": "La sanction automatique et une éventuelle sanction du staff prononcées simultanément sont-elles :",
    "options": [
      "Fusionnées en une seule sanction",
      "Distinctes et indépendantes l'une de l'autre",
      "Mutuellement exclusives",
      "Cumulées uniquement en cas de récidive"
    ],
    "correct_answers": [
      "Distinctes et indépendantes l'une de l'autre"
    ]
  },
  {
    "id": "cdc-261",
    "title": "La discrétion des signalements est-elle garantie par le staff ?",
    "options": [
      "Non, les signalements sont publics pour transparence",
      "Oui, la discrétion est garantie",
      "Oui, mais uniquement pour les affaires HRP",
      "Non, les membres doivent signaler publiquement"
    ],
    "correct_answers": [
      "Oui, la discrétion est garantie"
    ]
  },
  {
    "id": "cdc-262",
    "title": "Le Staff Stagiaire bénéficie d'une période d'observation pour évaluer :",
    "options": [
      "Uniquement sa connaissance du Code de Conduite",
      "Ses compétences, sérieux et investissement",
      "Uniquement sa disponibilité horaire",
      "Sa popularité parmi les membres"
    ],
    "correct_answers": [
      "Ses compétences, sérieux et investissement"
    ]
  },
  {
    "id": "cdc-263",
    "title": "Un membre banni définitivement peut-il demander la levée de son bannissement ?",
    "options": [
      "Non, jamais",
      "Oui, seuls les Fondateurs peuvent lever un bannissement définitif, à titre exceptionnel, après un délai minimum",
      "Oui, auprès de la Cour Suprême",
      "Oui, immédiatement après la sanction"
    ],
    "correct_answers": [
      "Oui, seuls les Fondateurs peuvent lever un bannissement définitif, à titre exceptionnel, après un délai minimum"
    ]
  },
  {
    "id": "cdc-264",
    "title": "Les litiges survenant lors d'un événement roleplay sont traités conformément à :",
    "options": [
      "Les règles spécifiques de l'événement",
      "L'article 6 du Code de Conduite",
      "L'article 8 uniquement",
      "Les directives du staff organisateur"
    ],
    "correct_answers": [
      "L'article 6 du Code de Conduite"
    ]
  },
  {
    "id": "cdc-265",
    "title": "Un membre peut-il exiger un rôle ?",
    "options": [
      "Oui, s'il remplit les conditions",
      "Non, réclamer ou exiger un rôle est formellement interdit",
      "Oui, après 6 mois d'ancienneté",
      "Oui, lors des candidatures officielles"
    ],
    "correct_answers": [
      "Non, réclamer ou exiger un rôle est formellement interdit"
    ]
  },
  {
    "id": "cdc-266",
    "title": "Les salons d'instructions vocaux se distinguent des cours par :",
    "options": [
      "Leur caractère optionnel",
      "Leur caractère directif et leur lien avec le déroulement en temps réel des opérations",
      "Leur accessibilité à tous les membres",
      "L'absence de formateur désigné"
    ],
    "correct_answers": [
      "Leur caractère directif et leur lien avec le déroulement en temps réel des opérations"
    ]
  },
  {
    "id": "cdc-267",
    "title": "Les Fondateurs exercent leur autorité de manière :",
    "options": [
      "Individuelle, chacun dans son domaine",
      "Collégiale, dans un esprit de consensus",
      "Hiérarchique, avec un Fondateur principal",
      "Déléguée à l'Administration"
    ],
    "correct_answers": [
      "Collégiale, dans un esprit de consensus"
    ]
  },
  {
    "id": "cdc-268",
    "title": "Les voies de recours doivent-elles être mentionnées dans la notification de sanction ?",
    "options": [
      "Non, c'est à la charge du membre de les rechercher",
      "Oui, la notification doit préciser les voies de recours disponibles",
      "Oui, uniquement pour les sanctions HRP",
      "Non, les recours sont traités séparément"
    ],
    "correct_answers": [
      "Oui, la notification doit préciser les voies de recours disponibles"
    ]
  },
  {
    "id": "cdc-269",
    "title": "Qu'est-ce que le fair-play dans le cadre des événements ?",
    "options": [
      "Gagner à tout prix pour obtenir les récompenses",
      "Adopter un comportement respectueux et conforme à l'esprit de l'événement",
      "Respecter uniquement les règles compétitives",
      "S'abstenir de contester les résultats"
    ],
    "correct_answers": [
      "Adopter un comportement respectueux et conforme à l'esprit de l'événement"
    ]
  },
  {
    "id": "cdc-270",
    "title": "L'heure du vol RP doit-elle figurer dans le logbook ?",
    "options": [
      "Non, uniquement la date",
      "Oui, la date et l'heure sont des mentions obligatoires",
      "Non, uniquement la durée suffit",
      "Oui, uniquement pour les vols de nuit"
    ],
    "correct_answers": [
      "Oui, la date et l'heure sont des mentions obligatoires"
    ]
  },
  {
    "id": "cdc-271",
    "title": "Selon l'article 1.6, quelle est la nature juridique du ping spam ?",
    "options": [
      "Une infraction administrative",
      "Une forme de harcèlement passible de sanctions",
      "Un comportement mineur toléré",
      "Une infraction uniquement si répétée sur 3 jours"
    ],
    "correct_answers": [
      "Une forme de harcèlement passible de sanctions"
    ]
  },
  {
    "id": "cdc-272",
    "title": "La prise de parole durant un cours vocal est soumise à :",
    "options": [
      "L'autorisation de n'importe quel membre présent",
      "L'autorisation du formateur",
      "Une demande écrite dans le salon textuel",
      "Aucune condition, la parole est libre"
    ],
    "correct_answers": [
      "L'autorisation du formateur"
    ]
  },
  {
    "id": "cdc-273",
    "title": "Les membres de l'Administration participent-ils aux délibérations de la Cour Suprême ?",
    "options": [
      "Non, c'est incompatible avec leur rôle",
      "Oui, conformément à l'article 6",
      "Oui, uniquement pour les affaires RP",
      "Non, ils gèrent uniquement les affaires HRP"
    ],
    "correct_answers": [
      "Oui, conformément à l'article 6"
    ]
  },
  {
    "id": "cdc-274",
    "title": "La suspension de licence est une mesure :",
    "options": [
      "Définitive et irrévocable",
      "Temporaire, pour une durée déterminée",
      "Préventive sans durée définie",
      "Applicable uniquement aux commandants de bord"
    ],
    "correct_answers": [
      "Temporaire, pour une durée déterminée"
    ]
  },
  {
    "id": "cdc-275",
    "title": "La participation aux événements spéciaux est-elle encouragée ?",
    "options": [
      "Non, elle est libre sans encouragement particulier",
      "Oui, elle est encouragée par la direction du serveur",
      "Non, ces événements sont réservés aux membres premium",
      "Oui, elle est obligatoire pour les membres actifs"
    ],
    "correct_answers": [
      "Oui, elle est encouragée par la direction du serveur"
    ]
  },
  {
    "id": "cdc-276",
    "title": "L'examen de recevabilité est quelle étape de la procédure devant la Cour Suprême ?",
    "options": [
      "La première",
      "La deuxième",
      "La troisième",
      "La dernière"
    ],
    "correct_answers": [
      "La deuxième"
    ]
  },
  {
    "id": "cdc-277",
    "title": "Les attaques personnelles sont explicitement listées parmi les comportements :",
    "options": [
      "Tolérés dans le cadre du roleplay",
      "Formellement prohibés",
      "Sanctionnés uniquement si répétés",
      "Gérés par le Tribunal Administratif"
    ],
    "correct_answers": [
      "Formellement prohibés"
    ]
  },
  {
    "id": "cdc-278",
    "title": "Lors du calcul de l'amende RP, la capacité financière de la compagnie est-elle prise en compte ?",
    "options": [
      "Non, le montant est fixe pour tous",
      "Oui, parmi les critères de fixation du montant",
      "Non, seule la gravité de l'infraction compte",
      "Oui, uniquement pour les grandes compagnies"
    ],
    "correct_answers": [
      "Oui, parmi les critères de fixation du montant"
    ]
  },
  {
    "id": "cdc-279",
    "title": "Les contenus à caractère violent ou choquant sont-ils autorisés dans les salons HRP ?",
    "options": [
      "Oui, s'ils sont floutés ou marqués NSFW",
      "Non, ils sont explicitement interdits",
      "Oui, dans les salons de débat uniquement",
      "Oui, avec l'accord du staff"
    ],
    "correct_answers": [
      "Non, ils sont explicitement interdits"
    ]
  },
  {
    "id": "cdc-280",
    "title": "Le terme 'déconnexion administrative' désigne quelle situation spécifique ?",
    "options": [
      "Une déconnexion volontaire effectuée par le staff",
      "Une déconnexion forcée par le système en l'absence de déconnexion volontaire du membre",
      "Une déconnexion planifiée pour maintenance du serveur",
      "Une déconnexion pour cause de bannissement"
    ],
    "correct_answers": [
      "Une déconnexion forcée par le système en l'absence de déconnexion volontaire du membre"
    ]
  },
  {
    "id": "cdc-281",
    "title": "Quel est l'ordre hiérarchique correct, du plus élevé au plus bas ?",
    "options": [
      "Fondateurs, Modération, Administration, Staff Stagiaire, Instructeurs",
      "Fondateurs, Administration, Modération, Instructeurs, Staff Stagiaire",
      "Fondateurs, Administration, Modération, Staff Stagiaire, Instructeurs",
      "Administration, Fondateurs, Modération, Staff Stagiaire, Instructeurs"
    ],
    "correct_answers": [
      "Fondateurs, Administration, Modération, Staff Stagiaire, Instructeurs"
    ]
  },
  {
    "id": "cdc-282",
    "title": "Quel est l'ordre croissant de gravité des sanctions HRP ?",
    "options": [
      "Avertissement verbal, avertissement écrit, blâme, mute, kick, bannissement temporaire, bannissement définitif",
      "Avertissement écrit, blâme, mute, kick, bannissement temporaire, bannissement définitif",
      "Blâme, avertissement verbal, mute, kick, bannissement",
      "Avertissement verbal, blâme, mute, bannissement temporaire, bannissement définitif"
    ],
    "correct_answers": [
      "Avertissement verbal, avertissement écrit, blâme, mute, kick, bannissement temporaire, bannissement définitif"
    ]
  },
  {
    "id": "cdc-283",
    "title": "Les membres de la Cour Suprême sont tenus à une obligation de :",
    "options": [
      "Résultats mesurables et transparence totale",
      "Neutralité, impartialité et confidentialité absolue",
      "Rapidité de traitement des dossiers",
      "Communication régulière avec les parties"
    ],
    "correct_answers": [
      "Neutralité, impartialité et confidentialité absolue"
    ]
  },
  {
    "id": "cdc-284",
    "title": "Le staff organisateur d'un événement dispose-t-il de l'autorité pour en assurer le bon déroulement ?",
    "options": [
      "Non, il doit consulter les Fondateurs pour chaque décision",
      "Oui, il dispose de l'autorité nécessaire",
      "Oui, mais uniquement pour les décisions mineures",
      "Non, l'autorité reste à la Cour Suprême"
    ],
    "correct_answers": [
      "Oui, il dispose de l'autorité nécessaire"
    ]
  },
  {
    "id": "cdc-285",
    "title": "Un membre menace le staff pour obtenir une promotion de rôle. Quelle sanction risque-t-il ?",
    "options": [
      "Aucune, si la promotion était légitimement due",
      "Un avertissement uniquement",
      "Une sanction pour tentative de pression",
      "Un bannissement automatique"
    ],
    "correct_answers": [
      "Une sanction pour tentative de pression"
    ]
  },
  {
    "id": "cdc-286",
    "title": "Les règles d'un salon vocal sont-elles affichées dans sa description ou épinglées par le staff ?",
    "options": [
      "Non, les règles sont identiques pour tous les salons vocaux",
      "Oui, des règles additionnelles peuvent y être précisées",
      "Non, seule la hiérarchie détermine les règles",
      "Oui, mais uniquement pour les salons Fréquence"
    ],
    "correct_answers": [
      "Oui, des règles additionnelles peuvent y être précisées"
    ]
  },
  {
    "id": "cdc-287",
    "title": "Le Staff doit-il faire preuve de cohérence dans l'application des sanctions ?",
    "options": [
      "Non, chaque modérateur applique ses propres standards",
      "Oui, le staff s'engage expressément à la cohérence",
      "Oui, mais uniquement pour les sanctions HRP",
      "Non, la cohérence est un idéal non contraignant"
    ],
    "correct_answers": [
      "Oui, le staff s'engage expressément à la cohérence"
    ]
  },
  {
    "id": "cdc-288",
    "title": "Les pseudonymes vulgaires peuvent entraîner quel type de sanction en premier lieu ?",
    "options": [
      "Un bannissement définitif immédiat",
      "Un changement forcé du pseudonyme ou une exclusion temporaire",
      "Uniquement un avertissement verbal",
      "Une mise en sourdine de 24h"
    ],
    "correct_answers": [
      "Un changement forcé du pseudonyme ou une exclusion temporaire"
    ]
  },
  {
    "id": "cdc-289",
    "title": "Un ATC RP qui ne déconnecte pas sa position avant de quitter Discord commet :",
    "options": [
      "Aucune infraction si c'est involontaire",
      "Une infraction à l'article 10.10",
      "Une infraction uniquement si cela dure plus d'une heure",
      "Une infraction uniquement lors des heures d'opérations officielles"
    ],
    "correct_answers": [
      "Une infraction à l'article 10.10"
    ]
  },
  {
    "id": "cdc-290",
    "title": "Un Instructeur qui prend des mesures coercitives de sa propre initiative risque :",
    "options": [
      "Un avertissement de l'Administration",
      "La remise en question de son statut",
      "Un bannissement temporaire",
      "La rétrogradation au rang de membre ordinaire"
    ],
    "correct_answers": [
      "La remise en question de son statut"
    ]
  },
  {
    "id": "cdc-291",
    "title": "Les sanctions disciplinaires RP individuelles (rétrogradation, suspension, exclusion) sont-elles liées à celles concernant les licences ?",
    "options": [
      "Oui, elles sont toujours prononcées ensemble",
      "Non, elles peuvent être prononcées indépendamment de tout impact sur les licences ou la compagnie",
      "Oui, mais uniquement pour les propriétaires de compagnie",
      "Non, elles remplacent systématiquement les sanctions sur les licences"
    ],
    "correct_answers": [
      "Non, elles peuvent être prononcées indépendamment de tout impact sur les licences ou la compagnie"
    ]
  },
  {
    "id": "cdc-292",
    "title": "Le Tribunal Administratif est décrit comme quelle instance dans le système de litiges ?",
    "options": [
      "La juridiction de dernier ressort",
      "La première instance de règlement des différends RP",
      "L'instance exclusive pour les affaires HRP",
      "La juridiction d'appel du Cour Suprême"
    ],
    "correct_answers": [
      "La première instance de règlement des différends RP"
    ]
  },
  {
    "id": "cdc-293",
    "title": "Un membre peut-il être exclu d'un événement s'il adopte un comportement contraire à son esprit ?",
    "options": [
      "Non, uniquement après une procédure disciplinaire complète",
      "Oui, sans préavis, par le staff organisateur",
      "Oui, mais uniquement avec l'accord des Fondateurs",
      "Non, il peut terminer l'événement et être sanctionné après"
    ],
    "correct_answers": [
      "Oui, sans préavis, par le staff organisateur"
    ]
  },
  {
    "id": "cdc-294",
    "title": "Chaque membre est responsable de vérifier la description du salon avant d'envoyer un message pour s'assurer que :",
    "options": [
      "Le message respecte la limite de caractères",
      "Son contenu correspond à l'usage prévu du salon",
      "Le salon est accessible à son niveau de rôle",
      "Le message est rédigé dans la bonne langue"
    ],
    "correct_answers": [
      "Son contenu correspond à l'usage prévu du salon"
    ]
  },
  {
    "id": "cdc-295",
    "title": "La provocation avérée à l'encontre du membre fautif peut être considérée comme :",
    "options": [
      "Une circonstance aggravante",
      "Un élément neutre",
      "Une circonstance atténuante liée au contexte de l'infraction",
      "Un motif d'annulation de la sanction"
    ],
    "correct_answers": [
      "Une circonstance atténuante liée au contexte de l'infraction"
    ]
  },
  {
    "id": "cdc-296",
    "title": "La modification du Code de Conduite est-elle considérée comme une décision majeure ?",
    "options": [
      "Non, c'est une décision opérationnelle courante",
      "Oui, c'est explicitement cité comme exemple de décision majeure",
      "Oui, mais uniquement si plus de 3 articles sont modifiés",
      "Non, si elle est approuvée par l'Administration"
    ],
    "correct_answers": [
      "Oui, c'est explicitement cité comme exemple de décision majeure"
    ]
  },
  {
    "id": "cdc-297",
    "title": "À quelle fréquence le logbook doit-il être tenu à jour ?",
    "options": [
      "Mensuellement",
      "À chaque vol RP effectué",
      "Hebdomadairement",
      "Uniquement sur demande du staff"
    ],
    "correct_answers": [
      "À chaque vol RP effectué"
    ]
  },
  {
    "id": "cdc-298",
    "title": "L'ensemble des règles de l'article 3 s'applique à quelle population ?",
    "options": [
      "Aux membres ordinaires uniquement",
      "À tous les membres rejoignant le serveur, sans exception",
      "Aux membres sans rôle de staff uniquement",
      "Aux membres en période probatoire"
    ],
    "correct_answers": [
      "À tous les membres rejoignant le serveur, sans exception"
    ]
  },
  {
    "id": "cdc-299",
    "title": "Selon le mot de clôture des Fondateurs, MIXOU AIRLINES PTFS est décrit comme :",
    "options": [
      "Un simple serveur Discord de divertissement",
      "Un monde aérien simulé, construit avec passion, avec ses propres institutions et droit",
      "Une école de formation aéronautique virtuelle",
      "Un groupe de passionnés sans structure formelle"
    ],
    "correct_answers": [
      "Un monde aérien simulé, construit avec passion, avec ses propres institutions et droit"
    ]
  },
  {
    "id": "cdc-300",
    "title": "En demeurant membre du serveur après la publication du Code de Conduite, un membre est réputé :",
    "options": [
      "Ne l'avoir lu que partiellement",
      "Ne pas être concerné par les nouvelles règles",
      "En avoir pris connaissance et en accepter l'intégralité des dispositions tacitement et irrévocablement",
      "Être en période de grâce de 7 jours pour décider de l'accepter"
    ],
    "correct_answers": [
      "En avoir pris connaissance et en accepter l'intégralité des dispositions tacitement et irrévocablement"
    ]
  }
]$cdc$::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM aeroschool_question_modules WHERE title = 'Code de Conduite MIXOU AIRLINES PTFS — Test de Connaissance'
);

-- Vérification (optionnel) :
-- SELECT jsonb_array_length(questions) FROM aeroschool_question_modules WHERE title = 'Code de Conduite MIXOU AIRLINES PTFS — Test de Connaissance';
