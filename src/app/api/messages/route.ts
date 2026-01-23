import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';

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
        .in('type_message', ['cheque_salaire', 'cheque_revenu_compagnie']);
    } else {
      query = admin.from('messages')
        .select('*, expediteur:profiles!expediteur_id(identifiant)')
        .eq('destinataire_id', user.id);
    }

    if (nonLuSeulement) {
      query = query.eq('lu', false);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    console.error('Messages GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST - Envoyer un message
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const body = await req.json();
    const { destinataire_id, titre, contenu } = body;

    if (!destinataire_id || !titre || !contenu) {
      return NextResponse.json({ error: 'Destinataire, titre et contenu requis' }, { status: 400 });
    }

    const admin = createAdminClient();

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

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, message: data });
  } catch (e) {
    console.error('Messages POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
