export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getDiscordGuildId } from '@/lib/discord-link';
import { DEFAULT_INSTRUCTOR_MOTIFS, SUPPORT_MOTIFS } from '@/lib/support/motifs';
import {
  discordCreateCategory,
  discordFetch,
  ensureSupportGuildCommands,
} from '@/lib/support/discord-api';
import { repairOpenTicketSlashAccess } from '@/lib/support/repair-ticket-slash';

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
  const guildId = getDiscordGuildId() || data?.guild_id || null;
  return NextResponse.json({
    config: data ? { ...data, guild_id: guildId } : { guild_id: guildId },
    motifs: SUPPORT_MOTIFS,
    env_guild_id: guildId,
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if ('error' in gate && gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const guild_id = getDiscordGuildId() || String(body.guild_id || '').trim();
  const panel_channel_id = String(body.panel_channel_id || '').trim();
  const logs_channel_id = String(body.logs_channel_id || '').trim();
  const staff_role_id = String(body.staff_role_id || '').trim();
  const instructor_role_id = String(body.instructor_role_id || '').trim() || null;
  const rawMotifs = Array.isArray(body.instructor_motifs) ? body.instructor_motifs : [];
  const allowedMotifIds = new Set(SUPPORT_MOTIFS.map((m) => m.id));
  const instructor_motifs = rawMotifs
    .map((id: unknown) => String(id))
    .filter((id: string) => allowedMotifIds.has(id as (typeof SUPPORT_MOTIFS)[number]['id']));
  const instructorMotifsStored =
    instructor_motifs.length > 0 ? instructor_motifs : [...DEFAULT_INSTRUCTOR_MOTIFS];
  const provision = body.provision === true;
  const repair_slash = body.repair_slash === true;

  if (!guild_id) {
    return NextResponse.json({ error: 'DISCORD_GUILD_ID manquant sur Vercel.' }, { status: 400 });
  }

  if (repair_slash) {
    await ensureSupportGuildCommands(guild_id, { force: true });
    const result = await repairOpenTicketSlashAccess();
    return NextResponse.json({
      ok: true,
      repaired: result.repaired,
      failed: result.failed,
      message: `Commandes slash resynchronisées. ${result.repaired} ticket(s) mis à jour${result.failed ? `, ${result.failed} échec(s)` : ''}.`,
    });
  }

  if (!panel_channel_id || !staff_role_id) {
    return NextResponse.json(
      { error: 'Salon du panel et rôle staff requis' },
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
            instructor_role_id,
            instructor_motifs: instructorMotifsStored,
            category_ids,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        )
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await ensureSupportGuildCommands(guild_id, { force: true });
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
        instructor_role_id,
        instructor_motifs: instructorMotifsStored,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await ensureSupportGuildCommands(guild_id, { force: true });
  return NextResponse.json({ ok: true, config: data, provisioned: false });
}
