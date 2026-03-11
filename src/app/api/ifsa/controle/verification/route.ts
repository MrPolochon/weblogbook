import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

async function checkIfsa(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, ifsa')
    .eq('id', userId)
    .single();
  return profile?.ifsa || profile?.role === 'admin';
}

/** Extrait le VBAN du libelle pour les virements : "X vers VBAN" ou "X de VBAN" */
function extraireVbanLibelle(libelle: string): string | null {
  const mVers = libelle.match(/vers\s+(\S+)$/i);
  if (mVers) return mVers[1].trim();
  const mDe = libelle.match(/de\s+(\S+)$/i);
  if (mDe) return mDe[1].trim();
  return null;
}

/** Indique si le libelle correspond à un virement */
function estVirement(libelle: string): boolean {
  return /virement/i.test(libelle) || /vers\s+\S+/i.test(libelle) || /de\s+\S+/i.test(libelle);
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    if (!await checkIfsa(supabase, user.id)) {
      return NextResponse.json({ error: 'Accès réservé à l\'IFSA' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const id = searchParams.get('id');

    if (!type || !id) {
      return NextResponse.json({ error: 'type et id requis' }, { status: 400 });
    }

    const admin = createAdminClient();
    let compteId: string | null = null;
    let soldeCompte = 0;

    if (type === 'pilote') {
      const { data: compte } = await admin
        .from('felitz_comptes')
        .select('id, solde')
        .eq('proprietaire_id', id)
        .eq('type', 'personnel')
        .maybeSingle();
      compteId = compte?.id ?? null;
      soldeCompte = compte?.solde ?? 0;
    } else if (type === 'compagnie') {
      const { data: compte } = await admin
        .from('felitz_comptes')
        .select('id, solde')
        .eq('compagnie_id', id)
        .eq('type', 'entreprise')
        .maybeSingle();
      compteId = compte?.id ?? null;
      soldeCompte = compte?.solde ?? 0;
    } else {
      return NextResponse.json({ error: 'type invalide' }, { status: 400 });
    }

    if (!compteId) {
      return NextResponse.json({
        soldeCalculee: 0,
        soldeCompte: 0,
        conforme: true,
        virements: [],
        message: 'Aucun compte associé',
      });
    }

    // Récupérer TOUTES les transactions (sans limite pour le calcul de solde)
    const { data: transactions, error: txError } = await admin
      .from('felitz_transactions')
      .select('id, type, montant, libelle, created_at')
      .eq('compte_id', compteId)
      .order('created_at', { ascending: true });

    if (txError) {
      console.error('Erreur chargement transactions:', txError);
      return NextResponse.json({ error: 'Erreur chargement transactions' }, { status: 500 });
    }

    const txList = transactions || [];
    const soldeCalculee = txList.reduce(
      (s, t) => s + (t.type === 'credit' ? t.montant : -t.montant),
      0
    );
    const conforme = soldeCalculee === soldeCompte;

    // Filtrer les virements et résoudre l'autre partie
    const virementsBruts = txList.filter((t) => estVirement(t.libelle || ''));
    const vbanUniques = Array.from(new Set(virementsBruts.map((t) => extraireVbanLibelle(t.libelle || '')).filter((v): v is string => Boolean(v))));

    const vbanToLabel = new Map<string, string>();
    for (const vban of vbanUniques) {
      const { data: compte } = await admin
        .from('felitz_comptes')
        .select('compagnie_id, proprietaire_id, alliance_id, entreprise_reparation_id')
        .eq('vban', vban)
        .maybeSingle();

      if (!compte) {
        vbanToLabel.set(vban, vban);
        continue;
      }
      if (compte.compagnie_id) {
        const { data: comp } = await admin.from('compagnies').select('nom').eq('id', compte.compagnie_id).single();
        vbanToLabel.set(vban, comp?.nom || vban);
      } else if (compte.proprietaire_id) {
        const { data: prof } = await admin.from('profiles').select('identifiant').eq('id', compte.proprietaire_id).single();
        vbanToLabel.set(vban, prof?.identifiant || vban);
      } else if (compte.alliance_id) {
        const { data: all } = await admin.from('alliances').select('nom').eq('id', compte.alliance_id).single();
        vbanToLabel.set(vban, all?.nom || vban);
      } else if (compte.entreprise_reparation_id) {
        const { data: ent } = await admin.from('entreprises_reparation').select('nom').eq('id', compte.entreprise_reparation_id).single();
        vbanToLabel.set(vban, ent?.nom || vban);
      } else {
        vbanToLabel.set(vban, vban);
      }
    }

    const virements = virementsBruts.map((t) => {
      const vban = extraireVbanLibelle(t.libelle || '');
      const label = vban ? vbanToLabel.get(vban) || vban : '—';
      return {
        id: t.id,
        type: t.type,
        montant: t.montant,
        libelle: t.libelle,
        created_at: t.created_at,
        autre_partie: vban ? { vban, label } : null,
      };
    });

    return NextResponse.json({
      soldeCalculee,
      soldeCompte,
      conforme,
      virements,
    });
  } catch (e) {
    console.error('IFSA verification GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
