export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { INSTRUCTION_PROGRAMS } from '@/lib/instruction-programs';
import {
  canAccessInstructionManagerTools,
  canInstructorManageEleveForFormation,
  getInstructionCapabilities,
} from '@/lib/instruction-permissions';
import { notifyUser } from '@/lib/notifications';

function isValidModule(licenceCode: string, moduleCode: string): boolean {
  const program = INSTRUCTION_PROGRAMS.find((p) => p.licenceCode === licenceCode);
  if (!program) return false;
  return program.modules.some((m) => m.code === moduleCode);
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
    const cap = await getInstructionCapabilities(admin, user.id, me?.role);
    if (!canAccessInstructionManagerTools(cap)) {
      return NextResponse.json({ error: 'Réservé aux formateurs (FI / ATC FI / …).' }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const eleveId = String(body.eleve_id || '');
    const licenceCode = String(body.licence_code || '');
    const moduleCode = String(body.module_code || '');
    // Si la clé 'completed' n'est pas dans le body, on conservera la valeur existante
    // (un PATCH partiel sur la note ne doit pas décocher le module).
    const hasCompletedKey = Object.prototype.hasOwnProperty.call(body, 'completed');
    if (hasCompletedKey && typeof body.completed !== 'boolean') {
      return NextResponse.json({ error: 'completed doit être un booléen.' }, { status: 400 });
    }
    if (!hasCompletedKey && !Object.prototype.hasOwnProperty.call(body, 'note')) {
      return NextResponse.json({ error: 'Indiquez un module à valider ou une note à modifier.' }, { status: 400 });
    }
    if (Object.prototype.hasOwnProperty.call(body, 'note') && body.note !== null && typeof body.note !== 'string') {
      return NextResponse.json({ error: 'La note doit être un texte.' }, { status: 400 });
    }
    const completedIncoming = hasCompletedKey ? body.completed as boolean : undefined;
    const hasNoteKey = Object.prototype.hasOwnProperty.call(body, 'note');
    const noteIncoming = hasNoteKey ? String(body.note ?? '').trim().slice(0, 4000) : undefined;

    if (!eleveId || !licenceCode || !moduleCode) {
      return NextResponse.json({ error: 'eleve_id, licence_code et module_code requis.' }, { status: 400 });
    }
    if (!isValidModule(licenceCode, moduleCode)) {
      return NextResponse.json({ error: 'Module invalide pour cette licence.' }, { status: 400 });
    }

    const { data: eleve } = await admin
      .from('profiles')
      .select('id, instructeur_referent_id, formation_instruction_licence, formation_instruction_active')
      .eq('id', eleveId)
      .single();
    if (!eleve) return NextResponse.json({ error: 'Élève introuvable.' }, { status: 404 });
    if (!eleve.formation_instruction_active) {
      return NextResponse.json({ error: 'Cette formation est clôturée.' }, { status: 409 });
    }
    if (eleve.instructeur_referent_id !== user.id && me?.role !== 'admin') {
      return NextResponse.json({ error: 'Cet élève n’est pas rattaché à vous.' }, { status: 403 });
    }
    if (eleve.formation_instruction_licence !== licenceCode) {
      return NextResponse.json({ error: 'Le code licence ne correspond pas à la formation de l’élève' }, { status: 400 });
    }
    if (me?.role !== 'admin' && !canInstructorManageEleveForFormation(cap, eleve.formation_instruction_licence)) {
      return NextResponse.json({ error: 'Vous n’êtes pas autorisé pour ce type de parcours.' }, { status: 403 });
    }

    // Lire la ligne existante en une fois (utile pour la note ET pour completed).
    type ExistingRow = { note: string | null; completed: boolean | null; completed_at: string | null } | null;
    let existingRow: ExistingRow = null;
    {
      const { data, error: readError } = await admin
        .from('instruction_progression_items')
        .select('note, completed, completed_at')
        .eq('eleve_id', eleveId)
        .eq('licence_code', licenceCode)
        .eq('module_code', moduleCode)
        .maybeSingle();
      if (readError) return NextResponse.json({ error: 'Impossible de lire la progression actuelle.' }, { status: 503 });
      existingRow = (data as unknown as ExistingRow) ?? null;
    }

    let noteVal: string | null;
    if (noteIncoming !== undefined) {
      noteVal = noteIncoming.length ? noteIncoming : null;
    } else {
      noteVal = existingRow?.note ?? null;
    }

    const completed: boolean = completedIncoming ?? Boolean(existingRow?.completed);
    const completedAt: string | null =
      completedIncoming === undefined
        ? (existingRow?.completed_at ?? (completed ? new Date().toISOString() : null))
        : (completed ? (existingRow?.completed_at ?? new Date().toISOString()) : null);

    const payload = {
      eleve_id: eleveId,
      licence_code: licenceCode,
      module_code: moduleCode,
      completed,
      completed_at: completedAt,
      note: noteVal,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };
    const { error } = await admin.from('instruction_progression_items').upsert(payload, {
      onConflict: 'eleve_id,licence_code,module_code',
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Notification : module nouvellement valide -> ping eleve.
    const wasCompleted = Boolean(existingRow?.completed);
    if (completed && !wasCompleted) {
      try {
        const program = INSTRUCTION_PROGRAMS.find((p) => p.licenceCode === licenceCode);
        const moduleTitle = program?.modules.find((m) => m.code === moduleCode)?.title || moduleCode;
        const { data: instr } = await admin
          .from('profiles').select('identifiant').eq('id', user.id).maybeSingle();
        await notifyUser(eleveId, {
          type: 'module_validated',
          title: `Module ${moduleCode} valide`,
          body: `${instr?.identifiant ?? 'Votre instructeur'} a valide le module "${moduleTitle}" de votre formation ${licenceCode}.${noteVal ? `\n\nCommentaire : ${noteVal}` : ''}`,
          link: '/instruction',
        });
      } catch (e) { console.error('notifyUser module_validated:', e); }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('instruction/progression PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
