export const dynamic = 'force-dynamic';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAeroSchoolRespondent, requireAeroSchoolRespondent } from '@/lib/aeroschool-auth';
import { createAeroSchoolTestToken } from '@/lib/aeroschool-test-token';
import { NextResponse } from 'next/server';

/** Démarre une session de test et retourne un jeton signé. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const admin = createAdminClient();

    const { data: form, error } = await admin
      .from('aeroschool_forms')
      .select('id, is_published, requires_auth')
      .eq('id', id)
      .single();

    if (error || !form || !form.is_published) {
      return NextResponse.json({ error: 'Formulaire introuvable ou non publié' }, { status: 404 });
    }

    let userId: string | null = null;
    if (form.requires_auth) {
      const auth = await requireAeroSchoolRespondent();
      if (!auth.ok) {
        return NextResponse.json({ error: 'Connexion requise pour ce formulaire' }, { status: 401 });
      }
      userId = auth.profile.userId;
    } else {
      const profile = await getAeroSchoolRespondent();
      userId = profile?.userId ?? null;
    }

    const testToken = createAeroSchoolTestToken(id, userId);
    return NextResponse.json({ test_token: testToken });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
