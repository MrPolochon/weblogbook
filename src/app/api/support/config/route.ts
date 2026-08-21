export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SUPPORT_MOTIFS } from '@/lib/support/motifs';
import {
  discordCreateCategory,
  discordFetch,
} from '@/lib/support/discord-api';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }) };
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Admin requis' }, { status: 403 }) };
  }
  return { user };
}

export async function GET() {
  const gate = await requireAdmin();
  if ('error' in gate && gate.error) return gate.error;
  const admin = createAdminClient();
  const { data } = await admin.from('support_bot_config').select('*').eq('id', 'default').maybeSingle();
  return NextResponse.json({ config: data, motifs: SUPPORT_MOTIFS });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if ('error' in gate && gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const guild_id = String(body.guild_id || '').trim();
  const panel_channel_id = String(body.panel_channel_id || '').trim();
  const logs_channel_id = String(body.logs_channel_id || '').trim();
  const staff_role_id = String(body.staff_role_id || '').trim();
  const provision = body.provision === true;

  if (!guild_id || !panel_channel_id || !staff_role_id) {
    return NextResponse.json(
      { error: 'guild_id, panel_channel_id et staff_role_id requis' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: existing } = await admin.from('support_bot_config').select('*').eq('id', 'default').maybeSingle();
  let category_ids: Record<string, string> = (existing?.category_ids as Record<string, string>) || {};

  if (provision) {
    try {
      const next: Record<string, string> = { ...category_ids };
      for (const motif of SUPPORT_MOTIFS) {
        if (next[motif.id]) continue;
        const cat = await discordCreateCategory(guild_id, motif.label);
        next[motif.id] = cat.id;
      }
      category_ids = next;

      const panelPayload = {
        content: null,
        embeds: [
          {
            title: 'Assistance PTFS Logbook',
            description:
              'Ouvrez un ticket pour être aidé. Un questionnaire vous demandera la raison ; un salon privé sera créé.\n\nUn seul ticket ouvert à la fois.',
            color: 0x6366f1,
          },
        ],
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 1,
                label: 'Ouvrir un ticket',
                custom_id: 'support_open_ticket',
                emoji: { name: '🎫' },
              },
            ],
          },
        ],
      };

      let panel_message_id = existing?.panel_message_id as string | null;
      if (existing?.panel_message_id && existing?.panel_channel_id === panel_channel_id) {
        await discordFetch(`/channels/${panel_channel_id}/messages/${existing.panel_message_id}`, {
          method: 'PATCH',
          body: JSON.stringify(panelPayload),
        }).catch(async () => {
          const msg = await discordFetch(`/channels/${panel_channel_id}/messages`, {
            method: 'POST',
            body: JSON.stringify(panelPayload),
          });
          panel_message_id = msg.id;
        });
      } else {
        const msg = await discordFetch(`/channels/${panel_channel_id}/messages`, {
          method: 'POST',
          body: JSON.stringify(panelPayload),
        });
        panel_message_id = msg.id;
      }

      const { data, error } = await admin
        .from('support_bot_config')
        .upsert(
          {
            id: 'default',
            guild_id,
            panel_channel_id,
            panel_message_id,
            logs_channel_id: logs_channel_id || null,
            staff_role_id,
            category_ids,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        )
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, config: data, provisioned: true });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Erreur Discord (token bot / permissions ?)' },
        { status: 502 }
      );
    }
  }

  const { data, error } = await admin
    .from('support_bot_config')
    .upsert(
      {
        id: 'default',
        guild_id,
        panel_channel_id,
        logs_channel_id: logs_channel_id || null,
        staff_role_id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, config: data, provisioned: false });
}
