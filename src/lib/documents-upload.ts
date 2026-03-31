import { createClient } from '@/lib/supabase/server';

export const DOCUMENTS_BUCKET = 'documents';
export const DOCUMENTS_MAX_BYTES = 20 * 1024 * 1024; // 20 Mo

export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 as const, error: 'Non autorisé' };
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return { ok: false as const, status: 403 as const, error: 'Réservé aux admins' };
  return { ok: true as const, userId: user.id };
}

export function buildDocumentsStoragePath(sectionId: string, originalName: string) {
  const ext = (originalName.split('.').pop() || '').slice(0, 20);
  const base = originalName.slice(0, -(ext.length + 1)) || 'fichier';
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const uuid = crypto.randomUUID().slice(0, 8);
  return `${sectionId}/${uuid}_${safe}.${ext || 'bin'}`;
}
