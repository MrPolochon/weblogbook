import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins.' }, { status: 403 });

    const body = await request.json();
    const { nom, ordre: ordreBody, move } = body;

    const { data: me } = await supabase.from('atc_grades').select('id, ordre').eq('id', id).single();
    if (!me) return NextResponse.json({ error: 'Grade introuvable.' }, { status: 404 });

    if (move === 'up' || move === 'down') {
      const q = supabase.from('atc_grades').select('id, ordre');
      const { data: other } = move === 'up'
        ? await q.lt('ordre', me.ordre).order('ordre', { ascending: false }).limit(1).maybeSingle()
        : await q.gt('ordre', me.ordre).order('ordre', { ascending: true }).limit(1).maybeSingle();
      if (!other) return NextResponse.json({ error: move === 'up' ? 'Déjà au rang le plus bas.' : 'Déjà au rang le plus élevé.' }, { status: 400 });
      const { error: e1 } = await supabase.from('atc_grades').update({ ordre: other.ordre }).eq('id', id);
      if (e1) return NextResponse.json({ error: e1.message }, { status: 400 });
      const { error: e2 } = await supabase.from('atc_grades').update({ ordre: me.ordre }).eq('id', other.id);
      if (e2) return NextResponse.json({ error: e2.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    const updates: { nom?: string; ordre?: number } = {};
    if (nom != null && typeof nom === 'string') {
      const n = String(nom).trim();
      if (!n) return NextResponse.json({ error: 'Nom non vide requis.' }, { status: 400 });
      updates.nom = n;
    }
    if (ordreBody != null && typeof ordreBody === 'number' && ordreBody >= 1) {
      updates.ordre = Math.floor(ordreBody);
    }
    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Rien à modifier.' }, { status: 400 });

    const { error } = await supabase.from('atc_grades').update(updates).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('ATC grades PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins.' }, { status: 403 });

    const { error } = await supabase.from('atc_grades').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('ATC grades DELETE:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
