export const dynamic = 'force-dynamic';
import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rate-limit';
import { canVirementCompteAllianceFelitz } from '@/lib/co-pdg-utils';
import { virerFelitzAvecTrace } from '@/lib/felitz/atomic';

// POST - Effectuer un virement
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const rl = rateLimit(`virement:${user.id}`, 10, 60_000);
    if (!rl.allowed) return NextResponse.json({ error: 'Trop de virements, réessayez dans une minute' }, { status: 429 });

    const body = await req.json();
    const { compte_source_id, vban_destination, montant: rawMontant, libelle } = body;

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!compte_source_id || !UUID_REGEX.test(String(compte_source_id))) {
      return NextResponse.json({ error: 'compte_source_id invalide' }, { status: 400 });
    }
    const normalizedVbanDestination = typeof vban_destination === 'string'
      ? vban_destination.trim().toUpperCase()
      : '';
    if (!normalizedVbanDestination || normalizedVbanDestination.length > 40 || !/^[A-Z0-9]+$/.test(normalizedVbanDestination)) {
      return NextResponse.json({ error: 'vban_destination invalide' }, { status: 400 });
    }
    const montant = Number(rawMontant);
    if (!Number.isFinite(montant) || montant <= 0 || montant > 999_999_999 || Math.floor(montant) !== montant) {
      return NextResponse.json({ error: 'Montant invalide (entier positif requis)' }, { status: 400 });
    }

    // Libellé obligatoire pour virements > 1 000 000 F$
    if (montant > 1_000_000 && (!libelle || !String(libelle).trim())) {
      return NextResponse.json(
        { error: 'Le libellé est obligatoire pour les virements supérieurs à 1 000 000 F$' },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    // Compte source + profil en parallèle (indépendants).
    const [{ data: compteSource }, { data: profile }] = await Promise.all([
      admin.from('felitz_comptes')
        .select('id, solde, vban, type, proprietaire_id, compagnie_id, alliance_id')
        .eq('id', compte_source_id)
        .maybeSingle(),
      supabase.from('profiles').select('role').eq('id', user.id).single(),
    ]);

    if (!compteSource) {
      return NextResponse.json({ error: 'Compte source introuvable' }, { status: 404 });
    }
    const isAdmin = profile?.role === 'admin';
    const isOwner = compteSource.proprietaire_id === user.id;

    // Toutes les vérifs PDG / co-PDG / alliance en parallèle.
    const [pdgRes, coPdgRes, isAllianceLeader] = await Promise.all([
      compteSource.compagnie_id
        ? admin.from('compagnies').select('pdg_id').eq('id', compteSource.compagnie_id).maybeSingle()
        : Promise.resolve({ data: null }),
      compteSource.compagnie_id
        ? admin.from('compagnie_employes').select('id').eq('compagnie_id', compteSource.compagnie_id).eq('pilote_id', user.id).eq('role', 'co_pdg').maybeSingle()
        : Promise.resolve({ data: null }),
      compteSource.type === 'alliance' && compteSource.alliance_id
        ? canVirementCompteAllianceFelitz(user.id, compteSource.alliance_id, admin)
        : Promise.resolve(false),
    ]);
    const isPdg = pdgRes.data?.pdg_id === user.id;
    const isCoPdg = Boolean(coPdgRes.data);

    if (!isAdmin && !isOwner && !isPdg && !isCoPdg && !isAllianceLeader) {
      return NextResponse.json({ error: 'Non autorisé pour ce compte' }, { status: 403 });
    }

    // Vérifier solde suffisant
    if (compteSource.solde < montant) {
      return NextResponse.json({ error: 'Solde insuffisant' }, { status: 400 });
    }

    // Trouver le compte destination — maybeSingle() pour 404 propre.
    const { data: compteDest } = await admin.from('felitz_comptes')
      .select('id, solde, vban')
      .eq('vban', normalizedVbanDestination)
      .maybeSingle();

    if (!compteDest) {
      return NextResponse.json({ error: 'VBAN destination introuvable' }, { status: 404 });
    }

    // Interdire virement vers le même compte
    if (compteSource.id === compteDest.id) {
      return NextResponse.json({ error: 'Virement vers le même compte impossible' }, { status: 400 });
    }

    // Virement atomique (débit + crédit + 2 lignes d'historique dans une seule
    // transaction PG). Si quoi que ce soit échoue, tout est rollback : impossible
    // d'avoir un solde modifié sans trace correspondante.
    const libelleVirement = libelle || 'Virement';
    const transferRes = await virerFelitzAvecTrace(admin, {
      compteSourceId: compte_source_id,
      compteDestId: compteDest.id,
      montant,
      libelleSource: `${libelleVirement} vers ${normalizedVbanDestination}`,
      libelleDest: `${libelleVirement} de ${compteSource.vban}`,
    });
    if (!transferRes.ok) {
      return NextResponse.json(
        { error: transferRes.error || 'Solde insuffisant ou virement impossible' },
        { status: 400 },
      );
    }

    // Enregistrer le virement
    const { data: virement, error: virementError } = await admin.from('felitz_virements').insert({
      compte_source_id,
      compte_dest_vban: normalizedVbanDestination,
      montant,
      libelle,
      created_by: user.id
    }).select().single();

    if (virementError) {
      console.error('Erreur enregistrement virement:', virementError);
      // Ne pas retourner d'erreur car le virement a réussi
    }

    return NextResponse.json({ ok: true, virement });
  } catch (e) {
    console.error('Felitz virement POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// GET - Historique des virements
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const compteId = searchParams.get('compte_id');

    const admin = createAdminClient();
    if (compteId) {
      const [{ data: compte }, { data: profile }] = await Promise.all([
        admin.from('felitz_comptes')
          .select('id, proprietaire_id, compagnie_id, type, alliance_id')
          .eq('id', compteId).maybeSingle(),
        supabase.from('profiles').select('role').eq('id', user.id).single(),
      ]);
      if (!compte) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 });
      const isAdmin = profile?.role === 'admin';
      const isOwner = compte.proprietaire_id === user.id;

      const [pdgRes, coPdgRes, isAllianceLeader] = await Promise.all([
        compte.compagnie_id
          ? admin.from('compagnies').select('pdg_id').eq('id', compte.compagnie_id).maybeSingle()
          : Promise.resolve({ data: null }),
        compte.compagnie_id
          ? admin.from('compagnie_employes').select('id').eq('compagnie_id', compte.compagnie_id).eq('pilote_id', user.id).eq('role', 'co_pdg').maybeSingle()
          : Promise.resolve({ data: null }),
        compte.type === 'alliance' && compte.alliance_id
          ? canVirementCompteAllianceFelitz(user.id, compte.alliance_id, admin)
          : Promise.resolve(false),
      ]);
      const isPdg = pdgRes.data?.pdg_id === user.id;
      const isCoPdg = Boolean(coPdgRes.data);

      if (!isAdmin && !isOwner && !isPdg && !isCoPdg && !isAllianceLeader) {
        return NextResponse.json({ error: 'Non autorisé pour ce compte' }, { status: 403 });
      }
    }

    let query = admin.from('felitz_virements')
      .select('*')
      .order('created_at', { ascending: false });

    if (compteId) {
      query = query.eq('compte_source_id', compteId);
    } else {
      query = query.eq('created_by', user.id);
    }

    const { data, error } = await query.limit(50);
    if (error) return NextResponse.json({ error: 'Erreur lors du chargement' }, { status: 400 });

    return NextResponse.json(data);
  } catch (e) {
    console.error('Felitz virement GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
