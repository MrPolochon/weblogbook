import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role, ifsa').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';
    const isIfsa = Boolean(profile?.ifsa);
    if (!isAdmin && !isIfsa) return NextResponse.json({ error: 'Acces admin/IFSA requis.' }, { status: 403 });

    const admin = createAdminClient();
    const { data, error } = await admin.from('incidents_vol')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
