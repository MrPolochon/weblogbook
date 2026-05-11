import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type OrphanFile = {
  bucket: string;
  path: string;
  name: string;
  size: number;
  mimetype: string | null;
  created_at: string;
  days_old: number;
};

type BucketReport = {
  bucket: string;
  total_files: number;
  total_size: number;
  referenced_count: number;
  orphan_count: number;
  orphan_size: number;
  orphans: OrphanFile[];
};

// ---------- Listing storage recursif ----------
async function listAllFiles(
  admin: ReturnType<typeof createAdminClient>,
  bucketId: string,
  folder = ''
): Promise<Array<{ path: string; name: string; size: number; mimetype: string | null; created_at: string }>> {
  const { data: items } = await admin.storage.from(bucketId).list(folder || undefined, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (!items) return [];

  const out: Array<{ path: string; name: string; size: number; mimetype: string | null; created_at: string }> = [];
  for (const item of items) {
    if (!item.name || item.name.startsWith('.')) continue;
    const fullPath = folder ? `${folder}/${item.name}` : item.name;
    const isFolder = !item.metadata || item.metadata.mimetype === undefined;
    if (isFolder) {
      const sub = await listAllFiles(admin, bucketId, fullPath);
      out.push(...sub);
    } else {
      out.push({
        path: fullPath,
        name: item.name,
        size: item.metadata?.size ?? 0,
        mimetype: item.metadata?.mimetype ?? null,
        created_at: item.created_at || '',
      });
    }
  }
  return out;
}

// ---------- Extraction de path depuis URL publique ----------
function extractStoragePath(value: string | null | undefined, bucket: string): string | null {
  if (!value) return null;
  const marker = `/${bucket}/`;
  const idx = value.indexOf(marker);
  if (idx >= 0) return value.substring(idx + marker.length);
  // Si c'est deja un path direct (cas documents)
  if (!value.startsWith('http')) return value;
  return null;
}

// ---------- Collecte des paths references en DB ----------
async function collectReferencedPaths(
  admin: ReturnType<typeof createAdminClient>
): Promise<{ cartesIdentite: Set<string>; documents: Set<string> }> {
  const cartesIdentite = new Set<string>();
  const documents = new Set<string>();

  const queries = await Promise.allSettled([
    admin.from('compagnies').select('logo_url'),
    admin.from('cartes_identite').select('logo_url, photo_url'),
    admin.from('alliances').select('logo_url'),
    admin.from('entreprises_reparation').select('logo_url'),
    admin.from('document_files').select('storage_path'),
    admin.from('instruction_notes_archives').select('storage_bucket, storage_path'),
  ]);

  const addCarte = (v: string | null | undefined) => {
    const p = extractStoragePath(v, 'cartes-identite');
    if (p) cartesIdentite.add(p);
  };
  const addDoc = (v: string | null | undefined) => {
    const p = extractStoragePath(v, 'documents');
    if (p) documents.add(p);
  };

  // 0 - compagnies
  if (queries[0].status === 'fulfilled') {
    for (const r of (queries[0].value.data || []) as Array<{ logo_url: string | null }>) addCarte(r.logo_url);
  }
  // 1 - cartes_identite
  if (queries[1].status === 'fulfilled') {
    for (const r of (queries[1].value.data || []) as Array<{ logo_url: string | null; photo_url: string | null }>) {
      addCarte(r.logo_url);
      addCarte(r.photo_url);
    }
  }
  // 2 - alliances
  if (queries[2].status === 'fulfilled') {
    for (const r of (queries[2].value.data || []) as Array<{ logo_url: string | null }>) addCarte(r.logo_url);
  }
  // 3 - entreprises_reparation
  if (queries[3].status === 'fulfilled') {
    for (const r of (queries[3].value.data || []) as Array<{ logo_url: string | null }>) addCarte(r.logo_url);
  }
  // 4 - document_files
  if (queries[4].status === 'fulfilled') {
    for (const r of (queries[4].value.data || []) as Array<{ storage_path: string | null }>) addDoc(r.storage_path);
  }
  // 5 - instruction_notes_archives
  if (queries[5].status === 'fulfilled') {
    for (const r of (queries[5].value.data || []) as Array<{ storage_bucket: string | null; storage_path: string | null }>) {
      if (!r.storage_path) continue;
      if (r.storage_bucket === 'documents' || !r.storage_bucket) documents.add(r.storage_path);
      else if (r.storage_bucket === 'cartes-identite') cartesIdentite.add(r.storage_path);
    }
  }

  return { cartesIdentite, documents };
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Non authentifie' }, { status: 401 }) };
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'Acces refuse' }, { status: 403 }) };
  return { user };
}

