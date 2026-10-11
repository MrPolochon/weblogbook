import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    const body = await request.json().catch(() => null);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!body || !['compagnie', 'reparation'].includes(body.type) || typeof body.id !== 'string' || !uuid.test(body.id)) {
      return NextResponse.json({ error: 'Organisation invalide' }, { status: 400 });
    }
    const admin = createAdminClient();
    const table = body.type === 'compagnie' ? 'compagnies' : 'entreprises_reparation';
    const { data: organisation, error: readError } = await admin.from(table).select('pdg_id').eq('id', body.id).maybeSingle();
    if (readError) return NextResponse.json({ error: 'Vérification indisponible. Réessayez.' }, { status: 503 });
    if (!organisation || organisation.pdg_id !== user.id) {
      return NextResponse.json({ error: 'Seul le PDG actuel peut transférer la propriété' }, { status: 403 });
    }
    if (body.action === 'verifier') {
      if (typeof body.identifiant !== 'string' || !body.identifiant.trim()) return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 });
      const { data: cible, error } = await admin.from('profiles').select('id, identifiant').eq('identifiant', body.identifiant.trim()).maybeSingle();
      if (error) return NextResponse.json({ error: 'Recherche indisponible' }, { status: 503 });
      if (!cible || cible.id === user.id) return NextResponse.json({ error: 'Choisissez un autre utilisateur existant' }, { status: 400 });
      return NextResponse.json(cible);
    }
    if (body.action !== 'transferer' || typeof body.destinataire !== 'string' || !uuid.test(body.destinataire)
      || body.confirmation1 !== true || body.confirmation2 !== 'oui' || body.confirmation3 !== true) {
      return NextResponse.json({ error: 'Les trois confirmations sont requises' }, { status: 400 });
    }
    const { error } = await supabase.rpc('transferer_propriete', {
      p_type: body.type, p_id: body.id, p_destinataire: body.destinataire,
      p_confirmation_1: body.confirmation1, p_confirmation_2: body.confirmation2, p_confirmation_3: body.confirmation3,
    });
    if (error) {
      console.error('Transfert de propriété:', error);
      return NextResponse.json({ error: 'Transfert impossible. Vérifiez que vous êtes toujours PDG et que la migration de transfert est installée.' }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Transfert de propriété:', error);
    return NextResponse.json({ error: 'Service indisponible. Réessayez.' }, { status: 500 });
  }
}
