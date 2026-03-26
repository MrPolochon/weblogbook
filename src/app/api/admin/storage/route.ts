import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const folder = searchParams.get('folder') || '';

  const admin = createAdminClient();

  const { data: files, error } = await admin.storage
    .from('cartes-identite')
    .list(folder || undefined, {
      limit: 500,
      sortBy: { column: 'created_at', order: 'desc' },
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = (files || [])
    .filter(f => f.name && !f.name.startsWith('.'))
    .map(f => {
      const path = folder ? `${folder}/${f.name}` : f.name;
      const isFolder = !f.metadata || f.metadata.mimetype === undefined;
      let publicUrl: string | null = null;

      if (!isFolder) {
        publicUrl = admin.storage.from('cartes-identite').getPublicUrl(path).data.publicUrl;
      }

      return {
        name: f.name,
        path,
        isFolder,
        size: f.metadata?.size ?? null,
        mimetype: f.metadata?.mimetype ?? null,
        created_at: f.created_at,
        publicUrl,
      };
    });

  return NextResponse.json({ folder, items });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const filePath = searchParams.get('path');
  if (!filePath) return NextResponse.json({ error: 'path requis' }, { status: 400 });

  const admin = createAdminClient();

  const fullUrl = admin.storage.from('cartes-identite').getPublicUrl(filePath).data.publicUrl;
  await admin.from('cartes_identite').update({ logo_url: null }).eq('logo_url', fullUrl);
  await admin.from('cartes_identite').update({ photo_url: null }).eq('photo_url', fullUrl);
  await admin.from('compagnies').update({ logo_url: null }).eq('logo_url', fullUrl);

  const { error } = await admin.storage.from('cartes-identite').remove([filePath]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
