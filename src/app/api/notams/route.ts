import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

function genererIdentifiant(codeAeroport: string): string {
  const lettres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const l = lettres[Math.floor(Math.random() * lettres.length)];
  const n = 1000 + Math.floor(Math.random() * 9000);
  const yy = String(new Date().getUTCFullYear()).slice(-2);
  return `${codeAeroport}-${l}${n}/${yy}`;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data, error } = await supabase
      .from('notams')
      .select('id, identifiant, code_aeroport, du_at, au_at, champ_a, champ_e, champ_d, champ_q, priorite, reference_fr, annule, created_at')
      .order('au_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data ?? []);
  } catch (e) {
    console.error('notams GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const body = await request.json();
    const { code_aeroport, du_at, au_at, champ_a, champ_e, champ_d, champ_q, priorite, reference_fr } = body;

    const code = String(code_aeroport || '').trim().toUpperCase();
    if (!code || code.length < 2) return NextResponse.json({ error: 'Code aéroport requis (ex. NTAA, LFPG).' }, { status: 400 });
    if (!du_at || typeof du_at !== 'string') return NextResponse.json({ error: 'Date et heure de début (DU) requises.' }, { status: 400 });
    if (!au_at || typeof au_at !== 'string') return NextResponse.json({ error: 'Date et heure de fin (AU) requises.' }, { status: 400 });
    if (!champ_e || typeof champ_e !== 'string' || !champ_e.trim()) return NextResponse.json({ error: 'Description (champ E) requise.' }, { status: 400 });

    const du = new Date(du_at);
    const au = new Date(au_at);
    if (isNaN(du.getTime())) return NextResponse.json({ error: 'Date de début (DU) invalide.' }, { status: 400 });
    if (isNaN(au.getTime())) return NextResponse.json({ error: 'Date de fin (AU) invalide.' }, { status: 400 });
    if (au.getTime() <= du.getTime()) return NextResponse.json({ error: 'La date de fin (AU) doit être après la date de début (DU).' }, { status: 400 });

    const admin = createAdminClient();
    let identifiant = genererIdentifiant(code);
    for (let i = 0; i < 5; i++) {
      const { data: ex } = await admin.from('notams').select('id').eq('identifiant', identifiant).single();
      if (!ex) break;
      identifiant = genererIdentifiant(code);
    }

    const row = {
      identifiant,
      code_aeroport: code,
      du_at: du.toISOString(),
      au_at: au.toISOString(),
      champ_a: (champ_a != null && String(champ_a).trim()) ? String(champ_a).trim() : null,
      champ_e: String(champ_e).trim(),
      champ_d: (champ_d != null && String(champ_d).trim()) ? String(champ_d).trim() : null,
      champ_q: (champ_q != null && String(champ_q).trim()) ? String(champ_q).trim() : null,
      priorite: (priorite != null && ['A', 'B', 'C'].includes(String(priorite))) ? String(priorite) : null,
      reference_fr: (reference_fr != null && String(reference_fr).trim()) ? String(reference_fr).trim() : null,
      created_by: user.id,
    };

    const { data, error } = await admin.from('notams').insert(row).select('id, identifiant').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: data.id, identifiant: data.identifiant });
  } catch (e) {
    console.error('notams POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
