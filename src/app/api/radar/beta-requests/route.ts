import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Réservé aux administrateurs' }, { status: 403 });
    }

    const admin = createAdminClient();

    const { data: requests } = await admin
      .from('radar_beta_requests')
      .select(`
        id, status, created_at, reviewed_at, reason,
        profiles!radar_beta_requests_user_id_fkey ( identifiant, role )
      `)
      .order('created_at', { ascending: false });

    return NextResponse.json({ requests: requests ?? [] });
  } catch (err) {
    console.error('Beta requests list error:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Réservé aux administrateurs' }, { status: 403 });
    }

    const body = await request.json();
    const { request_id, action, superadmin_password, reason } = body as {
      request_id: string;
      action: 'approve' | 'reject';
      superadmin_password: string;
      reason?: string;
    };

    if (!request_id || !action || !superadmin_password) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
    }

    const expected = process.env.SUPERADMIN_PASSWORD;
    if (!expected || superadmin_password !== expected) {
      return NextResponse.json({ error: 'Mot de passe superadmin incorrect.' }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: betaReq } = await admin
      .from('radar_beta_requests')
      .select('id, user_id, status')
      .eq('id', request_id)
      .single();

    if (!betaReq) {
      return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
    }

    if (betaReq.status !== 'pending') {
      return NextResponse.json({ error: 'Demande déjà traitée' }, { status: 409 });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    await admin
      .from('radar_beta_requests')
      .update({
        status: newStatus,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        reason: reason ?? null,
      })
      .eq('id', request_id);

    if (action === 'approve') {
      await admin
        .from('profiles')
        .update({ radar_beta: true })
        .eq('id', betaReq.user_id);

      const downloadUrl = `${new URL(request.url).origin}/api/radar/capture/download`;
      const messageContent = [
        'Votre acces Radar ATC BETA a ete approuve.',
        '',
        "Telechargement de l'outil Radar Capture :",
        downloadUrl,
        '',
        'Etapes rapides :',
        '1) Ouvrez le lien ci-dessus',
        "2) Lancez RadarCapture.exe",
        '3) Collez votre token API depuis "Mon compte"',
        '4) Calibrez la minimap puis demarrez la capture',
      ].join('\n');

      await admin.from('messages').insert({
        destinataire_id: betaReq.user_id,
        expediteur_id: null,
        titre: 'Acces Radar BETA approuve + telechargement',
        contenu: messageContent,
        type_message: 'systeme',
      });
    } else {
      await admin.from('messages').insert({
        destinataire_id: betaReq.user_id,
        expediteur_id: null,
        titre: 'Demande Radar BETA refusee',
        contenu:
          reason?.trim() ||
          'Votre demande Radar ATC BETA a ete refusee. Vous pouvez refaire une demande plus tard depuis "Mon compte".',
        type_message: 'systeme',
      });
    }

    return NextResponse.json({ ok: true, status: newStatus });
  } catch (err) {
    console.error('Beta request review error:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
