import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  canAccessInstructionManagerTools,
  canInstructorManageEleveForFormation,
  getInstructionCapabilities,
  listProfilesEligibleAsFormationReferent,
} from '@/lib/instruction-permissions';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: eleveId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
    const cap = await getInstructionCapabilities(admin, user.id, me?.role);
    if (!canAccessInstructionManagerTools(cap)) {
      return NextResponse.json({ error: 'Réservé aux formateurs.' }, { status: 403 });
    }

    const { data: eleve } = await admin
      .from('profiles')
      .select('id, instructeur_referent_id, formation_instruction_active, formation_instruction_licence')
      .eq('id', eleveId)
      .single();
    if (!eleve) return NextResponse.json({ error: 'Élève introuvable.' }, { status: 404 });
    if (eleve.instructeur_referent_id !== user.id && me?.role !== 'admin') {
      return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
    }
    if (!eleve.formation_instruction_active) {
      return NextResponse.json({ candidates: [] });
    }
    if (me?.role !== 'admin' && !canInstructorManageEleveForFormation(cap, eleve.formation_instruction_licence)) {
      return NextResponse.json({ error: 'Non autorisé pour ce parcours.' }, { status: 403 });
    }

    const licenceCode = eleve.formation_instruction_licence || 'PPL';
    const pool = await listProfilesEligibleAsFormationReferent(admin, licenceCode);
    const candidates = pool.filter((p) => p.id !== user.id && p.id !== eleveId);

    return NextResponse.json({ candidates });
  } catch (e) {
    console.error('GET instruction/eleves/[id]/transfer-candidates:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
