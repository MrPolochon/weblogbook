import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessSiavi, isChefDeBrigade } from '@/lib/siavi/permissions';
import { redirect } from 'next/navigation';
import FleetConsole from './FleetConsole';
export default async function FlotteSiaviPage() {
    const { data: { user } } = await (await createClient()).auth.getUser();
    if (!user)
        redirect('/login');
    const admin = createAdminClient();
    if (!await canAccessSiavi(admin, user.id))
        redirect('/logbook');
    const [chief, aircraft, hubs, account, catalogue, plans] = await Promise.all([
        isChefDeBrigade(admin, user.id),
        admin.from('siavi_avions').select('*, types_avion:type_avion_id(id,nom,code_oaci,categorie,prix)').order('immatriculation'),
        admin.from('siavi_hubs').select('*').order('is_principal', { ascending: false }),
        admin.from('felitz_comptes').select('solde').eq('type', 'siavi').single(),
        admin.from('types_avion').select('id,nom,categorie,prix').gt('prix', 0).eq('est_militaire', false).order('nom'),
        admin.from('plans_vol').select('siavi_avion_id').not('siavi_avion_id', 'is', null).in('statut', ['depose', 'en_attente', 'accepte', 'en_cours', 'automonitoring', 'en_attente_cloture', 'planifie_suivant', 'en_pause']),
    ]);
    if (aircraft.error || hubs.error || account.error || catalogue.error || plans.error)
        throw new Error('Impossible de charger la flotte MEDEVAC.');
    const busy = new Set((plans.data ?? []).map(p => p.siavi_avion_id));
    return <FleetConsole chief={chief} aircraft={(aircraft.data ?? []).map(a => ({ ...a, types_avion: Array.isArray(a.types_avion) ? a.types_avion[0] : a.types_avion, busy: busy.has(a.id) }))} hubs={hubs.data ?? []} balance={Number(account.data?.solde ?? 0)} catalogue={catalogue.data ?? []}/>;
}
