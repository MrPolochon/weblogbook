import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const FALLBACK_IMAGES = ['/mixou-bg.png', '/ptfs-logo.jpg', '/ptfs-map.png'];
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Liste récursivement les fichiers image d'un bucket Supabase Storage.
 * Limite de profondeur (3 niveaux) et de fichiers totaux pour rester rapide.
 */
async function listImagePaths(
  admin: ReturnType<typeof createAdminClient>,
  bucketId: string,
  prefix: string,
  collected: string[],
  maxFiles: number,
  depth: number,
): Promise<void> {
  if (depth > 3 || collected.length >= maxFiles) return;

  const { data: items } = await admin.storage
    .from(bucketId)
    .list(prefix || undefined, { limit: 100, offset: 0 });

  if (!items) return;

  const subFolders: string[] = [];

  for (const item of items) {
    if (!item.name || item.name.startsWith('.')) continue;
    const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
    const isFolder = !item.metadata || item.metadata.mimetype === undefined;

    if (isFolder) {
      subFolders.push(fullPath);
    } else if (
      item.metadata?.mimetype?.startsWith('image/') &&
      collected.length < maxFiles
    ) {
      collected.push(fullPath);
    }
  }

  // Parcourir les sous-dossiers en parallèle
  await Promise.all(
    subFolders.map((folder) =>
      listImagePaths(admin, bucketId, folder, collected, maxFiles, depth + 1),
    ),
  );
}

/**
 * GET /api/login-logo
 *
 * Liste TOUS les fichiers image de TOUS les buckets publics Supabase Storage,
 * génère leurs URLs publiques et en retourne une au hasard.
 * Fallback vers les images locales si aucune image trouvée.
 */
export async function GET() {
  try {
    const admin = createAdminClient();

    // 1. Récupérer tous les buckets
    const { data: buckets, error: bucketsErr } = await admin.storage.listBuckets();
    if (bucketsErr) throw bucketsErr;

    const publicBuckets = (buckets ?? []).filter((b) => b.public);

    // 2. Lister les images de chaque bucket public en parallèle
    const allImageUrls: string[] = [];

    await Promise.all(
      publicBuckets.map(async (bucket) => {
        const paths: string[] = [];
        await listImagePaths(admin, bucket.id, '', paths, 300, 0);

        for (const filePath of paths) {
          const { data: { publicUrl } } = admin.storage
            .from(bucket.id)
            .getPublicUrl(filePath);
          allImageUrls.push(publicUrl);
        }
      }),
    );

    if (allImageUrls.length === 0) {
      return NextResponse.json(
        { url: pickRandom(FALLBACK_IMAGES), source: 'fallback' },
        { headers: NO_CACHE },
      );
    }

    return NextResponse.json(
      { url: pickRandom(allImageUrls), source: 'storage', total: allImageUrls.length },
      { headers: NO_CACHE },
    );
  } catch (err) {
    console.error('[login-logo]', err);
    return NextResponse.json(
      { url: pickRandom(FALLBACK_IMAGES), source: 'error' },
      { headers: NO_CACHE },
    );
  }
}
