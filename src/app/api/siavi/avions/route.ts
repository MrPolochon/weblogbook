import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessSiavi } from '@/lib/siavi/permissions';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const ok = await canAccessSiavi(admin, user.id);
    if (!ok) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const aeroport = req.nextUrl.searchParams.get('aeroport');

    let query = admin.from('siavi_avions')
      .select('*, types_avion:type_avion_id(id, nom, code_oaci, capacite_pax, capacite_cargo_kg)')
      .order('created_at', { ascending: false });

    if (aeroport) {
      query = query.eq('aeroport_actuel', aeroport.toUpperCase());
    }

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data || []);
  } catch (e) {
    console.error('SIAVI avions GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
