export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from '@/lib/activity-log';
import {
  canAccessInstructionManagerTools,
  getInstructionCapabilities,
} from '@/lib/instruction-permissions';

export type ReferentEleveRow = {
  eleve_id: string;
  instructeur_id: string;
  created_at: string;
  updated_at: string;
  eleve: { identifiant: string; formation_instruction_licence: string | null } | null;
};

/** Liste des élèves référents de l'instructeur connecté. */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
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
      .from('instruction_eleve_referent')
      .select(
        'eleve_id, instructeur_id, created_at, updated_at, eleve:profiles!instruction_eleve_referent_eleve_id_fkey(identifiant, formation_instruction_licence)',
      )
      .eq('instructeur_id', user.id)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ referents: rows || [] });
  } catch (e) {
    console.error('instruction/referents GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * Déclarer un élève comme référent d'assignation.
 * Règles : élève rattaché à l'instructeur (formation) ; pas déjà référent d'un autre instructeur.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { data: me } = await admin.from('profiles').select('role, identifiant').eq('id', user.id).single();
    const cap = await getInstructionCapabilities(admin, user.id, me?.role);
    if (!canAccessInstructionManagerTools(cap)) {
      return NextResponse.json(
        { error: 'Réservé aux instructeurs (FI) ou formateurs ATC (ATC FI / ATC FE).' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const eleveId = String(body.eleve_id || '').trim();
    if (!eleveId) {
      return NextResponse.json({ error: 'eleve_id requis.' }, { status: 400 });
    }

    const { data: eleve, error: eleveErr } = await admin
      .from('profiles')
      .select('id, identifiant, instructeur_referent_id, formation_instruction_active')
      .eq('id', eleveId)
      .maybeSingle();
    if (eleveErr) return NextResponse.json({ error: eleveErr.message }, { status: 400 });
    if (!eleve) return NextResponse.json({ error: 'Élève introuvable.' }, { status: 404 });

    if (eleve.instructeur_referent_id !== user.id) {
      return NextResponse.json(
        { error: 'Vous ne pouvez désigner comme référent que vos élèves en formation active.' },
        { status: 403 },
      );
    }

    const { data: existing } = await admin
      .from('instruction_eleve_referent')
      .select('instructeur_id')
      .eq('eleve_id', eleveId)
      .maybeSingle();

    if (existing) {
      if (existing.instructeur_id === user.id) {
        return NextResponse.json({ ok: true, already: true });
      }
      return NextResponse.json(
        { error: 'Cet élève a déjà un instructeur référent d\'assignation. Contactez un administrateur pour réassigner.' },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const { error: insErr } = await admin.from('instruction_eleve_referent').insert({
      eleve_id: eleveId,
      instructeur_id: user.id,
      created_at: now,
      updated_at: now,
    });
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

    logActivity({
      userId: user.id,
      userIdentifiant: me?.identifiant,
      action: 'add_assignment_referent',
      targetType: 'profile',
      targetId: eleveId,
      details: { instructeur_id: user.id, eleve_identifiant: eleve.identifiant },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('instruction/referents POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/** Retirer un élève de la liste référents (instructeur propriétaire uniquement). */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { data: me } = await admin.from('profiles').select('role, identifiant').eq('id', user.id).single();
    const cap = await getInstructionCapabilities(admin, user.id, me?.role);
    if (!canAccessInstructionManagerTools(cap)) {
      return NextResponse.json(
        { error: 'Réservé aux instructeurs (FI) ou formateurs ATC (ATC FI / ATC FE).' },
        { status: 403 },
      );
    }

    const url = new URL(request.url);
    const eleveId = String(url.searchParams.get('eleve_id') || '').trim();
    if (!eleveId) {
      return NextResponse.json({ error: 'eleve_id requis (query).' }, { status: 400 });
    }

    const { data: row } = await admin
      .from('instruction_eleve_referent')
      .select('instructeur_id')
      .eq('eleve_id', eleveId)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: 'Lien référent introuvable.' }, { status: 404 });
    if (row.instructeur_id !== user.id) {
      return NextResponse.json(
        { error: 'Vous ne pouvez retirer que vos propres élèves référents.' },
        { status: 403 },
      );
    }

    const { error: delErr } = await admin
      .from('instruction_eleve_referent')
      .delete()
      .eq('eleve_id', eleveId);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 });

    logActivity({
      userId: user.id,
      userIdentifiant: me?.identifiant,
      action: 'remove_assignment_referent',
      targetType: 'profile',
      targetId: eleveId,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('instruction/referents DELETE:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
