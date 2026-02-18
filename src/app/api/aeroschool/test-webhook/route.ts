import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const { webhook_url, webhook_role_id } = await request.json();

    if (!webhook_url || typeof webhook_url !== 'string') {
      return NextResponse.json({ error: 'URL webhook manquante' }, { status: 400 });
    }

    const payload: Record<string, unknown> = {
      embeds: [
        {
          title: '🧪 Test Webhook — AeroSchool',
          description: 'Ce message confirme que le webhook est correctement configuré.\nLes réponses aux formulaires seront envoyées ici.',
          color: 0x10B981,
          fields: [
            { name: 'Statut', value: '✅ Connexion réussie', inline: true },
            { name: 'Envoyé par', value: user.email || 'Admin', inline: true },
          ],
          footer: {
            text: `AeroSchool — ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
          },
          timestamp: new Date().toISOString(),
        },
      ],
    };

    if (webhook_role_id && /^\d+$/.test(webhook_role_id)) {
      payload.content = `<@&${webhook_role_id}>`;
      payload.allowed_mentions = { roles: [webhook_role_id] };
    }

    const res = await fetch(webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json({ error: `Discord a répondu ${res.status}: ${text}` }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[AeroSchool] Test webhook error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
