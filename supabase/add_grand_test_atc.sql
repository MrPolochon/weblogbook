-- ============================================
-- Grand Test ATC : Contrôleur Confirmé (QCM)
-- ============================================

INSERT INTO aeroschool_forms (title, description, delivery_mode, is_published, sections)
VALUES (
  'GRAND TEST ATC — Contrôleur Confirmé',
  'Le Grand Test ATC permet de valider les compétences nécessaires pour devenir un contrôleur confirmé. Toutes les positions sont évaluées : Tower, Delivery, Departure/Arrival, Ground, Center et Clairance. QCM — 4 choix, 1 seule bonne réponse par question. Score max : 60 points.',
  'review',
  true,
  '[
    {
      "id": "sec-formulaire",
      "title": "Formulaire",
      "description": "Informations personnelles du candidat.",
      "questions": [
        {
          "id": "q-pseudo-discord",
          "type": "short_text",
          "title": "Pseudo Discord (les deux séparés d''un |)",
          "description": "Exemple : MrPolochon|Zephyrins",
          "required": true,
          "options": [],
          "is_graded": false,
          "points": 0,
          "correct_answers": []
        },
        {
          "id": "q-pseudo-roblox",
          "type": "short_text",
          "title": "Pseudo Roblox",
          "description": "",
          "required": true,
          "options": [],
          "is_graded": false,
          "points": 0,
          "correct_answers": []
        }
      ]
    },
    {
      "id": "sec-serment",
      "title": "Jure sur l''honneur",
      "description": "",
      "questions": [
        {
          "id": "q-serment",
          "type": "paragraph",
          "title": "Je jure, sur l''honneur, de la validité de mes réponses à ce test et atteste ne m''être aidé que de mes connaissances acquises lors de mes révisions.",
          "description": "Main levée récitant cette phrase à haute voix.",
          "required": true,
          "options": [],
          "is_graded": false,
          "points": 0,
          "correct_answers": []
        }
      ]
    },
    {
      "id": "sec-tower",
      "title": "TOWER",
      "description": "Questions relatives à la position Tower.",
      "questions": [
        {
          "id": "q-tower-1",
          "type": "multiple_choice",
          "title": "Comment se nomme le lieu de la tour de contrôle où les contrôleurs en position TOWER contrôlent le trafic ?",
          "description": "",
          "required": true,
          "options": ["La vigie", "La tour de contrôle", "Le centre de contrôle régional", "Le poste de commandement"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["La tour de contrôle"]
        },
        {
          "id": "q-tower-2",
          "type": "multiple_choice",
          "title": "Le code d''information ATIS vient de changer, je dois annoncer quoi sur la fréquence ?",
          "description": "",
          "required": true,
          "options": [
            "Nouveau ATIS disponible, vérifiez vos informations",
            "A tout le trafique, ATIS modifier a 15 heure 00, reporter copier",
            "Information ATIS changée, contactez le sol pour mise à jour",
            "ATIS mis à jour, nouveau code en vigueur"
          ],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["A tout le trafique, ATIS modifier a 15 heure 00, reporter copier"]
        },
        {
          "id": "q-tower-3",
          "type": "multiple_choice",
          "title": "Qui a la priorité du contrôle ?",
          "description": "",
          "required": true,
          "options": ["Un avion au point d''attente prêt au décollage", "Un avion en final piste 25", "Un avion en montée initiale", "Un avion au roulage vers la piste"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Un avion en final piste 25"]
        },
        {
          "id": "q-tower-4",
          "type": "multiple_choice",
          "title": "Quel est le QNH standard ?",
          "description": "",
          "required": true,
          "options": ["1012", "1013", "1015", "1023"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["1013"]
        },
        {
          "id": "q-tower-5",
          "type": "multiple_choice",
          "title": "Quel est le sens normal du tour de piste ?",
          "description": "",
          "required": true,
          "options": ["Par la droite (prise main droite)", "Par la gauche (prise main gauche)", "Variable selon la piste en service", "Alterné gauche/droite selon le trafic"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Par la gauche (prise main gauche)"]
        },
        {
          "id": "q-tower-6",
          "type": "multiple_choice",
          "title": "Les traversées de pistes sont gérées par la tour.",
          "description": "",
          "required": true,
          "options": ["Non, c''est le sol qui gère", "Oui, mais partagé avec le sol", "Oui, entièrement", "Uniquement en cas de trafic dense"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Oui, entièrement"]
        },
        {
          "id": "q-tower-7",
          "type": "multiple_choice",
          "title": "De quelle couleur sont les lampes latérales de pistes ?",
          "description": "",
          "required": true,
          "options": ["Bleue", "Verte", "Blanche", "Jaune"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Blanche"]
        },
        {
          "id": "q-tower-8",
          "type": "multiple_choice",
          "title": "Quel est le critère principal à vérifier avant de délivrer une autorisation d''atterrissage à un avion ?",
          "description": "",
          "required": true,
          "options": [
            "Vérifier que la piste est libre",
            "S''assurer que l''avion est stabilisé en approche",
            "Il faut impérativement donner les vents avant de donner l''autorisation",
            "Confirmer le QNH avec le pilote"
          ],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Il faut impérativement donner les vents avant de donner l''autorisation"]
        },
        {
          "id": "q-tower-9",
          "type": "multiple_choice",
          "title": "Quel est l''ordre à donner pour qu''un avion s''arrête avant la piste ?",
          "description": "",
          "required": true,
          "options": ["Stoppez avant piste", "Maintenez avant piste", "Attendez au point d''arrêt piste", "Restez en position, piste occupée"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Maintenez avant piste"]
        },
        {
          "id": "q-tower-10",
          "type": "multiple_choice",
          "title": "Quelle est la fonction principale du contrôleur Tour, par rapport à un contrôleur sol ?",
          "description": "",
          "required": true,
          "options": ["Gérer les décollages uniquement", "Donner les clairances de départ", "Guider les aéronefs", "Surveiller les taxiways"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Guider les aéronefs"]
        }
      ]
    },
    {
      "id": "sec-delivery",
      "title": "DELIVERY",
      "description": "Questions relatives à la position Delivery.",
      "questions": [
        {
          "id": "q-delivery-1",
          "type": "multiple_choice",
          "title": "Un plan de vol d''arrivée doit être transféré à quelle position ?",
          "description": "",
          "required": true,
          "options": ["La tour", "Le sol", "L''approche", "Le center"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["L''approche"]
        },
        {
          "id": "q-delivery-2",
          "type": "multiple_choice",
          "title": "Vous êtes au delivery à IRFD, vous recevez un plan de vol pour IPPH, quelle altitude de croisière est appropriée pour faire ce vol ?",
          "description": "",
          "required": true,
          "options": ["FL380", "FL390", "FL400", "FL360"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["FL390"]
        },
        {
          "id": "q-delivery-3",
          "type": "multiple_choice",
          "title": "Pour un plan de vol VFR, le pilote doit envoyer obligatoirement ?",
          "description": "",
          "required": true,
          "options": ["Un plan de vol complet avec SID/STAR", "L''intention de vol", "Une demande de clairance IFR", "Le code transpondeur souhaité"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["L''intention de vol"]
        },
        {
          "id": "q-delivery-4",
          "type": "multiple_choice",
          "title": "La delivery est-elle apte à délivrer une clairance si un contrôleur en position de clearance est en ligne ?",
          "description": "",
          "required": true,
          "options": ["Oui, les deux peuvent délivrer en parallèle", "Oui, mais uniquement pour les VFR", "Non", "Oui, avec l''accord du clearance"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Non"]
        },
        {
          "id": "q-delivery-5",
          "type": "multiple_choice",
          "title": "Si un plan de vol arrive chez vous, que faites-vous en premier ?",
          "description": "",
          "required": true,
          "options": ["Je délivre la clairance immédiatement", "Je contacte le pilote sur la fréquence", "Je vérifie les informations liées à l''avion", "Je transfère le plan au sol"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Je vérifie les informations liées à l''avion"]
        },
        {
          "id": "q-delivery-6",
          "type": "multiple_choice",
          "title": "La delivery peut déclencher qui ?",
          "description": "",
          "required": true,
          "options": ["Les pompiers", "Le ground crew", "Le contrôleur sol", "L''approche"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Le ground crew"]
        },
        {
          "id": "q-delivery-7",
          "type": "multiple_choice",
          "title": "Quel est le code position de la delivery ?",
          "description": "",
          "required": true,
          "options": ["10", "15", "20", "25"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["15"]
        },
        {
          "id": "q-delivery-8",
          "type": "multiple_choice",
          "title": "Pour un vol entre IRFD et ILMR, quelle altitude de croisière est le plus adaptée ?",
          "description": "",
          "required": true,
          "options": ["3000", "5000", "FL180", "FL250"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["5000"]
        },
        {
          "id": "q-delivery-9",
          "type": "multiple_choice",
          "title": "Que veut dire VFR ?",
          "description": "",
          "required": true,
          "options": ["Verified Flight Route", "Visual Flight Rules", "Variable Frequency Radio", "Visual Frequency Range"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Visual Flight Rules"]
        },
        {
          "id": "q-delivery-10",
          "type": "multiple_choice",
          "title": "Que veut dire STAR ?",
          "description": "",
          "required": true,
          "options": ["Standard Terminal Arrival Route", "Sectional Terminal Arrival Rules", "System Terminal Approach Radar", "Sectional Tracking Arrival Route"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Sectional Terminal Arrival Rules"]
        }
      ]
    },
    {
      "id": "sec-departure-arrival",
      "title": "DEPARTURE / ARRIVAL",
      "description": "Questions relatives aux positions Departure et Arrival (approche).",
      "questions": [
        {
          "id": "q-depapp-1",
          "type": "multiple_choice",
          "title": "Quand un avion doit-il contacter l''approche ?",
          "description": "",
          "required": true,
          "options": ["Après l''atterrissage", "Avant la descente", "Pendant la montée initiale", "Au décollage"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Avant la descente"]
        },
        {
          "id": "q-depapp-2",
          "type": "multiple_choice",
          "title": "Si un avion vole hors CTR, mais à basse altitude, est-il obligé de contacter la TMA ?",
          "description": "",
          "required": true,
          "options": [
            "Non, il est hors zone contrôlée",
            "Oui car le départ/l''approche gère l''espace aérien au-delà de la CTR",
            "Seulement s''il est en IFR",
            "Uniquement si le center le demande"
          ],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Oui car le départ/l''approche gère l''espace aérien au-delà de la CTR"]
        },
        {
          "id": "q-depapp-3",
          "type": "multiple_choice",
          "title": "Entre un avion VFR et un avion IFR, qui est prioritaire ?",
          "description": "",
          "required": true,
          "options": ["Le vol VFR", "Le vol IFR", "Ils ont la même priorité", "Celui qui est arrivé en premier sur la fréquence"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Le vol IFR"]
        },
        {
          "id": "q-depapp-4",
          "type": "multiple_choice",
          "title": "À quoi correspond le code transpondeur 7600 ?",
          "description": "",
          "required": true,
          "options": ["Urgence générale", "Détournement", "Panne radio", "Vol sanitaire"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Panne radio"]
        },
        {
          "id": "q-depapp-5",
          "type": "multiple_choice",
          "title": "Quand l''espace est rempli d''avions, quelle procédure l''approche peut-elle utiliser pour réguler le flux ?",
          "description": "",
          "required": true,
          "options": ["Fermer l''espace aérien aux VFR", "Accélérer les séquences d''approche", "Mettre certains avions en HOLD", "Dérouter tous les vols vers un autre aéroport"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Mettre certains avions en HOLD"]
        },
        {
          "id": "q-depapp-6",
          "type": "multiple_choice",
          "title": "Je veux qu''un avion avance vers le nord, je lui dis d''aller à quel cap ?",
          "description": "",
          "required": true,
          "options": ["000", "090", "180", "360"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["360"]
        },
        {
          "id": "q-depapp-7",
          "type": "multiple_choice",
          "title": "L''approche peut-elle accepter les plans de vol ?",
          "description": "",
          "required": true,
          "options": ["Oui", "Non", "Oui, uniquement les IFR", "Oui, en l''absence de delivery"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Non"]
        },
        {
          "id": "q-depapp-8",
          "type": "multiple_choice",
          "title": "À quel moment le départ reçoit-il un vol ?",
          "description": "",
          "required": true,
          "options": ["Au décollage automatiquement", "Quand le vol le contacte", "Après autorisation de la tour", "Quand le center le transfère"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Quand le vol le contacte"]
        },
        {
          "id": "q-depapp-9",
          "type": "multiple_choice",
          "title": "Quelle est la distance de sécurité à respecter en approche entre 2 aéronefs ?",
          "description": "",
          "required": true,
          "options": ["1 nautique", "2 nautiques", "3 nautiques", "5 nautiques"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["2 nautiques"]
        },
        {
          "id": "q-depapp-10",
          "type": "multiple_choice",
          "title": "Quel avion a la priorité à l''arrivée ?",
          "description": "",
          "required": true,
          "options": ["Un avion IFR en approche", "Un avion commercial gros porteur", "Un avion transpondant 7700", "Le premier arrivé sur la fréquence"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Un avion transpondant 7700"]
        }
      ]
    },
    {
      "id": "sec-ground",
      "title": "LE GROUND",
      "description": "Questions relatives à la position Ground (sol).",
      "questions": [
        {
          "id": "q-ground-1",
          "type": "multiple_choice",
          "title": "Un avion souhaitant rouler à une station de ravitaillement devra-t-il contacter le sol ?",
          "description": "",
          "required": true,
          "options": ["Non, ce n''est pas nécessaire", "Oui, dans tous les cas", "Oui si le sol est en ligne", "Uniquement s''il est en IFR"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Oui si le sol est en ligne"]
        },
        {
          "id": "q-ground-2",
          "type": "multiple_choice",
          "title": "Pour un avion commercial, quel parking lui sera le plus adapté ?",
          "description": "",
          "required": true,
          "options": ["Un stand éloigné", "Une aire de stationnement générale", "Une porte", "Un taxiway dédié"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Une porte"]
        },
        {
          "id": "q-ground-3",
          "type": "multiple_choice",
          "title": "Quelle est la mission principale du contrôleur sol ?",
          "description": "",
          "required": true,
          "options": ["Autoriser les décollages et atterrissages", "Gérer la circulation aérienne au sol", "Délivrer les clairances de départ", "Coordonner les plans de vol avec le center"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Gérer la circulation aérienne au sol"]
        },
        {
          "id": "q-ground-4",
          "type": "multiple_choice",
          "title": "Quelle est la règle de priorité sur les taxiways ?",
          "description": "",
          "required": true,
          "options": ["Premier arrivé, premier servi", "Le plus gros avion est prioritaire", "Un avion sortant de la piste est prioritaire", "Un avion en repoussage est prioritaire"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Un avion sortant de la piste est prioritaire"]
        },
        {
          "id": "q-ground-5",
          "type": "multiple_choice",
          "title": "Que doit faire le contrôleur si de l''huile a été signalée sur un taxiway ?",
          "description": "",
          "required": true,
          "options": ["Fermer le taxiway et attendre les instructions", "Signaler aux pompiers", "Prévenir la tour uniquement", "Dérouter le trafic sol et ne rien signaler"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Signaler aux pompiers"]
        },
        {
          "id": "q-ground-6",
          "type": "multiple_choice",
          "title": "Quel est l''indicatif d''un camion de pompier à la radio ?",
          "description": "",
          "required": true,
          "options": ["Rescue 1", "Pompier 1", "Fire truck 1", "Emergency 1"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Fire truck 1"]
        },
        {
          "id": "q-ground-7",
          "type": "multiple_choice",
          "title": "Si un pilote annonce prêt au roulage, mais n''a pas de clairance active, que fait le contrôleur ?",
          "description": "",
          "required": true,
          "options": ["Il l''autorise au roulage quand même", "Il le transfère au delivery", "Il lui demande de copier la clairance", "Il lui demande d''attendre en position"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Il lui demande de copier la clairance"]
        },
        {
          "id": "q-ground-8",
          "type": "multiple_choice",
          "title": "Comment donne-t-on un ordre retardé ?",
          "description": "",
          "required": true,
          "options": [
            "Attendez mon prochain appel pour repousser",
            "Repoussez immédiatement et maintenez",
            "En fonction d''un avion qui passe, repoussez et attendez",
            "Maintenez position, je vous rappelle"
          ],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["En fonction d''un avion qui passe, repoussez et attendez"]
        },
        {
          "id": "q-ground-9",
          "type": "multiple_choice",
          "title": "Quel est le numéro des AFIS local ?",
          "description": "",
          "required": true,
          "options": ["404", "505", "606", "707"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["505"]
        },
        {
          "id": "q-ground-10",
          "type": "multiple_choice",
          "title": "Quelle est la vitesse maximale de roulage ? (en nœuds)",
          "description": "",
          "required": true,
          "options": ["20", "25", "30", "40"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["30"]
        }
      ]
    },
    {
      "id": "sec-center",
      "title": "LE CENTER",
      "description": "Questions relatives à la position Center (en-route).",
      "questions": [
        {
          "id": "q-center-1",
          "type": "multiple_choice",
          "title": "Quel est le code transpondeur pour signaler une urgence ?",
          "description": "",
          "required": true,
          "options": ["7500", "7600", "7700", "7000"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["7700"]
        },
        {
          "id": "q-center-2",
          "type": "multiple_choice",
          "title": "Un avion qui fait route vers le 250, quelle altitude est judicieux de lui donner pour sa croisière ?",
          "description": "",
          "required": true,
          "options": ["FL250", "FL240", "FL260", "FL230"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["FL240"]
        },
        {
          "id": "q-center-3",
          "type": "multiple_choice",
          "title": "Le center contrôle-t-il aussi les autres positions subordonnées à lui ?",
          "description": "",
          "required": true,
          "options": ["Non", "Oui", "Uniquement en cas d''urgence", "Seulement si elles ne sont pas en ligne"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Oui"]
        },
        {
          "id": "q-center-4",
          "type": "multiple_choice",
          "title": "Quand le center transfère-t-il un vol à une approche ?",
          "description": "",
          "required": true,
          "options": ["En croisière", "Pendant la descente", "Après l''atterrissage", "Avant le décollage"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Pendant la descente"]
        },
        {
          "id": "q-center-5",
          "type": "multiple_choice",
          "title": "Comment s''appellent les couloirs aériens utilisés par les avions ?",
          "description": "",
          "required": true,
          "options": ["Airways", "Jet routes", "Air roads", "Air corridors"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Air roads"]
        },
        {
          "id": "q-center-6",
          "type": "multiple_choice",
          "title": "De combien de pieds doivent être séparés des avions verticalement ?",
          "description": "",
          "required": true,
          "options": ["500", "1000", "2000", "3000"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["1000"]
        },
        {
          "id": "q-center-7",
          "type": "multiple_choice",
          "title": "C''est quoi un handover ?",
          "description": "",
          "required": true,
          "options": ["Un changement de fréquence", "Un transfert de responsabilité", "Une autorisation de descente", "Un signal radar perdu"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Un transfert de responsabilité"]
        },
        {
          "id": "q-center-8",
          "type": "multiple_choice",
          "title": "Pour qu''un contrôleur puisse voir l''altitude et la vitesse d''un avion, quel mode transpondeur doit être utilisé ?",
          "description": "",
          "required": true,
          "options": ["A", "B", "C", "S"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["C"]
        },
        {
          "id": "q-center-9",
          "type": "multiple_choice",
          "title": "Quelle est la pression atmosphérique utilisée après le passage de l''altitude de transition ?",
          "description": "",
          "required": true,
          "options": ["1010", "1012", "1013", "1015"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["1012"]
        },
        {
          "id": "q-center-10",
          "type": "multiple_choice",
          "title": "Peut-on laisser des avions au niveau de l''altitude de transition ?",
          "description": "",
          "required": true,
          "options": ["Oui", "Non", "Oui, temporairement", "Uniquement en montée"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Non"]
        }
      ]
    },
    {
      "id": "sec-clairance",
      "title": "LA CLAIRANCE",
      "description": "Questions relatives à la clairance.",
      "questions": [
        {
          "id": "q-clairance-1",
          "type": "multiple_choice",
          "title": "Que signifie \"read back\" ?",
          "description": "",
          "required": true,
          "options": ["Confirmation", "Relecture", "Accusé de réception", "Répétition d''urgence"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Relecture"]
        },
        {
          "id": "q-clairance-2",
          "type": "multiple_choice",
          "title": "Pourquoi serait-on amené à limiter une clairance ?",
          "description": "",
          "required": true,
          "options": ["En cas de mauvaise météo uniquement", "En cas de trafic trop élevé", "Quand le pilote le demande", "En cas de panne radar"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["En cas de trafic trop élevé"]
        },
        {
          "id": "q-clairance-3",
          "type": "multiple_choice",
          "title": "De quoi est composée une clairance ?",
          "description": "",
          "required": true,
          "options": ["Piste, SID, vitesse initiale", "Destination, transpondeur, altitude initial", "Route, fréquence, QNH", "Callsign, cap de départ, niveau de vol"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Destination, transpondeur, altitude initial"]
        },
        {
          "id": "q-clairance-4",
          "type": "multiple_choice",
          "title": "Quel élément de clairance ne doit jamais être oublié ?",
          "description": "",
          "required": true,
          "options": ["Le code transpondeur", "La piste en service", "L''altitude assignée", "La fréquence suivante"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["L''altitude assignée"]
        },
        {
          "id": "q-clairance-5",
          "type": "multiple_choice",
          "title": "À quoi sert le code transpondeur ?",
          "description": "",
          "required": true,
          "options": ["Identifier la position radar", "Communiquer avec la tour", "Statut du vol", "Mesurer la vitesse de l''avion"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Statut du vol"]
        },
        {
          "id": "q-clairance-6",
          "type": "multiple_choice",
          "title": "Une clairance de départ autorise-t-elle au décollage ?",
          "description": "",
          "required": true,
          "options": ["Oui", "Non", "Oui, si la piste est libre", "Oui, après le roulage complet"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Non"]
        },
        {
          "id": "q-clairance-7",
          "type": "multiple_choice",
          "title": "Que signifie \"break break\" ?",
          "description": "",
          "required": true,
          "options": ["Urgence en cours", "Ne me collationnez pas", "Fin de communication", "Changez de fréquence immédiatement"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Ne me collationnez pas"]
        },
        {
          "id": "q-clairance-8",
          "type": "multiple_choice",
          "title": "\"Autorisé selon votre plan de vol\" — les SID et STAR utilisés seront lesquels ?",
          "description": "",
          "required": true,
          "options": [
            "Ceux choisis par le contrôleur en fonction du trafic",
            "Les SID/STAR par défaut de l''aéroport",
            "Ceux mentionnés dans le dépôt de plan de vol",
            "Ceux communiqués par la tour au moment du décollage"
          ],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Ceux mentionnés dans le dépôt de plan de vol"]
        },
        {
          "id": "q-clairance-9",
          "type": "multiple_choice",
          "title": "Le pilote peut-il repousser son avion avant de demander une clairance ?",
          "description": "",
          "required": true,
          "options": ["Oui", "Non", "Oui, avec l''accord du sol", "Oui, si le parking est encombré"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Non"]
        },
        {
          "id": "q-clairance-10",
          "type": "multiple_choice",
          "title": "Si le pilote répond de façon incompréhensible, que faites-vous ?",
          "description": "",
          "required": true,
          "options": ["Ignorer et passer au trafic suivant", "Lui demander de répéter", "Le transférer à un autre contrôleur", "Lui envoyer la clairance par texte"],
          "is_graded": true,
          "points": 1,
          "correct_answers": ["Lui demander de répéter"]
        }
      ]
    },
    {
      "id": "sec-message-staff",
      "title": "ET VOILÀ !",
      "description": "Vous avez terminé le Grand Test ATC. Merci pour votre participation !",
      "questions": [
        {
          "id": "q-message-staff",
          "type": "paragraph",
          "title": "Un message pour le staff ?",
          "description": "",
          "required": false,
          "options": [],
          "is_graded": false,
          "points": 0,
          "correct_answers": []
        }
      ]
    }
  ]'::jsonb
)
ON CONFLICT DO NOTHING;
