import type { DocChunk } from '@/lib/support/doc-index';
import { OFFICIAL_SITE_URL } from '@/lib/site-url';

/** Procédures vérifiées dans les pages et API citées ; pas de données de compte en cache. */
const ENTRIES = [
  // logbook/depot-plan-vol/DepotPlanVolForm.tsx et api/plans-vol/route.ts
  ['depot', 'Déposer un plan de vol, vol personnel ou compagnie', '/logbook/depot-plan-vol',
    'Dans le logbook, ouvrir « Déposer un plan ». Choisir le type de mission et l’appareil, puis les aéroports, numéro et type de vol et intentions. Pour un vol personnel : « Mon appareil personnel » ; acheter un appareil via Marketplace si nécessaire. Pour la compagnie : « Appareil de la flotte ». Un appareil engagé dans un autre vol, détruit, bloqué par incident, en maintenance, réparation ou transfert peut empêcher le dépôt. Lire le message exact avant de conclure. Le bot ne dépose ni ne valide le plan.'],
  // logbook/plans-vol/PlanVolCopiloteActions.tsx et api/plans-vol/[id]/route.ts
  ['copilote', 'Copilote : valider ou refuser un plan en attente', '/logbook/plans-vol',
    '« Vol avec copilote » exige un copilote disponible de la même compagnie ; ce mode ne concerne pas les vols militaires. Le plan reste « En attente copilote » tant que le copilote désigné ne clique pas « Valider » dans « Mes plans de vol ». Le pilote ne peut pas valider à sa place. « Refuser » annule le plan après confirmation. La validation du copilote précède l’envoi à l’ATC ou la confirmation sans ATC. Attendre le copilote ne signifie pas attendre un contrôleur.'],
  // logbook/plans-vol/page.tsx et [id]/modifier/ModifierPlanVolForm.tsx
  ['suivi', 'Suivre un plan refusé, accepté ou en attente ATC', '/logbook/plans-vol',
    '« Mes plans de vol » présente le statut du plan et le motif d’un refus. « En attente ATC » attend le contrôleur ; « En attente copilote » attend le copilote. Seul un plan « Refusé » peut être modifié puis renvoyé depuis le lien de modification du plan. Lire le motif et corriger les champs concernés ; le bot ne promet aucune acceptation. Sans ATC, le plan peut être accepté automatiquement ; cela ne signifie pas que le vol est terminé. « Clôture demandée » et « Clôturé » sont distincts.'],
  // inventaire/page.tsx et api/plans-vol/route.ts
  ['inventaire', 'Inventaire, acheter un avion, appareil indisponible ou en réparation', '/inventaire',
    '« Mon inventaire » liste les appareils personnels avec les compteurs Disponibles et En vol. « Acheter des avions » mène à /marketplace. Un appareil de compagnie est distinct de l’inventaire personnel. Pour un dépôt bloqué : vérifier le message affiché, le vol qui occupe l’avion et une éventuelle réparation ou un transfert. Même une réparation terminée, facturée ou payée peut bloquer tant que l’entreprise de réparation n’a pas libéré l’avion. Un blocage après incident attend un examen staff ; ne conseiller aucun contournement. Un aperçu de trois avions ne prouve pas l’absence d’un quatrième.'],
  // felitz-bank/FelitzBankClient.tsx
  ['felitz', 'Felitz Bank : virement, VBAN, montant et libellé', '/felitz-bank',
    'Dans Felitz Bank, onglet « Virements », formulaire « Effectuer un virement » : renseigner « VBAN destinataire », « Montant (F$) », puis le libellé et « Confirmer le virement ». Le libellé est obligatoire à partir de 1 000 000 F$. Consulter l’historique des virements avant de réessayer après une erreur pour éviter un doublon. Le bot explique la procédure ; il ne transfère, n’annule et ne rembourse rien, et n’a pas accès aux soldes ni aux transactions dans son dossier. Une demande de correction d’un débit doit passer à un administrateur. Une simple question sur la procédure ne nécessite pas d’alerte.'],
  // notams/NotamsClient.tsx et api/notams/route.ts
  ['notams', 'NOTAMs PTFS : aéroport, dates, permanents et version française', '/notams',
    'Les NOTAMs du site sont fictifs pour PTFS. Filtrer par code d’aéroport du jeu (IRFD, ITKO, etc.). Un NOTAM annulé ou expiré ne s’applique plus ; un permanent ne commence qu’à sa date de début. Conserver les unités : les distances en M sont des mètres, FT des pieds. « Version française » référence le code du NOTAM traduit ; un NOTAM déjà français laisse ce champ vide. La consultation exige un compte connecté ; la gestion est réservée aux admins ou aux agents IFSA. Pour connaître les restrictions actuelles, utiliser seulement l’instantané fourni, avec ses dates et horaires, et signaler s’il n’est pas exhaustif.'],
  // api/calendrier/route.ts ; calendrier/page.tsx
  ['calendrier', 'Calendrier, événements et horaires UTC', '/calendrier',
    'Le calendrier public est /calendrier ; dans l’app connectée il se trouve sous /app/calendrier. Les événements affichent des horaires UTC, avec heure locale entre parenthèses. Seuls les administrateurs du site peuvent créer un événement. Ne jamais inventer une séance, une date ou une place disponible : utiliser les événements effectivement présents dans l’instantané. Le calendrier ne constitue pas une réservation de training.'],
  // compte/page.tsx ; support/site-procedures.ts
  ['compte', 'Mon compte : e-mail, Discord, identifiant et connexions', '/compte',
    'Pour un compte existant et accessible, « Mon compte » → « Identité & connexions » permet de gérer l’e-mail et la liaison Discord. Une liaison active permet à l’assistance de consulter le dossier du demandeur. Le membre ne change pas lui-même son identifiant ; un administrateur le modifie dans Admin → Pilotes → fiche du pilote. Si la connexion est impossible, aider depuis /login : ne pas exiger l’accès à Mon compte et ne demander aucun code e-mail ou mot de passe pour diagnostiquer.'],
] as const;

export const SITE_KNOWLEDGE_CHUNKS: DocChunk[] = ENTRIES.map(([id, title, path, text]) => ({
  id: `site-${id}`, source: 'Démarches du site', title,
  link: new URL(path, OFFICIAL_SITE_URL).href, text,
}));

/** Empêche « ATC » dans un problème de plan d'écarter toute la documentation du site. */
export function isSiteWorkflowTopic(text: string): boolean {
  const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /\b(plans? de vol|copilote|inventaire|marketplace|felitz|vban|virement|notams?|calendrier|evenement|reparation|maintenance)\b/.test(t);
}
