import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { fetchAtisBot } from '@/lib/atis-bot-api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST - Arrêter le broadcast ATIS contrôlé par l'utilisateur courant.
 *
 * Multi-instance : on ne stoppe QUE l'instance que l'utilisateur contrôle,
 * pour ne pas couper l'ATIS d'un autre ATC.
 *
 * Optionnellement, body { instance_id: number } permet à un admin de stopper
 * une instance précise (kill switch).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, atc')
      .eq('id', user.id)
      .single();
    const canAtc = profile?.role === 'admin' || profile?.role === 'atc' || Boolean(profile?.atc);
    if (!canAtc) return NextResponse.json({ error: 'Accès ATC requis.' }, { status: 403 });

    let body: { instance_id?: number | string } = {};
    try {
      body = await request.json();
    } catch {
      // body vide accepté
    }

    const admin = createAdminClient();

    // Identifie la (les) instance(s) à arrêter.
    // - Si body.instance_id fourni : stop cible (n'importe quel ATC peut arreter
    //   n'importe quel ATIS, c'est une "kill switch" partagee pour eviter qu'un
    //   ATIS oublie reste actif si le proprio est offline).
    // - Sinon : stop toutes les instances contrôlées par l'utilisateur.
    let targetInstances: number[] = [];

    if (body.instance_id !== undefined && body.instance_id !== null && body.instance_id !== '') {
      const id = Number(body.instance_id);
      if (!Number.isFinite(id)) {
        return NextResponse.json({ error: 'instance_id invalide' }, { status: 400 });
      }
      targetInstances = [id];
    } else {
      const { data: rows } = await admin
        .from('atis_broadcast_state')
        .select('id')
        .eq('controlling_user_id', user.id)
        .eq('broadcasting', true);

      targetInstances = (rows ?? [])
        .map((r) => parseInt(String(r.id), 10))
        .filter((n) => Number.isFinite(n));
    }

    if (targetInstances.length === 0) {
      // Rien à stopper : retourne ok pour idempotence (UI peut appeler stop "au cas où").
      return NextResponse.json({ ok: true, broadcasting: false, stopped: [] });
    }

    const stopped: number[] = [];
    const botErrors: string[] = [];
    for (const instanceId of targetInstances) {
      const res = await fetchAtisBot('/webhook/stop', {
        method: 'POST',
        instanceId,
      });
      // Succès ou bot injoignable (503) : on aligne la DB pour ne pas bloquer l'utilisateur.
      if (!res.error || res.status === 503) {
        stopped.push(instanceId);
        await admin
          .from('atis_broadcast_state')
          .update({
            controlling_user_id: null,
            aeroport: null,
            position: null,
            broadcasting: false,
            source: null,
            started_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', String(instanceId));
      } else {
        botErrors.push(`Bot ${instanceId}: ${res.error}`);
      }
    }

    if (botErrors.length > 0) {
      return NextResponse.json(
        {
          ok: stopped.length > 0,
          stopped,
          error:
            (stopped.length > 0 ? 'Arrêt partiel. ' : '') +
            botErrors.join(' — ') +
            (stopped.length === 0
              ? " La base n'a pas été modifiée sur les instances en erreur ; le flux Discord peut encore être actif."
              : ''),
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, broadcasting: false, stopped });
  } catch (e) {
    console.error('ATIS stop:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
