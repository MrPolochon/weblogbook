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
    const { heures_initiales_minutes, blocked_until, block_reason, identifiant: identifiantBody, reset_password, armee: armeeBody, atc: atcBody, atc_grade_id: atcGradeIdBody, role: roleBody, ifsa: ifsaBody } = body;

    const updates: Record<string, unknown> = {};
    if (typeof heures_initiales_minutes === 'number' && heures_initiales_minutes >= 0) {
      updates.heures_initiales_minutes = heures_initiales_minutes;
    }
    if (blocked_until === null) updates.blocked_until = null;
    else if (blocked_until && typeof blocked_until === 'string') updates.blocked_until = blocked_until;
    if (block_reason !== undefined) updates.block_reason = block_reason == null ? null : String(block_reason);
    if (armeeBody !== undefined) updates.armee = Boolean(armeeBody);
    if (atcBody !== undefined) updates.atc = Boolean(atcBody);
    if (atcGradeIdBody !== undefined) updates.atc_grade_id = (atcGradeIdBody === null || atcGradeIdBody === '') ? null : atcGradeIdBody;
    if (ifsaBody !== undefined) updates.ifsa = Boolean(ifsaBody);

    const admin = createAdminClient();

    // Rôle Armée requiert l'accès pilote : interdire armee=true pour role=atc
    if (armeeBody === true) {
      const { data: t } = await admin.from('profiles').select('role').eq('id', id).single();
      if (t?.role === 'atc') return NextResponse.json({ error: 'Le rôle Armée requiert l\'accès à l\'espace pilote. Accordez d\'abord l\'accès pilote.' }, { status: 400 });
    }

    // Gestion du changement de rôle (pilote, atc, admin)
    if (roleBody && ['pilote', 'atc', 'admin'].includes(roleBody)) {
      const { data: target } = await admin.from('profiles').select('role').eq('id', id).single();
      if (!target) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 });
      
      // Si on veut rétrograder un admin, vérifier qu'il reste au moins un admin
      if (target.role === 'admin' && roleBody !== 'admin') {
        const { count } = await admin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin');
        if ((count ?? 0) <= 1) {
          return NextResponse.json({ error: 'Il doit rester au moins un administrateur.' }, { status: 400 });
        }
      }
      
      // Appliquer le changement de rôle
      if (roleBody !== target.role) {
        updates.role = roleBody;
        
        // Si on passe en admin, garder les autres accès
        // Si on passe en atc uniquement, désactiver armee
        if (roleBody === 'atc') {
          updates.armee = false;
          updates.atc = true;
        }
        // Si on passe en pilote depuis atc, activer atc aussi
        if (roleBody === 'pilote' && target.role === 'atc') {
          updates.atc = true;
        }
      }
    }

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

    // Supprimer les dépendances avant de supprimer le compte
    await admin.from('vols').delete().eq('pilote_id', id);
    await admin.from('plans_vol').delete().eq('pilote_id', id);
    await admin.from('compagnie_employes').delete().eq('pilote_id', id);
    await admin.from('messages').delete().eq('destinataire_id', id);
    await admin.from('messages').delete().eq('expediteur_id', id);
    await admin.from('licences').delete().eq('pilote_id', id);
    await admin.from('atc_sessions').delete().eq('user_id', id);
    await admin.from('atc_plans_controles').delete().eq('user_id', id);
    await admin.from('atc_taxes_pending').delete().eq('user_id', id);
    
    // Nettoyer les références IFSA - colonnes nullable
    await admin.from('ifsa_sanctions').update({ cible_pilote_id: null }).eq('cible_pilote_id', id);
    await admin.from('ifsa_sanctions').update({ cleared_by_id: null }).eq('cleared_by_id', id);
    await admin.from('ifsa_sanctions').update({ amende_payee_par_id: null }).eq('amende_payee_par_id', id);
    // emis_par_id est NOT NULL - supprimer les sanctions émises par cet utilisateur
    await admin.from('ifsa_sanctions').delete().eq('emis_par_id', id);
    
    // Nettoyer les enquêtes IFSA
    await admin.from('ifsa_enquetes').update({ pilote_concerne_id: null }).eq('pilote_concerne_id', id);
    await admin.from('ifsa_enquetes').update({ enqueteur_id: null }).eq('enqueteur_id', id);
    // ouvert_par_id est NOT NULL - supprimer les enquêtes ouvertes par cet utilisateur
    await admin.from('ifsa_enquetes').delete().eq('ouvert_par_id', id);
    
    // Nettoyer les signalements IFSA
    await admin.from('ifsa_signalements').update({ pilote_signale_id: null }).eq('pilote_signale_id', id);
    await admin.from('ifsa_signalements').update({ traite_par_id: null }).eq('traite_par_id', id);
    // signale_par_id est NOT NULL - supprimer les signalements faits par cet utilisateur
    await admin.from('ifsa_signalements').delete().eq('signale_par_id', id);
    
    await admin.from('ifsa_enquetes_notes').delete().eq('auteur_id', id);
    
    // Nettoyer les vols (copilote, instructeur, chef_escadron)
    await admin.from('vols').update({ copilote_id: null }).eq('copilote_id', id);
    await admin.from('vols').update({ instructeur_id: null }).eq('instructeur_id', id);
    await admin.from('vols').update({ chef_escadron_id: null }).eq('chef_escadron_id', id);
    await admin.from('vols_equipage_militaire').delete().eq('profile_id', id);
    
    // Nettoyer les documents
    await admin.from('document_files').update({ uploaded_by: null }).eq('uploaded_by', id);
    await admin.from('document_sections').update({ created_by: null }).eq('created_by', id);
    
    // Nettoyer les NOTAMs
    await admin.from('notams').update({ created_by: null }).eq('created_by', id);
    
    // Nettoyer les qualifications (user_id)
    await admin.from('licences_qualifications').delete().eq('user_id', id);
    await admin.from('licences_qualifications').update({ created_by: null }).eq('created_by', id);
    
    // Nettoyer les plans de vol (created_by_user_id)
    await admin.from('plans_vol').update({ created_by_user_id: null }).eq('created_by_user_id', id);
    
    // Nettoyer les plans de vol (current_holder_user_id)
    await admin.from('plans_vol').update({ current_holder_user_id: null }).eq('current_holder_user_id', id);
    
    // Nettoyer les paiements d'amendes
    await admin.from('ifsa_paiements_amendes').delete().eq('paye_par_id', id);
    
    // Nettoyer les appels ATC
    await admin.from('atc_calls').delete().eq('from_user_id', id);
    await admin.from('atc_calls').delete().eq('to_user_id', id);
    
    // Nettoyer les invitations compagnie
    await admin.from('compagnie_invitations').delete().eq('pilote_id', id);
    
    // Mettre à null le PDG des compagnies (ne pas supprimer la compagnie)
    await admin.from('compagnies').update({ pdg_id: null }).eq('pdg_id', id);
    
    // Mettre à null detruit_par_id dans compagnie_avions
    await admin.from('compagnie_avions').update({ detruit_par_id: null }).eq('detruit_par_id', id);
    
    // Supprimer les annonces du marché (hangar_market)
    await admin.from('hangar_market').delete().eq('vendeur_id', id);
    
    // Mettre à null l'acheteur dans les annonces du marché
    await admin.from('hangar_market').update({ acheteur_id: null }).eq('acheteur_id', id);
    
    // Supprimer les transactions Felitz créées par cet utilisateur (created_by est NOT NULL)
    await admin.from('felitz_transactions').delete().eq('created_by', id);
    
    // Nettoyer les comptes Felitz et dépendances associées
    const { data: comptesPersonne } = await admin
      .from('felitz_comptes')
      .select('id')
      .eq('proprietaire_id', id);
    
    if (comptesPersonne && comptesPersonne.length > 0) {
      const compteIds = comptesPersonne.map(c => c.id);
      
      // Mettre à null les références dans ifsa_sanctions
      for (const compteId of compteIds) {
        await admin
          .from('ifsa_sanctions')
          .update({ compte_destination_id: null })
          .eq('compte_destination_id', compteId);
      }
      
      // Supprimer les transactions Felitz liées aux comptes
      for (const compteId of compteIds) {
        await admin.from('felitz_transactions').delete().eq('compte_id', compteId);
      }
      
      // Mettre à null les chèques destinés à ces comptes
      for (const compteId of compteIds) {
        await admin
          .from('messages')
          .update({ cheque_destinataire_compte_id: null })
          .eq('cheque_destinataire_compte_id', compteId);
      }
    }
    
    // Supprimer les prêts bancaires personnels
    await admin.from('prets_bancaires').delete().eq('pilote_id', id);
    await admin.from('prets_bancaires').delete().eq('demandeur_id', id);
    
    await admin.from('felitz_comptes').delete().eq('proprietaire_id', id);
    await admin.from('inventaire_avions').delete().eq('proprietaire_id', id);
    
    // Supprimer le profil et l'utilisateur auth
    await admin.from('profiles').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Pilot delete error:', e);
    const errorMessage = e instanceof Error ? e.message : 'Erreur serveur';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
