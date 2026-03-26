import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface FolderStats {
  name: string;
  fileCount: number;
  totalSize: number;
}

interface BucketStats {
  id: string;
  name: string;
  public: boolean;
  fileCount: number;
  totalSize: number;
  folders: FolderStats[];
  biggestFiles: { name: string; path: string; size: number; mimetype: string | null; created_at: string }[];
}

async function listAllFiles(
  admin: ReturnType<typeof createAdminClient>,
  bucketId: string,
  folder: string,
): Promise<Array<{ name: string; path: string; size: number; mimetype: string | null; created_at: string; isFolder: boolean }>> {
  const { data: files } = await admin.storage.from(bucketId).list(folder || undefined, { limit: 1000 });
  if (!files) return [];

  const results: Array<{ name: string; path: string; size: number; mimetype: string | null; created_at: string; isFolder: boolean }> = [];

  for (const f of files) {
    if (!f.name || f.name.startsWith('.')) continue;
    const path = folder ? `${folder}/${f.name}` : f.name;
    const isFolder = !f.metadata || f.metadata.mimetype === undefined;

    if (isFolder) {
      const subFiles = await listAllFiles(admin, bucketId, path);
      results.push(...subFiles);
    } else {
      results.push({
        name: f.name,
        path,
        size: f.metadata?.size ?? 0,
        mimetype: f.metadata?.mimetype ?? null,
        created_at: f.created_at || '',
        isFolder: false,
      });
    }
  }

  return results;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

  const admin = createAdminClient();

  const { data: buckets } = await admin.storage.listBuckets();
  if (!buckets) return NextResponse.json({ error: 'Impossible de lister les buckets' }, { status: 500 });

  const stats: BucketStats[] = [];

  for (const bucket of buckets) {
    const allFiles = await listAllFiles(admin, bucket.id, '');

    const folderMap = new Map<string, FolderStats>();
    for (const f of allFiles) {
      const topFolder = f.path.includes('/') ? f.path.split('/')[0] : '(racine)';
      const existing = folderMap.get(topFolder) || { name: topFolder, fileCount: 0, totalSize: 0 };
      existing.fileCount += 1;
      existing.totalSize += f.size;
      folderMap.set(topFolder, existing);
    }

    const folders = Array.from(folderMap.values()).sort((a, b) => b.totalSize - a.totalSize);
    const biggestFiles = [...allFiles].sort((a, b) => b.size - a.size).slice(0, 10);
    const totalSize = allFiles.reduce((acc, f) => acc + f.size, 0);

    stats.push({
      id: bucket.id,
      name: bucket.name,
      public: bucket.public,
      fileCount: allFiles.length,
      totalSize,
      folders,
      biggestFiles,
    });
  }

  stats.sort((a, b) => b.totalSize - a.totalSize);

  return NextResponse.json({
    buckets: stats,
    totalFiles: stats.reduce((a, b) => a + b.fileCount, 0),
    totalSize: stats.reduce((a, b) => a + b.totalSize, 0),
  });
}
