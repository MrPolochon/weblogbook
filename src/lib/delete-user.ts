import { createAdminClient } from '@/lib/supabase/admin';
import { stopAtisIfController } from '@/lib/atis-bot-api';

export async function deleteUserAccount(userId: string) {
  const admin = createAdminClient();

  await stopAtisIfController(userId).catch(() => {});

  const { data: vols } = await admin
    .from('vols')
    .select('id, type_avion_id, compagnie_libelle, duree_minutes, depart_utc, arrivee_utc, type_vol, commandant_bord, role_pilote')
    .eq('pilote_id', userId);

  const purgeAt = new Date();
  purgeAt.setDate(purgeAt.getDate() + 7);

  if (vols && vols.length > 0) {
    const { data: types } = await admin.from('types_avion').select('id, nom');
    const typeMap = new Map((types || []).map((t) => [t.id, t.nom]));
    await admin.from('vols_archive').insert(
      vols.map((v) => ({
        pilote_id_deleted: userId,
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

  await admin.from('vols').delete().eq('pilote_id', userId);
  await admin.from('plans_vol').delete().eq('pilote_id', userId);
  await admin.from('compagnie_employes').delete().eq('pilote_id', userId);
  await admin.from('messages').delete().eq('destinataire_id', userId);
  await admin.from('messages').delete().eq('expediteur_id', userId);
  await admin.from('licences').delete().eq('pilote_id', userId);
  await admin.from('atc_sessions').delete().eq('user_id', userId);
  await admin.from('atc_plans_controles').delete().eq('user_id', userId);
  await admin.from('atc_taxes_pending').delete().eq('user_id', userId);

  await admin.from('ifsa_sanctions').update({ cible_pilote_id: null }).eq('cible_pilote_id', userId);
  await admin.from('ifsa_sanctions').update({ cleared_by_id: null }).eq('cleared_by_id', userId);
  await admin.from('ifsa_sanctions').update({ amende_payee_par_id: null }).eq('amende_payee_par_id', userId);
  await admin.from('ifsa_sanctions').delete().eq('emis_par_id', userId);

  await admin.from('ifsa_enquetes').update({ pilote_concerne_id: null }).eq('pilote_concerne_id', userId);
  await admin.from('ifsa_enquetes').update({ enqueteur_id: null }).eq('enqueteur_id', userId);
  await admin.from('ifsa_enquetes').delete().eq('ouvert_par_id', userId);

  await admin.from('ifsa_signalements').update({ pilote_signale_id: null }).eq('pilote_signale_id', userId);
  await admin.from('ifsa_signalements').update({ traite_par_id: null }).eq('traite_par_id', userId);
  await admin.from('ifsa_signalements').delete().eq('signale_par_id', userId);
  await admin.from('ifsa_enquetes_notes').delete().eq('auteur_id', userId);

  await admin.from('vols').update({ copilote_id: null }).eq('copilote_id', userId);
  await admin.from('vols').update({ instructeur_id: null }).eq('instructeur_id', userId);
  await admin.from('vols').update({ chef_escadron_id: null }).eq('chef_escadron_id', userId);
  await admin.from('vols_equipage_militaire').delete().eq('profile_id', userId);

  await admin.from('document_files').update({ uploaded_by: null }).eq('uploaded_by', userId);
  await admin.from('document_sections').update({ created_by: null }).eq('created_by', userId);
  await admin.from('notams').update({ created_by: null }).eq('created_by', userId);

  await admin.from('licences_qualifications').delete().eq('user_id', userId);
  await admin.from('licences_qualifications').update({ created_by: null }).eq('created_by', userId);
  await admin.from('plans_vol').update({ created_by_user_id: null }).eq('created_by_user_id', userId);
  await admin.from('plans_vol').update({ current_holder_user_id: null }).eq('current_holder_user_id', userId);
  await admin.from('ifsa_paiements_amendes').delete().eq('paye_par_id', userId);
  await admin.from('atc_calls').delete().eq('from_user_id', userId);
  await admin.from('atc_calls').delete().eq('to_user_id', userId);
  await admin.from('compagnie_invitations').delete().eq('pilote_id', userId);
  await admin.from('compagnies').update({ pdg_id: null }).eq('pdg_id', userId);
  await admin.from('compagnie_avions').update({ detruit_par_id: null }).eq('detruit_par_id', userId);
  await admin.from('hangar_market').delete().eq('vendeur_id', userId);
  await admin.from('hangar_market').update({ acheteur_id: null }).eq('acheteur_id', userId);
  await admin.from('felitz_transactions').delete().eq('created_by', userId);

  const { data: comptesPersonne } = await admin
    .from('felitz_comptes')
    .select('id')
    .eq('proprietaire_id', userId);

  if (comptesPersonne && comptesPersonne.length > 0) {
    const compteIds = comptesPersonne.map((c) => c.id);
    for (const compteId of compteIds) {
      await admin.from('ifsa_sanctions').update({ compte_destination_id: null }).eq('compte_destination_id', compteId);
      await admin.from('felitz_transactions').delete().eq('compte_id', compteId);
      await admin.from('messages').update({ cheque_destinataire_compte_id: null }).eq('cheque_destinataire_compte_id', compteId);
    }
  }

  await admin.from('prets_bancaires').delete().eq('pilote_id', userId);
  await admin.from('prets_bancaires').delete().eq('demandeur_id', userId);
  await admin.from('felitz_comptes').delete().eq('proprietaire_id', userId);
  await admin.from('inventaire_avions').delete().eq('proprietaire_id', userId);

  await admin.from('profiles').delete().eq('id', userId);
  await admin.auth.admin.deleteUser(userId);
}
