import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';
import { logActivity, getClientIp } from '@/lib/activity-log';

// GET - Récupérer les messages de l'utilisateur
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type'); // 'received', 'sent', 'cheques'
    const nonLuSeulement = searchParams.get('non_lu') === 'true';

    const admin = createAdminClient();
    
    let query;
    if (type === 'sent') {
      query = admin.from('messages')
        .select('*, destinataire:profiles!destinataire_id(identifiant)')
        .eq('expediteur_id', user.id);
    } else if (type === 'cheques') {
      query = admin.from('messages')
        .select('*, expediteur:profiles!expediteur_id(identifiant)')
        .eq('destinataire_id', user.id)
        .in('type_message', ['cheque_salaire', 'cheque_revenu_compagnie', 'cheque_taxes_atc', 'cheque_siavi_intervention', 'cheque_siavi_taxes']);
    } else {
      query = admin.from('messages')
        .select('*, expediteur:profiles!expediteur_id(identifiant)')
        .eq('destinataire_id', user.id);
    }

    if (nonLuSeulement) {
      query = query.eq('lu', false);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) return NextResponse.json({ error: 'Erreur lors du chargement' }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    console.error('Messages GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// Audiences valides pour un broadcast admin
const BROADCAST_AUDIENCES = ['pilotes', 'atc', 'siavi', 'ifsa', 'admins', 'all'] as const;
type BroadcastAudience = typeof BROADCAST_AUDIENCES[number];

const AUDIENCE_LABELS: Record<BroadcastAudience, string> = {
  pilotes: 'tous les pilotes',
  atc: 'tous les contrôleurs ATC',
  siavi: 'tous les agents SIAVI',
  ifsa: 'tous les inspecteurs IFSA',
  admins: 'tous les administrateurs',
  all: 'tous les utilisateurs',
};

type ProfileRow = {
  id: string;
  role: string | null;
  atc: boolean | null;
  siavi: boolean | null;
  ifsa: boolean | null;
};

/**
 * Retourne la liste des IDs de profils correspondant à une audience broadcast.
 * Les admins sont TOUJOURS ajoutés à la liste (en plus de l'audience choisie),
 * car ils doivent recevoir les messages généraux envoyés par d'autres admins.
 * L'expéditeur est exclu de la liste pour éviter l'auto-envoi.
 */
async function resolveBroadcastRecipients(
  admin: ReturnType<typeof createAdminClient>,
  audience: BroadcastAudience,
  expediteurId: string
): Promise<string[]> {
  const { data: allProfiles } = await admin.from('profiles')
    .select('id, role, atc, siavi, ifsa');
  const rows = (allProfiles || []) as ProfileRow[];

  const matchPilote = (p: ProfileRow) =>
    p.role === 'pilote' ||
    (p.role !== 'atc' && p.role !== 'siavi' && p.role !== 'ifsa' && p.role !== 'admin');
  const matchAtc = (p: ProfileRow) => p.role === 'atc' || Boolean(p.atc);
  const matchSiavi = (p: ProfileRow) => p.role === 'siavi' || Boolean(p.siavi);
  const matchIfsa = (p: ProfileRow) => p.role === 'ifsa' || Boolean(p.ifsa);
  const matchAdmin = (p: ProfileRow) => p.role === 'admin';

  const destinataires = new Set<string>();

  for (const p of rows) {
    if (!p.id || p.id === expediteurId) continue;
    let inAudience = false;
    switch (audience) {
      case 'pilotes': inAudience = matchPilote(p); break;
      case 'atc': inAudience = matchAtc(p); break;
      case 'siavi': inAudience = matchSiavi(p); break;
      case 'ifsa': inAudience = matchIfsa(p); break;
      case 'admins': inAudience = matchAdmin(p); break;
      case 'all': inAudience = true; break;
    }
    // Les admins reçoivent toujours les broadcasts (même si l'audience ne les cible pas)
    if (inAudience || matchAdmin(p)) {
      destinataires.add(p.id);
    }
  }

  return Array.from(destinataires);
}

// POST - Envoyer un message individuel OU un broadcast admin
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await req.json();
    const { destinataire_id, broadcast_audience, titre, contenu } = body;

    // -- Validations communes --
    if (!titre || !contenu) {
      return NextResponse.json({ error: 'Titre et contenu requis' }, { status: 400 });
    }
    if (typeof titre !== 'string' || titre.length > 200) {
      return NextResponse.json({ error: 'Le titre ne doit pas dépasser 200 caractères' }, { status: 400 });
    }
    if (typeof contenu !== 'string' || contenu.length > 10_000) {
      return NextResponse.json({ error: 'Le contenu ne doit pas dépasser 10 000 caractères' }, { status: 400 });
    }

    const admin = createAdminClient();

    // -- Mode broadcast (admin uniquement) --
    if (broadcast_audience) {
      if (!BROADCAST_AUDIENCES.includes(broadcast_audience as BroadcastAudience)) {
        return NextResponse.json({ error: 'Audience de diffusion invalide.' }, { status: 400 });
      }
      const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') {
        return NextResponse.json({ error: 'Seul un administrateur peut envoyer un message de diffusion.' }, { status: 403 });
      }

      const audience = broadcast_audience as BroadcastAudience;
      const destinataireIds = await resolveBroadcastRecipients(admin, audience, user.id);
      if (destinataireIds.length === 0) {
        return NextResponse.json({ error: 'Aucun destinataire trouvé pour cette audience.' }, { status: 400 });
      }

      // Identifiant partagé de campagne pour regrouper les messages ensuite
      const broadcastId = crypto.randomUUID();
      const audienceLabel = AUDIENCE_LABELS[audience];
      const titrePrefixe = `[Diffusion — ${audienceLabel}] ${titre}`;

      const rows = destinataireIds.map((destId) => ({
        expediteur_id: user.id,
        destinataire_id: destId,
        titre: titrePrefixe.slice(0, 200),
        contenu,
        type_message: 'broadcast',
        metadata: { broadcast_id: broadcastId, broadcast_audience: audience },
      }));

      const { error } = await admin.from('messages').insert(rows);
      if (error) {
        console.error('Broadcast insert error:', error);
        return NextResponse.json({ error: 'Erreur lors de la diffusion' }, { status: 400 });
      }

      logActivity({
        userId: user.id,
        action: 'broadcast_message',
        targetType: 'message',
        targetId: broadcastId,
        details: { titre, audience, recipients_count: destinataireIds.length },
        ip: getClientIp(req),
      });
      return NextResponse.json({
        ok: true,
        broadcast_id: broadcastId,
        audience,
        recipients_count: destinataireIds.length,
      });
    }

    // -- Mode message individuel --
    if (!destinataire_id) {
      return NextResponse.json({ error: 'Destinataire requis' }, { status: 400 });
    }

    // Vérifier que le destinataire existe
    const { data: dest } = await admin.from('profiles').select('id').eq('id', destinataire_id).single();
    if (!dest) return NextResponse.json({ error: 'Destinataire introuvable' }, { status: 404 });

    const { data, error } = await admin.from('messages').insert({
      expediteur_id: user.id,
      destinataire_id,
      titre,
      contenu,
      type_message: 'normal',
    }).select().single();

    if (error) return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 400 });
    logActivity({ userId: user.id, action: 'send_message', targetType: 'message', targetId: data.id, details: { titre, destinataire_id }, ip: getClientIp(req) });
    return NextResponse.json({ ok: true, message: data });
  } catch (e) {
    console.error('Messages POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
