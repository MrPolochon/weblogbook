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
 * Sous-dossiers explicitement autorisés dans le bucket cartes-identite.
 * Les dossiers UUID à la racine (photos de cartes d'identité des pilotes)
 * sont volontairement exclus pour protéger la vie privée.
 */
const ALLOWED_PREFIXES: { bucket: string; prefix: string }[] = [
  { bucket: 'cartes-identite', prefix: 'avions' },      // photos d'avions de compagnie
  { bucket: 'cartes-identite', prefix: 'compagnies' },  // logos de compagnies
];

/**
 * GET /api/login-logo
 *
 * Retourne une URL d'image aléatoire depuis les sous-dossiers autorisés
 * de Supabase Storage. Exclut les photos personnelles (cartes d'identité).
 * Fallback vers les images locales si aucune image trouvée.
 */
export async function GET() {
  try {
    const admin = createAdminClient();
    const allImageUrls: string[] = [];

    await Promise.all(
      ALLOWED_PREFIXES.map(async ({ bucket, prefix }) => {
        const paths: string[] = [];
        await listImagePaths(admin, bucket, prefix, paths, 200, 0);

        for (const filePath of paths) {
          const { data: { publicUrl } } = admin.storage
            .from(bucket)
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