// ---------- GET : lister les orphelins ----------
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const admin = createAdminClient();
  const referenced = await collectReferencedPaths(admin);

  const refByBucket: Record<string, Set<string>> = {
    'cartes-identite': referenced.cartesIdentite,
    documents: referenced.documents,
  };

  const reports: BucketReport[] = [];
  const now = Date.now();

  for (const bucket of ['cartes-identite', 'documents']) {
    const refSet = refByBucket[bucket];
    if (!refSet) continue;

    const files = await listAllFiles(admin, bucket);
    const orphans: OrphanFile[] = [];

    for (const f of files) {
      if (refSet.has(f.path)) continue;
      const created = f.created_at ? new Date(f.created_at).getTime() : now;
      const daysOld = Math.floor((now - created) / (1000 * 60 * 60 * 24));
      orphans.push({
        bucket,
        path: f.path,
        name: f.name,
        size: f.size,
        mimetype: f.mimetype,
        created_at: f.created_at,
        days_old: daysOld,
      });
    }

    orphans.sort((a, b) => b.size - a.size);

    reports.push({
      bucket,
      total_files: files.length,
      total_size: files.reduce((s, f) => s + f.size, 0),
      referenced_count: refSet.size,
      orphan_count: orphans.length,
      orphan_size: orphans.reduce((s, f) => s + f.size, 0),
      orphans,
    });
  }

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    buckets: reports,
    total_orphan_count: reports.reduce((s, b) => s + b.orphan_count, 0),
    total_orphan_size: reports.reduce((s, b) => s + b.orphan_size, 0),
  });
}

// ---------- DELETE : supprimer une selection ----------
type DeleteBody = { items: Array<{ bucket: string; path: string }> };

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: DeleteBody;
  try {
    body = (await req.json()) as DeleteBody;
  } catch {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 });
  }

  if (!body?.items || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'Aucun fichier specifie' }, { status: 400 });
  }
  if (body.items.length > 500) {
    return NextResponse.json({ error: 'Maximum 500 fichiers par appel' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Re-verifier que ces paths sont bien orphelins (defense en profondeur)
  const referenced = await collectReferencedPaths(admin);
  const refByBucket: Record<string, Set<string>> = {
    'cartes-identite': referenced.cartesIdentite,
    documents: referenced.documents,
  };

  const ALLOWED_BUCKETS = new Set(['cartes-identite', 'documents']);
  const groups = new Map<string, string[]>();
  const skipped: Array<{ bucket: string; path: string; reason: string }> = [];

  for (const item of body.items) {
    if (!ALLOWED_BUCKETS.has(item.bucket)) {
      skipped.push({ ...item, reason: 'bucket_non_autorise' });
      continue;
    }
    const refSet = refByBucket[item.bucket];
    if (refSet?.has(item.path)) {
      skipped.push({ ...item, reason: 'reference_en_db_entre_temps' });
      continue;
    }
    const arr = groups.get(item.bucket) ?? [];
    arr.push(item.path);
    groups.set(item.bucket, arr);
  }

  let deletedCount = 0;
  const errors: Array<{ bucket: string; error: string }> = [];

  for (const [bucket, paths] of Array.from(groups.entries())) {
    if (paths.length === 0) continue;
    const { data, error } = await admin.storage.from(bucket).remove(paths);
    if (error) {
      errors.push({ bucket, error: error.message });
    } else {
      deletedCount += data?.length ?? paths.length;
    }
  }

  return NextResponse.json({
    deleted_count: deletedCount,
    skipped_count: skipped.length,
    skipped,
    errors,
  });
}
