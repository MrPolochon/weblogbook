import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  canAccessInstructionManagerTools,
  getInstructionCapabilities,
} from '@/lib/instruction-permissions';

function canBecomeInstructionStudent(role: string | null | undefined): boolean {
  return role != null && role !== 'admin';
}

/**
 * Comptes pouvant être rattachés à la formation de l’instructeur connecté
 * (mêmes règles que POST /api/instruction/eleves link_existing).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
    const cap = await getInstructionCapabilities(admin, user.id, me?.role);
    if (!canAccessInstructionManagerTools(cap)) {
      return NextResponse.json(
        { error: 'Réservé aux instructeurs (FI) ou formateurs ATC (ATC FI / ATC FE).' },
        { status: 403 },
      );
    }

    const { data: rows, error } = await admin
      .from('profiles')
      .select('id, identifiant, role, instructeur_referent_id, formation_instruction_active')
      .neq('id', user.id)
      .not('role', 'is', null)
      .neq('role', 'admin')
      .order('identifiant', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const candidates = (rows || []).filter((p) => {
      if (!canBecomeInstructionStudent(p.role)) return false;
      if (p.formation_instruction_active && p.instructeur_referent_id && p.instructeur_referent_id !== user.id) {
        return false;
      }
      if (p.formation_instruction_active && p.instructeur_referent_id === user.id) {
        return false;
      }
      return true;
    });

    return NextResponse.json({
      candidates: candidates.map((c) => ({ id: c.id, identifiant: c.identifiant })),
    });
  } catch (e) {
    console.error('GET instruction/eleves/rattach-candidates:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
