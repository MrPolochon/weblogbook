export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadAeroSchoolRespondentProfiles } from '@/lib/aeroschool-respondent-profiles';
import { NextResponse } from 'next/server';

// GET — liste des réponses pour un formulaire (admin)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('aeroschool_responses')
      .select('*')
      .eq('form_id', id)
      .order('submitted_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = data || [];
    const userIds = rows.map((r) => r.user_id as string | null).filter(Boolean) as string[];
    const profilesByUserId = await loadAeroSchoolRespondentProfiles(admin, userIds);

    const enriched = rows.map((row) => {
      const uid = row.user_id as string | null;
      if (!uid) return row;
      const profile = profilesByUserId.get(uid);
      if (!profile) return row;
      return { ...row, respondent_profile: profile };
    });

    return NextResponse.json(enriched);
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
