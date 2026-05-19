import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export interface ActionItem {
  id: string;
  kind: 'plan_refuse' | 'plan_cloture' | 'attente_pilote' | 'attente_copilote' | 'attente_instructeur' | 'refuse_copilote';
  title: string;
  body: string;
  link: string;
  count: number;
}

/**
 * GET /api/user/actions
 * Retourne les actions pilote urgentes :
 *  - Plans de vol refusés par l'ATC
 *  - Plans clôturés à enregistrer
 *  - Vols en attente de confirmation pilote / copilote / instructeur
 *  - Vols refusés par le copilote
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ actions: [] }, { status: 401 });

    const admin = createAdminClient();
    const uid = user.id;

    const [
      { data: plansRefuses },
      { data: plansClotures },
      { data: attenteConfPilote },
      { data: attenteConfCopilote },
      { data: attenteConfInstructeur },
      { data: refuseParCopilote },
    ] = await Promise.all([
      admin.from('plans_vol').select('id').eq('pilote_id', uid).eq('statut', 'refuse'),
      admin.from('plans_vol').select('id, numero_vol').eq('pilote_id', uid).eq('statut', 'cloture').is('siavi_avion_id', null).not('accepted_at', 'is', null).not('cloture_at', 'is', null),
      supabase.from('vols').select('id').eq('copilote_id', uid).eq('statut', 'en_attente_confirmation_pilote'),
      supabase.from('vols').select('id').eq('pilote_id', uid).eq('statut', 'en_attente_confirmation_copilote'),
      admin.from('vols').select('id').eq('pilote_id', uid).eq('statut', 'en_attente_confirmation_instructeur'),
      supabase.from('vols').select('id').eq('pilote_id', uid).eq('statut', 'refuse_par_copilote'),
    ]);

    const actions: ActionItem[] = [];

    const n1 = plansRefuses?.length ?? 0;
    if (n1 > 0) actions.push({
      id: 'plan_refuse',
      kind: 'plan_refuse',
      title: `${n1} plan${n1 > 1 ? 's' : ''} refusé${n1 > 1 ? 's' : ''} par l'ATC`,
      body: 'Modifiez-les selon les indications et renvoyez-les.',
      link: '/logbook/plans-vol',
      count: n1,
    });

    const n2 = plansClotures?.length ?? 0;
    if (n2 > 0) actions.push({
      id: 'plan_cloture',
      kind: 'plan_cloture',
      title: `${n2} plan${n2 > 1 ? 's' : ''} clôturé${n2 > 1 ? 's' : ''} à enregistrer`,
      body: 'Cliquez pour enregistrer le vol automatiquement.',
      link: n2 === 1 ? `/logbook/nouveau?plan=${plansClotures![0].id}` : '/logbook/plans-vol',
      count: n2,
    });

    const n3 = attenteConfPilote?.length ?? 0;
    if (n3 > 0) actions.push({
      id: 'attente_pilote',
      kind: 'attente_pilote',
      title: `${n3} vol${n3 > 1 ? 's' : ''} en attente — confirmation pilote`,
      body: 'Ces vols n\'apparaîtront dans votre logbook qu\'après confirmation du pilote.',
      link: `/logbook/vol/${attenteConfPilote![0].id}`,
      count: n3,
    });

    const n4 = attenteConfCopilote?.length ?? 0;
    if (n4 > 0) actions.push({
      id: 'attente_copilote',
      kind: 'attente_copilote',
      title: `${n4} vol${n4 > 1 ? 's' : ''} en attente — confirmation co-pilote`,
      body: 'Votre co-pilote doit confirmer pour que ces vols apparaissent.',
      link: `/logbook/vol/${attenteConfCopilote![0].id}`,
      count: n4,
    });

    const n5 = attenteConfInstructeur?.length ?? 0;
    if (n5 > 0) actions.push({
      id: 'attente_instructeur',
      kind: 'attente_instructeur',
      title: `${n5} vol${n5 > 1 ? 's' : ''} d'instruction en attente`,
      body: 'L\'instructeur validera directement.',
      link: `/logbook/vol/${attenteConfInstructeur![0].id}`,
      count: n5,
    });

    const n6 = refuseParCopilote?.length ?? 0;
    if (n6 > 0) actions.push({
      id: 'refuse_copilote',
      kind: 'refuse_copilote',
      title: `${n6} vol${n6 > 1 ? 's' : ''} refusé${n6 > 1 ? 's' : ''} par le co-pilote`,
      body: 'Modifiez ou retirez le co-pilote pour renvoyer le vol.',
      link: `/logbook/vol/${refuseParCopilote![0].id}`,
      count: n6,
    });

    return NextResponse.json({ actions, total: actions.reduce((s, a) => s + a.count, 0) });
  } catch (e) {
    console.error('GET /api/user/actions:', e);
    return NextResponse.json({ actions: [], total: 0 }, { status: 500 });
  }
}
