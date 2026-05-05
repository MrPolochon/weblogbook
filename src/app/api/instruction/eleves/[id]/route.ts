import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { INSTRUCTION_LICENCE_CODES, INSTRUCTION_PROGRAMS } from '@/lib/instruction-programs';
import {
  canInstructorManageEleveForFormation,
  canAccessInstructionManagerTools,
  getInstructionCapabilities,
  listProfilesEligibleAsFormationReferent,
} from '@/lib/instruction-permissions';
import { DOCUMENTS_BUCKET } from '@/lib/documents-upload';
import { buildFormationClosurePdf, formationArchiveStoragePath } from '@/lib/formation-pdf';
import { notifyUser, notifyUsers, getAdminUserIds } from '@/lib/notifications';

const STATUTS_PLANS_OUVERTS = ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture'];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
      return NextResponse.json({ error: 'Réservé aux formateurs (FI / ATC FI / …).' }, { status: 403 });
    }

    const { data: eleve } = await admin
      .from('profiles')
      .select('id, identifiant, instructeur_referent_id, formation_instruction_active, formation_instruction_licence')
      .eq('id', eleveId)
      .single();
    if (!eleve) return NextResponse.json({ error: 'Élève introuvable.' }, { status: 404 });
    if (eleve.instructeur_referent_id !== user.id && me?.role !== 'admin') {
      return NextResponse.json({ error: 'Cet élève n’est pas rattaché à vous.' }, { status: 403 });
    }
    if (me?.role !== 'admin' && !canInstructorManageEleveForFormation(cap, eleve.formation_instruction_licence)) {
      return NextResponse.json(
        { error: 'Vous n’êtes pas autorisé à gérer la formation de cet élève (type de parcours).' },
        { status: 403 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action || '').trim();
    if (action !== 'terminer_formation' && action !== 'set_licence' && action !== 'transfer_instructeur') {
      return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
    }

    if (action === 'set_licence') {
      const licenceCode = String(body.licence_code || '').trim();
      if (!INSTRUCTION_LICENCE_CODES.includes(licenceCode)) {
        return NextResponse.json({ error: 'Licence invalide.' }, { status: 400 });
      }
      const { error: setErr } = await admin.from('profiles').update({ formation_instruction_licence: licenceCode }).eq('id', eleveId);
      if (setErr) return NextResponse.json({ error: setErr.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (action === 'transfer_instructeur') {
      if (!eleve.formation_instruction_active) {
        return NextResponse.json({ error: 'Formation inactive : transfert impossible.' }, { status: 400 });
      }
      const nouvelId = String(body.nouvel_instructeur_id || '').trim();
      if (!nouvelId) {
        return NextResponse.json({ error: 'nouvel_instructeur_id requis.' }, { status: 400 });
      }
      if (nouvelId === eleve.instructeur_referent_id) {
        return NextResponse.json({ error: 'Cet instructeur est déjà référent.' }, { status: 400 });
      }
      if (nouvelId === eleveId) {
        return NextResponse.json({ error: 'Transfert invalide.' }, { status: 400 });
      }
      const licenceRef = eleve.formation_instruction_licence || 'PPL';
      const { data: nouveauProf } = await admin.from('profiles').select('id, role').eq('id', nouvelId).maybeSingle();
      if (!nouveauProf?.id) {
        return NextResponse.json({ error: 'Instructeur cible introuvable.' }, { status: 404 });
      }
      const capNouveau = await getInstructionCapabilities(admin, nouvelId, nouveauProf.role);
      if (!canInstructorManageEleveForFormation(capNouveau, licenceRef)) {
        return NextResponse.json(
          { error: 'Ce compte ne peut pas prendre la suite de cette formation (titres ou parcours).' },
          { status: 400 },
        );
      }
      const pool = await listProfilesEligibleAsFormationReferent(admin, licenceRef);
      if (!pool.some((p) => p.id === nouvelId)) {
        return NextResponse.json({ error: 'Instructeur non éligible pour ce type de formation.' }, { status: 400 });
      }

      const { error: upProfErr } = await admin.from('profiles').update({ instructeur_referent_id: nouvelId }).eq('id', eleveId);
      if (upProfErr) return NextResponse.json({ error: upProfErr.message }, { status: 400 });

      await admin
        .from('inventaire_avions')
        .update({ instruction_instructeur_id: nouvelId })
        .eq('instruction_eleve_id', eleveId)
        .eq('instruction_actif', true);

      try {
        const [{ data: oldInstr }, { data: newInstr }] = await Promise.all([
          eleve.instructeur_referent_id
            ? admin.from('profiles').select('identifiant').eq('id', eleve.instructeur_referent_id).maybeSingle()
            : Promise.resolve({ data: null }),
          admin.from('profiles').select('identifiant').eq('id', nouvelId).maybeSingle(),
        ]);
        await Promise.all([
          notifyUser(nouvelId, {
            type: 'transfer_in',
            title: `Nouvel eleve a former (${licenceRef})`,
            body: `${eleve.identifiant ?? 'Un eleve'} vous a ete transfere par ${oldInstr?.identifiant ?? 'l\'ancien instructeur'} pour sa formation ${licenceRef}.`,
            link: '/instruction',
          }),
          notifyUser(eleveId, {
            type: 'transfer_in',
            title: `Nouvel instructeur referent`,
            body: `Votre formation ${licenceRef} est desormais suivie par ${newInstr?.identifiant ?? 'un nouvel instructeur'}.`,
            link: '/instruction',
          }),
          eleve.instructeur_referent_id && eleve.instructeur_referent_id !== user.id
            ? notifyUser(eleve.instructeur_referent_id, {
                type: 'transfer_out',
                title: `Eleve transfere`,
                body: `${eleve.identifiant ?? 'Un eleve'} a ete transfere a ${newInstr?.identifiant ?? 'un autre instructeur'}.`,
                link: '/instruction',
              })
            : Promise.resolve(),
        ]);
      } catch (e) { console.error('notifyUser transfer:', e); }

      return NextResponse.json({ ok: true });
    }

    const { data: avionsTemp } = await admin
      .from('inventaire_avions')
      .select('id, immatriculation, nom_personnalise, aeroport_actuel, type_avion_id')
      .eq('instruction_actif', true)
      .eq('instruction_eleve_id', eleveId);

    const ids = (avionsTemp || []).map((a) => a.id);
    if (ids.length > 0) {
      const { count: plansOuverts } = await admin
        .from('plans_vol')
        .select('*', { count: 'exact', head: true })
        .in('inventaire_avion_id', ids)
        .in('statut', STATUTS_PLANS_OUVERTS);
      if ((plansOuverts ?? 0) > 0) {
        return NextResponse.json({
          error: 'Impossible de terminer la formation: un avion temporaire est utilisé dans un plan de vol en cours.',
        }, { status: 400 });
      }
    }

    const licenceCode = eleve.formation_instruction_licence || 'PPL';
    const program = INSTRUCTION_PROGRAMS.find((p) => p.licenceCode === licenceCode);
    const licenceLabel = program?.label ?? licenceCode;

    const { data: instructeurProf } = eleve.instructeur_referent_id
      ? await admin.from('profiles').select('identifiant').eq('id', eleve.instructeur_referent_id).maybeSingle()
      : { data: null };

    const { data: progRows } = await admin
      .from('instruction_progression_items')
      .select('module_code, completed, note')
      .eq('eleve_id', eleveId)
      .eq('licence_code', licenceCode);

    const byModule = new Map((progRows || []).map((r) => [r.module_code as string, r]));

    const modulesPdf =
      program?.modules.map((m) => {
        const row = byModule.get(m.code);
        return {
          code: m.code,
          title: m.title,
          completed: Boolean(row?.completed),
          note: (row?.note as string | null) ?? null,
        };
      }) ?? [];

    const typeIds = Array.from(
      new Set((avionsTemp || []).map((a) => a.type_avion_id).filter(Boolean) as string[]),
    );
    const { data: typesRows } =
      typeIds.length > 0
        ? await admin.from('types_avion').select('id, nom').in('id', typeIds)
        : { data: [] as Array<{ id: string; nom: string }> };
    const typeNomById = new Map((typesRows || []).map((t) => [t.id, t.nom]));

    const avionsLines = (avionsTemp || []).map((a) => {
      const tn = typeNomById.get(a.type_avion_id) || 'Type inconnu';
      const imm = a.immatriculation?.trim() || '—';
      const nom = a.nom_personnalise?.trim();
      const apt = a.aeroport_actuel?.trim();
      const bits = [`${tn}`, `immat ${imm}`];
      if (nom) bits.push(`nom ${nom}`);
      if (apt) bits.push(`aéroport ${apt}`);
      return bits.join(', ');
    });

    const completedAt = new Date();
    const completedAtLabel = completedAt.toLocaleString('fr-FR', {
      dateStyle: 'long',
      timeStyle: 'short',
    });

    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await buildFormationClosurePdf({
        eleveIdentifiant: eleve.identifiant || eleveId,
        licenceLabel,
        licenceCode,
        instructeurIdentifiant: instructeurProf?.identifiant ?? null,
        completedAtLabel,
        modules: modulesPdf,
        avionsLines,
      });
    } catch (pdfErr) {
      console.error('formation PDF:', pdfErr);
      return NextResponse.json({ error: 'Échec de la génération du dossier PDF.' }, { status: 500 });
    }

    const storagePath = formationArchiveStoragePath(licenceCode, eleve.identifiant || eleveId, completedAt);

    const { error: uploadErr } = await admin.storage.from(DOCUMENTS_BUCKET).upload(storagePath, pdfBytes, {
      contentType: 'application/pdf',
      upsert: false,
    });
    if (uploadErr) {
      console.error('formation archive upload:', uploadErr);
      return NextResponse.json({ error: `Échec enregistrement du PDF : ${uploadErr.message}` }, { status: 500 });
    }

    const { error: archiveErr } = await admin.from('instruction_formation_archives').insert({
      eleve_id: eleveId,
      eleve_identifiant_snapshot: eleve.identifiant || '',
      licence_code: licenceCode,
      licence_label_snapshot: licenceLabel,
      instructeur_id: eleve.instructeur_referent_id,
      instructeur_identifiant_snapshot: instructeurProf?.identifiant ?? null,
      storage_bucket: DOCUMENTS_BUCKET,
      storage_path: storagePath,
      completed_at: completedAt.toISOString(),
    });
    if (archiveErr) {
      console.error('instruction_formation_archives insert:', archiveErr);
      await admin.storage.from(DOCUMENTS_BUCKET).remove([storagePath]).catch(() => undefined);
      return NextResponse.json({ error: archiveErr.message }, { status: 500 });
    }

    if (ids.length > 0) {
      await admin.from('inventaire_avions').delete().in('id', ids);
    }

    const { error: profileErr } = await admin
      .from('profiles')
      .update({
        formation_instruction_active: false,
        instructeur_referent_id: null,
      })
      .eq('id', eleveId);

    if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 400 });

    try {
      await notifyUser(eleveId, {
        type: 'formation_done_eleve',
        title: `Formation ${licenceCode} terminee`,
        body: `Felicitations, votre formation ${licenceLabel} est terminee. Le dossier final est archive et consultable par les administrateurs.`,
        link: '/compte',
      });
      const adminIds = await getAdminUserIds();
      const closingInstructorId = eleve.instructeur_referent_id ?? user.id;
      await notifyUsers(adminIds.filter((aid) => aid !== eleveId && aid !== closingInstructorId), {
        type: 'formation_done_admin',
        title: `Formation ${licenceCode} archivee`,
        body: `${instructeurProf?.identifiant ?? 'Un instructeur'} a cloture la formation ${licenceLabel} de ${eleve.identifiant ?? 'un eleve'}. PDF archive.`,
        link: '/admin',
      });
    } catch (e) { console.error('notifyUser formation_done:', e); }

    return NextResponse.json({ ok: true, archive_path: storagePath });
  } catch (e) {
    console.error('instruction/eleves/[id] PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
