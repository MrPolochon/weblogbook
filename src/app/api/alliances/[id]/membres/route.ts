import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLeaderCompagnieIds } from '@/lib/co-pdg-utils';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: allianceId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const myCompIds = await getLeaderCompagnieIds(user.id, admin);
  if (myCompIds.length === 0) return NextResponse.json({ error: 'Pas membre' }, { status: 403 });
  const { data: myMembers } = await admin.from('alliance_membres')
    .select('role, compagnie_id')
    .eq('alliance_id', allianceId)
    .in('compagnie_id', myCompIds);

  const myMember = myMembers?.[0] ?? null;
  if (!myMember) return NextResponse.json({ error: 'Pas membre' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { action, membre_id, nouveau_role } = body;

  const ROLE_LABELS: Record<string, string> = {
    president: 'Président', vice_president: 'Vice-Président', secretaire: 'Secrétaire', membre: 'Membre',
  };

  const { data: alliance } = await admin.from('alliances').select('nom').eq('id', allianceId).single();
  const allianceNom = alliance?.nom || 'Alliance';

  if (action === 'changer_role') {
    if (myMember.role !== 'president') return NextResponse.json({ error: 'Seul le président' }, { status: 403 });
    if (!membre_id || !nouveau_role) return NextResponse.json({ error: 'membre_id et nouveau_role requis' }, { status: 400 });
    if (!['vice_president', 'secretaire', 'membre'].includes(nouveau_role)) {
      return NextResponse.json({ error: 'Rôle invalide' }, { status: 400 });
    }
    const { data: target } = await admin.from('alliance_membres').select('id, role, compagnie_id').eq('id', membre_id).eq('alliance_id', allianceId).single();
    if (!target) return NextResponse.json({ error: 'Membre introuvable' }, { status: 404 });
    if (target.role === 'president') return NextResponse.json({ error: 'Impossible de rétrograder le président' }, { status: 400 });

    await admin.from('alliance_membres').update({ role: nouveau_role }).eq('id', membre_id);

    const { data: targetComp } = await admin.from('compagnies').select('pdg_id, nom').eq('id', target.compagnie_id).single();
    if (targetComp) {
      await admin.from('messages').insert({
        destinataire_id: targetComp.pdg_id,
        titre: `🏷️ Nouveau rôle — ${allianceNom}`,
        contenu: `Vous avez été nommé(e) ${ROLE_LABELS[nouveau_role] || nouveau_role} de l'alliance "${allianceNom}".`,
        type_message: 'normal',
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === 'expulser') {
    if (myMember.role !== 'president') return NextResponse.json({ error: 'Seul le président' }, { status: 403 });
    if (!membre_id) return NextResponse.json({ error: 'membre_id requis' }, { status: 400 });
    const { data: target } = await admin.from('alliance_membres').select('id, role, compagnie_id').eq('id', membre_id).eq('alliance_id', allianceId).single();
    if (!target) return NextResponse.json({ error: 'Membre introuvable' }, { status: 404 });
    if (target.role === 'president') return NextResponse.json({ error: 'Impossible d\'expulser le président' }, { status: 400 });

    await admin.from('alliance_membres').delete().eq('id', membre_id);
    await admin.from('compagnies').update({ alliance_id: null }).eq('id', target.compagnie_id);

    const { data: comp } = await admin.from('compagnies').select('pdg_id, nom').eq('id', target.compagnie_id).single();
    if (comp) {
      await admin.from('messages').insert({
        destinataire_id: comp.pdg_id,
        titre: `❌ Expulsion — ${allianceNom}`,
        contenu: `Votre compagnie "${comp.nom}" a été expulsée de l'alliance "${allianceNom}".`,
        type_message: 'normal',
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === 'transferer_presidence') {
    if (myMember.role !== 'president') return NextResponse.json({ error: 'Seul le président' }, { status: 403 });
    if (!membre_id) return NextResponse.json({ error: 'membre_id requis' }, { status: 400 });
    const { data: target } = await admin.from('alliance_membres').select('id, compagnie_id').eq('id', membre_id).eq('alliance_id', allianceId).single();
    if (!target) return NextResponse.json({ error: 'Membre introuvable' }, { status: 404 });

    const { data: myRow } = await admin.from('alliance_membres')
      .select('id').eq('alliance_id', allianceId).eq('compagnie_id', myMember.compagnie_id).single();
    if (myRow) await admin.from('alliance_membres').update({ role: 'vice_president' }).eq('id', myRow.id);
    await admin.from('alliance_membres').update({ role: 'president' }).eq('id', membre_id);

    const { data: myComp } = await admin.from('compagnies').select('nom').eq('id', myMember.compagnie_id).single();
    const { data: targetComp } = await admin.from('compagnies').select('pdg_id, nom').eq('id', target.compagnie_id).single();

    if (targetComp) {
      await admin.from('messages').insert({
        destinataire_id: targetComp.pdg_id,
        titre: `👑 Présidence transférée — ${allianceNom}`,
        contenu: `${myComp?.nom || 'L\'ancien président'} vous a transféré la présidence de l'alliance "${allianceNom}". Vous êtes désormais Président.`,
        type_message: 'normal',
      });
    }

    const allMembres = await admin.from('alliance_membres')
      .select('compagnie_id')
      .eq('alliance_id', allianceId)
      .neq('compagnie_id', myMember.compagnie_id)
      .neq('compagnie_id', target.compagnie_id);
    if (allMembres.data && allMembres.data.length > 0) {
      const compIds = allMembres.data.map(m => m.compagnie_id);
      const { data: comps } = await admin.from('compagnies').select('pdg_id').in('id', compIds);
      if (comps) {
        await admin.from('messages').insert(
          comps.map(c => ({
            destinataire_id: c.pdg_id,
            titre: `🔄 Changement de présidence — ${allianceNom}`,
            contenu: `${targetComp?.nom || 'Un nouveau membre'} est désormais le Président de l'alliance "${allianceNom}" (ancien président : ${myComp?.nom || '?'}).`,
            type_message: 'normal',
          }))
        );
      }
    }

    return NextResponse.json({ ok: true });
  }

  if (action === 'set_codeshare') {
    const pourcent = Number(body.codeshare_pourcent);
    if (isNaN(pourcent) || pourcent < 0 || pourcent > 100) {
      return NextResponse.json({ error: 'Pourcentage invalide (0-100)' }, { status: 400 });
    }
    const targetCompagnieId = body.compagnie_id && myCompIds.includes(body.compagnie_id)
      ? body.compagnie_id
      : myMember.compagnie_id;
    const { error: updErr } = await admin.from('alliance_membres')
      .update({ codeshare_pourcent: pourcent })
      .eq('alliance_id', allianceId)
      .eq('compagnie_id', targetCompagnieId);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
}
