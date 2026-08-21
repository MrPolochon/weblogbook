import { OFFICIAL_SITE_URL } from '@/lib/site-url';

/**
 * Démarches du site trop longues pour tenir dans le prompt système à chaque
 * message : elles rejoignent l’index documentaire et sont retrouvées à la demande.
 *
 * Vérifié dans le code :
 * - création de compte : `src/app/api/auth/webregister/route.ts` (aides et exemple
 *   renvoyés au bot Discord, liaison `discord_links`, un seul compte par Discord)
 * - questionnaires publics / membre : colonne `aeroschool_forms.requires_auth`,
 *   rendu dans `src/app/aeroschool/page.tsx` (cadenas + redirection vers /login)
 */
export const SITE_PROCEDURES_IA = `SITE OFFICIEL : ${OFFICIAL_SITE_URL} est la seule adresse autorisée. Ne fabrique, ne complète et ne raccourcis jamais un domaine.
CRÉER UN COMPTE SUR LE SITE : ça ne se fait pas depuis une page du site ni depuis « Mon compte », uniquement depuis Discord, avec la commande slash « /register » du bot ATIS — c’est le seul nom de la commande, n’en propose aucun autre. Il faut être sur le serveur Discord et taper la commande dans un salon où le bot répond, en renseignant deux champs : l’identifiant souhaité (2 à 30 caractères, lettres, chiffres et « _ » ; les espaces deviennent des « _ ») et un mot de passe d’au moins 8 caractères. La commande crée le compte, le relie automatiquement au compte Discord, et il ne reste qu’à se connecter sur la page de connexion avec cet identifiant.
COMPTE DÉJÀ EXISTANT : un seul compte site par compte Discord. Si le Discord est déjà lié, la commande refuse et rappelle l’identifiant existant : il faut se connecter avec celui-là, ou passer par « mot de passe oublié », surtout pas créer un second compte. Si la commande n’apparaît pas dans Discord ou ne répond pas, c’est le bot qui est hors ligne : passe la main au staff. Tu ne crées jamais un compte toi-même.
CONNEXION NORMALE : identifiant + mot de passe, puis selon les conditions un code reçu par e-mail à 6 chiffres ou une passkey (biométrie / QR). Ce code appartient uniquement à la vérification de connexion.
MOT DE PASSE OUBLIÉ : depuis la page de connexion, saisir l’identifiant ou l’e-mail dans « Mot de passe oublié ». L’e-mail contient un LIEN de la forme /login?reset=TOKEN, valable 24 h. Il n’y a jamais de code à 6 chiffres dans ce flux. Ne mélange jamais réinitialisation et vérification de connexion.
COMPTE APRÈS CONNEXION : « Mon compte » → section « Identité & connexions » sert à gérer l’e-mail, la liaison Discord et l’identité d’un compte existant. Ce n’est pas l’endroit où lancer /register et le vrai libellé n’est pas « Paramètres ».
MENUS ET ROUTES : « Déposer un plan » (/logbook/depot-plan-vol) et « Mes plans de vol » sont dans le logbook. Les NOTAMs et le « Manuel contrôleur » (/manuel-controleur) sont dans la rubrique « Infos » du menu Pilote. N’invente jamais « Plans de vol → Nouveau », « ATC → Training », « carte ODW » ni un manuel dans la barre ATC.
NOTAMS : lecture accessible aux pilotes et aux ATC. Création, modification et suppression réservées aux admins ou aux agents IFSA (permission canManageNotams) ; le simple fait d’être personnel ATC ne donne aucun droit de gestion.
DEMANDEUR ADMIN : ne le renvoie pas vaguement « au support ». Pour un compte ou un accès, il peut ouvrir « Admin » → « Pilotes » → fiche du pilote. Pour les comptes, grades et règles d’accès ATC, il peut utiliser « Admin ATC » (/atc/admin). Pour une demande de mot de passe oubliée, il peut consulter « Admin » → « Demandes MDP ». Si la décision exige une seconde validation ou dépasse ces écrans, dis précisément qu’un autre admin doit intervenir.
AEROSCHOOL, PARTIE PUBLIQUE ET PARTIE MEMBRE : le menu AeroSchool est aussi accessible depuis la page de connexion, sans compte. Les questionnaires publics sont jouables par tout le monde ; les questionnaires « membre » affichent un cadenas et renvoient vers la connexion. Quelqu’un sans compte lié ne doit jamais être envoyé vers un questionnaire membre : oriente-le vers un questionnaire public ou vers la création de compte.
DÉMARCHES QUI PASSENT PAR UN QUESTIONNAIRE AEROSCHOOL : recrutement staff, création de compagnie aérienne, entrée à l’IFSA ou au SIAIV, recrutement instructeur de vol, licences et positions ATC, catégories pilote. Avant de répondre à ce type de demande, appuie-toi sur le bloc « Questionnaires AeroSchool » du contexte, qui liste les questionnaires réellement publiés — n’invente jamais un titre.`;
