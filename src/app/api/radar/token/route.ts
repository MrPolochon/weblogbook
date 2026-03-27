import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { randomBytes, createHash } from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, radar_beta')
      .eq('id', user.id)
      .single();

    if (!profile || (profile.role !== 'admin' && !profile.radar_beta)) {
      return NextResponse.json({ error: 'Accès radar non autorisé' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const label = (body.label as string)?.slice(0, 100) || 'Radar Capture';

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const admin = createAdminClient();

    const { data: existing } = await admin
      .from('radar_api_tokens')
      .select('id')
      .eq('user_id', user.id);

    if (existing && existing.length >= 3) {
      return NextResponse.json(
        { error: 'Maximum 3 tokens par utilisateur. Supprimez-en un avant d\'en créer un nouveau.' },
        { status: 400 },
      );
    }

    const { error } = await admin.from('radar_api_tokens').insert({
      user_id: user.id,
      token_hash: tokenHash,
      label,
    });

    if (error) throw error;

    return NextResponse.json({
      token: rawToken,
      message: 'Copiez ce token maintenant. Il ne sera plus affiché.',
    });
  } catch (err) {
    console.error('Token creation error:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();

    const { data: tokens } = await admin
      .from('radar_api_tokens')
      .select('id, label, created_at, last_used_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    return NextResponse.json({ tokens: tokens ?? [] });
  } catch (err) {
    console.error('Token list error:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const tokenId = searchParams.get('id');
    if (!tokenId) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin
      .from('radar_api_tokens')
      .delete()
      .eq('id', tokenId)
      .eq('user_id', user.id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Token delete error:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
