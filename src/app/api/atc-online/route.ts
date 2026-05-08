import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

const ORDRE_DEPART = ['Delivery', 'Clairance', 'Ground', 'Tower', 'DEP', 'APP', 'Center'] as const;

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const aeroport = searchParams.get('aeroport')?.trim().toUpperCase();
    if (!aeroport) return NextResponse.json({ error: 'Paramètre aeroport requis' }, { status: 400 });

    const admin = createAdminClient();

    const { data: sessions } = await admin
      .from('atc_sessions')
      .select('user_id, position')
      .eq('aeroport', aeroport);

    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ aeroport, online: false, position: null, controllers: [] });
    }

    const userIds = Array.from(new Set(sessions.map(s => s.user_id)));
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, identifiant')
      .in('id', userIds);

    const profileMap = new Map((profiles ?? []).map(p => [p.id, p.identifiant]));

    let topPosition: string | null = null;
    for (const pos of ORDRE_DEPART) {
      if (sessions.some(s => s.position === pos)) {
        topPosition = pos;
        break;
      }
    }

    const controllers = sessions.map(s => ({
      user_id: s.user_id,
      position: s.position,
      identifiant: profileMap.get(s.user_id) ?? null,
    }));

    return NextResponse.json({
      aeroport,
      online: true,
      position: topPosition,
      controllers,
    });
  } catch (e) {
    console.error('atc-online:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
