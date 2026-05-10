import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Charge la photo de profil officielle (carte d'identite) pour un ensemble
 * d'utilisateurs. La source de verite a l'echelle du site pour la "photo de
 * profil" est `cartes_identite.photo_url` : c'est la meme image qui s'affiche
 * sur la carte d'identification du joueur. Toutes les pages doivent donc
 * utiliser cette meme URL pour leur avatar utilisateur.
 *
 * Renvoie une Map<userId, photoUrl> (les utilisateurs sans carte/photo sont
 * absents de la map). Tolerant aux erreurs : retourne une Map vide en cas de
 * probleme Supabase plutot que de faire planter la page consommatrice.
 */
export async function getUserPhotosMap(
  admin: SupabaseClient,
  userIds: ReadonlyArray<string>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return out;
  try {
    const { data } = await admin
      .from('cartes_identite')
      .select('user_id, photo_url')
      .in('user_id', ids);
    for (const row of data || []) {
      const uid = (row as { user_id: string }).user_id;
      const url = (row as { photo_url: string | null }).photo_url;
      if (uid && url) out.set(uid, url);
    }
  } catch (e) {
    console.error('getUserPhotosMap:', e);
  }
  return out;
}

/**
 * Variante utile cote messagerie / lieux ou on n'a que l'identifiant texte
 * et pas l'UUID : indexe par identifiant.
 */
export async function getUserPhotosByIdentifiant(
  admin: SupabaseClient,
  identifiants: ReadonlyArray<string>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const norm = Array.from(new Set(identifiants.filter(Boolean)));
  if (norm.length === 0) return out;
  try {
    const { data: profs } = await admin
      .from('profiles')
      .select('id, identifiant')
      .in('identifiant', norm);
    const idToIdent = new Map<string, string>();
    const ids: string[] = [];
    for (const p of profs || []) {
      const row = p as { id: string; identifiant: string };
      idToIdent.set(row.id, row.identifiant);
      ids.push(row.id);
    }
    if (ids.length === 0) return out;
    const byUser = await getUserPhotosMap(admin, ids);
    byUser.forEach((url, uid) => {
      const ident = idToIdent.get(uid);
      if (ident) out.set(ident, url);
    });
  } catch (e) {
    console.error('getUserPhotosByIdentifiant:', e);
  }
  return out;
}
