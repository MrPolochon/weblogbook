export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity, getClientIp } from '@/lib/activity-log';
import { listProfilesEligibleAsFormationReferent } from '@/lib/instruction-permissions';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }) };
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role, identifiant').eq('id', user.id).single();
  if (me?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 }) };
  }
  return { user, me, admin };
}

/** Liste tous les liens élève ↔ référent d'assignation. */
export async function GET() {
  try {
    const ctx = await requireAdmin();
    if ('error' in ctx) return ctx.error;

    const { admin } = ctx;
    const { data: rows, error } = await admin
      .from('instruction_eleve_referent')
      .select(
        'eleve_id, instructeur_id, created_at, updated_at, eleve:profiles!instruction_eleve_referent_eleve_id_fkey(identifiant, formation_instruction_licence), instructeur:profiles!instruction_eleve_referent_instructeur_id_fkey(identifiant)',
      )
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ referents: rows || [] });
  } catch (e) {
    console.error('admin/instruction-referents GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * Réassigner ou créer un lien référent (admin).
 * Body: { eleve_id, instructeur_id }
 */
export async function PATCH(request: Request) {
  try {
    const ctx = await requireAdmin();
    if ('error' in ctx) return ctx.error;

    const { user, me, admin } = ctx;
    const body = await request.json();
    const eleveId = String(body.eleve_id || '').trim();
    const instructeurId = String(body.instructeur_id || '').trim();
    if (!eleveId || !instructeurId) {
      return NextResponse.json({ error: 'eleve_id et instructeur_id requis.' }, { status: 400 });
    }
    if (eleveId === instructeurId) {
      return NextResponse.json({ error: 'Un élève ne peut pas être son propre référent.' }, { status: 400 });
    }

    const { data: eleve } = await admin
      .from('profiles')
      .select('id, identifiant, formation_instruction_licence')
      .eq('id', eleveId)
      .maybeSingle();
    if (!eleve) return NextResponse.json({ error: 'Élève introuvable.' }, { status: 404 });

    const licence = (eleve.formation_instruction_licence as string | null) || 'PPL';
    const eligible = await listProfilesEligibleAsFormationReferent(admin, licence);
    if (!eligible.some((p) => p.id === instructeurId)) {
      return NextResponse.json(
        { error: 'Instructeur non éligible pour le parcours de cet élève.' },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const { error: upsErr } = await admin.from('instruction_eleve_referent').upsert(
      {
        eleve_id: eleveId,
        instructeur_id: instructeurId,
        updated_at: now,
      },
      { onConflict: 'eleve_id' },
    );
    if (upsErr) return NextResponse.json({ error: upsErr.message }, { status: 400 });

    logActivity({
      userId: user.id,
      userIdentifiant: me?.identifiant,
      action: 'admin_reassign_assignment_referent',
      targetType: 'profile',
      targetId: eleveId,
      details: { instructeur_id: instructeurId },
      ip: getClientIp(request),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('admin/instruction-referents PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/** Supprimer le lien référent d'un élève (admin). Body ou query: eleve_id */
export async function DELETE(request: Request) {
  try {
    const ctx = await requireAdmin();
    if ('error' in ctx) return ctx.error;

    const { user, me, admin } = ctx;
    const url = new URL(request.url);
    let eleveId = url.searchParams.get('eleve_id');
    if (!eleveId) {
      const body = await request.json().catch(() => ({}));
      eleveId = body.eleve_id ? String(body.eleve_id) : null;
    }
    eleveId = String(eleveId || '').trim();
    if (!eleveId) {
      return NextResponse.json({ error: 'eleve_id requis.' }, { status: 400 });
    }

    const { data: row } = await admin
      .from('instruction_eleve_referent')
      .select('eleve_id')
      .eq('eleve_id', eleveId)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: 'Lien référent introuvable.' }, { status: 404 });

    const { error: delErr } = await admin
      .from('instruction_eleve_referent')
      .delete()
      .eq('eleve_id', eleveId);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

    logActivity({
      userId: user.id,
      userIdentifiant: me?.identifiant,
      action: 'admin_remove_assignment_referent',
      targetType: 'profile',
      targetId: eleveId,
      ip: getClientIp(request),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('admin/instruction-referents DELETE:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/** Candidats instructeurs pour réassignation admin (par élève). */
export async function POST(request: Request) {
  try {
    const ctx = await requireAdmin();
    if ('error' in ctx) return ctx.error;

    const { admin } = ctx;
    const body = await request.json();
    const eleveId = String(body.eleve_id || '').trim();
    if (!eleveId) {
      return NextResponse.json({ error: 'eleve_id requis.' }, { status: 400 });
    }

    const { data: eleve } = await admin
      .from('profiles')
      .select('formation_instruction_licence')
      .eq('id', eleveId)
      .maybeSingle();
    if (!eleve) return NextResponse.json({ error: 'Élève introuvable.' }, { status: 404 });

    const licence = (eleve.formation_instruction_licence as string | null) || 'PPL';
    const candidates = await listProfilesEligibleAsFormationReferent(admin, licence);
    return NextResponse.json({ candidates });
  } catch (e) {
    console.error('admin/instruction-referents POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
