import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { INSTRUCTION_TITRE_TYPES } from '@/lib/licence-titres-instruction';
import AnnuaireClient, { type AnnuaireEntry } from './AnnuaireClient';

export default async function AnnuairePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const titres = [...INSTRUCTION_TITRE_TYPES] as string[];

  const [licRes, adminRes] = await Promise.all([
    admin.from('licences_qualifications').select('user_id, type').in('type', titres),
    admin.from('profiles').select('id, identifiant').eq('role', 'admin'),
  ]);

  if (licRes.error) {
    return (
      <div className="card border-red-500/30 bg-red-500/5 text-red-300 text-sm">
        Erreur chargement licences : {licRes.error.message}
      </div>
    );
  }
  if (adminRes.error) {
    return (
      <div className="card border-red-500/30 bg-red-500/5 text-red-300 text-sm">
        Erreur chargement administrateurs : {adminRes.error.message}
      </div>
    );
  }

  const idSet = new Set<string>();
  for (const a of adminRes.data || []) idSet.add(a.id);
  const titreByUser = new Map<string, Set<string>>();
  for (const row of licRes.data || []) {
    const uid = row.user_id as string;
    const t = row.type as string;
    if (!titres.includes(t)) continue;
    idSet.add(uid);
    if (!titreByUser.has(uid)) titreByUser.set(uid, new Set());
    titreByUser.get(uid)!.add(t);
  }

  const allIds = Array.from(idSet);
  if (allIds.length === 0) {
    return <AnnuaireClient entries={[]} />;
  }

  const [profilesRes, discordRes] = await Promise.all([
    admin.from('profiles').select('id, identifiant, role').in('id', allIds),
    admin.from('discord_links').select('user_id, discord_username').in('user_id', allIds),
  ]);

  if (profilesRes.error) {
    return (
      <div className="card border-red-500/30 bg-red-500/5 text-red-300 text-sm">
        Erreur profils : {profilesRes.error.message}
      </div>
    );
  }
  if (discordRes.error) {
    return (
      <div className="card border-red-500/30 bg-red-500/5 text-red-300 text-sm">
        Erreur Discord : {discordRes.error.message}
      </div>
    );
  }

  const discordMap = new Map((discordRes.data || []).map((d) => [d.user_id as string, d.discord_username as string]));
  const profileById = new Map((profilesRes.data || []).map((p) => [p.id as string, p]));

  const entries: AnnuaireEntry[] = [];
  for (const id of allIds) {
    const p = profileById.get(id);
    if (!p) continue;
    const set = titreByUser.get(id);
    const titresUser = set ? INSTRUCTION_TITRE_TYPES.filter((t) => set.has(t)) : [];
    entries.push({
      id,
      identifiant: p.identifiant as string,
      isAdmin: p.role === 'admin',
      titres: [...titresUser],
      discord: discordMap.get(id) ?? null,
    });
  }

  return <AnnuaireClient entries={entries} />;
}
