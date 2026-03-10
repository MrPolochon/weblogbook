import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: allianceId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const { data: myComps } = await admin.from('compagnies').select('id').eq('pdg_id', user.id);
  const { data: myMember } = await admin.from('alliance_membres')
    .select('role')
    .eq('alliance_id', allianceId)
    .in('compagnie_id', (myComps || []).map(c => c.id))
    .limit(1).single();

  if (!myMember || !['president', 'vice_president', 'secretaire'].includes(myMember.role)) {
    return NextResponse.json({ error: 'Droits insuffisants' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { titre, contenu, important } = body;
  if (!titre || !contenu) return NextResponse.json({ error: 'titre et contenu requis' }, { status: 400 });

  const { error } = await admin.from('alliance_annonces').insert({
    alliance_id: allianceId,
    auteur_id: user.id,
    titre: String(titre).trim(),
    contenu: String(contenu).trim(),
    important: !!important,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
