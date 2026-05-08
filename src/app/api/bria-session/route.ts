import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
    if (!apiKey || !agentId) {
      return NextResponse.json({ error: 'Configuration ElevenLabs manquante' }, { status: 500 });
    }

    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
      { headers: { 'xi-api-key': apiKey } },
    );

    if (!res.ok) {
      const body = await res.text();
      console.error('ElevenLabs signed URL error:', res.status, body);
      return NextResponse.json({ error: 'Impossible d\'obtenir la session BRIA' }, { status: 502 });
    }

    const { signed_url } = await res.json() as { signed_url: string };
    return NextResponse.json({ signedUrl: signed_url });
  } catch (e) {
    console.error('bria-session:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
