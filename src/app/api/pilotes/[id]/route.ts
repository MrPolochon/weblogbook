import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { identifiantToEmail } from '@/lib/constants';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const body = await request.json();
    const { heures_initiales_minutes, blocked_until, block_reason, identifiant: identifiantBody, reset_password, armee: armeeBody } = body;

    const updates: Record<string, unknown> = {};
    if (typeof heures_initiales_minutes === 'number' && heures_initiales_minutes >= 0) {
      updates.heures_initiales_minutes = heures_initiales_minutes;
    }
    if (blocked_until === null) updates.blocked_until = null;
    else if (blocked_until && typeof blocked_until === 'string') updates.blocked_until = blocked_until;
    if (block_reason !== undefined) updates.block_reason = block_reason == null ? null : String(block_reason);
    if (armeeBody !== undefined) updates.armee = Boolean(armeeBody);

    const admin = createAdminClient();

    if (identifiantBody != null && typeof identifiantBody === 'string') {
      const newId = String(identifiantBody).trim().toLowerCase();
      if (!newId || newId.length < 2) return NextResponse.json({ error: 'Identifiant trop court' }, { status: 400 });
      const { data: existing } = await admin.from('profiles').select('id').eq('identifiant', newId).neq('id', id).single();
      if (existing) return NextResponse.json({ error: 'Cet identifiant est déjà utilisé' }, { status: 400 });
      updates.identifiant = newId;
      const { error: authErr } = await admin.auth.admin.updateUserById(id, { email: identifiantToEmail(newId) });
      if (authErr) return NextResponse.json({ error: authErr.message || 'Erreur mise à jour identifiant' }, { status: 400 });
    }

    if (reset_password === true) {
      const { error: pwdErr } = await admin.auth.admin.updateUserById(id, { password: '1234567890' });
      if (pwdErr) return NextResponse.json({ error: pwdErr.message || 'Erreur réinitialisation MDP' }, { status: 400 });
    }

    const { error } = await admin.from('profiles').update(updates).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Pilot update error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    if (id === user.id) {
      return NextResponse.json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: target } = await admin.from('profiles').select('role').eq('id', id).single();
    if (!target) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 });

    if (target.role === 'admin') {
      const { count } = await admin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin');
      if ((count ?? 0) <= 1) {
        return NextResponse.json({ error: 'Il doit rester au moins un administrateur.' }, { status: 400 });
      }
      const body = await request.json().catch(() => ({})) as { superadminPassword?: string };
      const expected = process.env.SUPERADMIN_PASSWORD;
      if (!expected || expected.length === 0) {
        return NextResponse.json(
          { error: 'Mot de passe superadmin non configuré. Définissez SUPERADMIN_PASSWORD dans les variables d\'environnement.' },
          { status: 500 }
        );
      }
      if (body?.superadminPassword !== expected) {
        return NextResponse.json({ error: 'Mot de passe superadmin incorrect.' }, { status: 400 });
      }
    }

    const { data: vols } = await admin.from('vols').select('id, type_avion_id, compagnie_libelle, duree_minutes, depart_utc, arrivee_utc, type_vol, commandant_bord, role_pilote').eq('pilote_id', id);
    const purgeAt = new Date();
    purgeAt.setDate(purgeAt.getDate() + 7);

    if (vols && vols.length > 0) {
      const { data: types } = await admin.from('types_avion').select('id, nom');
      const typeMap = new Map((types || []).map((t) => [t.id, t.nom]));
      await admin.from('vols_archive').insert(
        vols.map((v) => ({
          pilote_id_deleted: id,
          type_avion_nom: typeMap.get(v.type_avion_id) ?? null,
          compagnie_libelle: v.compagnie_libelle,
          duree_minutes: v.duree_minutes,
          depart_utc: v.depart_utc,
          arrivee_utc: v.arrivee_utc,
          type_vol: v.type_vol,
          commandant_bord: v.commandant_bord,
          role_pilote: v.role_pilote,
          purge_at: purgeAt.toISOString(),
        }))
      );
    }

    await admin.from('vols').delete().eq('pilote_id', id);
    await admin.from('profiles').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Pilot delete error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
