import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isChefDeBrigade, getSiaviCompte } from '@/lib/siavi/permissions';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';
import { calculerPrixHub } from '@/lib/compagnie-utils';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const { data } = await admin.from('siavi_hubs')
      .select('*')
      .order('is_principal', { ascending: false })
      .order('created_at', { ascending: true });

    return NextResponse.json(data || []);
  } catch (e) {
    console.error('SIAVI hubs GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const chefOk = await isChefDeBrigade(admin, user.id);
    if (!chefOk) {
      return NextResponse.json({ error: 'Réservé au Chef de brigade SIAVI' }, { status: 403 });
    }

    const { aeroport_oaci, is_principal } = await req.json();
    const code = String(aeroport_oaci || '').toUpperCase();

    if (!CODES_OACI_VALIDES.has(code)) {
      return NextResponse.json({ error: 'Code OACI invalide' }, { status: 400 });
    }

    const { data: existing } = await admin.from('siavi_hubs')
      .select('id')
      .eq('aeroport_oaci', code)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'Ce hub existe déjà' }, { status: 400 });
    }

    const { count: nbHubs } = await admin.from('siavi_hubs')
      .select('*', { count: 'exact', head: true });

    const prix = calculerPrixHub((nbHubs || 0) + 1);

    if (prix > 0) {
      const compteSiavi = await getSiaviCompte(admin);
      if (!compteSiavi) {
        return NextResponse.json({ error: 'Compte SIAVI introuvable' }, { status: 404 });
      }

      if (Number(compteSiavi.solde) < prix) {
        return NextResponse.json({
          error: `Solde SIAVI insuffisant. Prix du hub : ${prix.toLocaleString('fr-FR')} F$, solde : ${Number(compteSiavi.solde).toLocaleString('fr-FR')} F$.`
        }, { status: 400 });
      }

      const { debiterFelitzAvecTrace, crediterFelitzAvecTrace } = await import('@/lib/felitz/atomic');
      const debitRes = await debiterFelitzAvecTrace(admin, {
        compteId: compteSiavi.id,
        montant: prix,
        libelle: `Achat hub SIAVI ${code}`,
      });
      if (!debitRes.ok) {
        return NextResponse.json({ error: 'Solde insuffisant (transaction concurrente)' }, { status: 400 });
      }

      // Insertion du hub APRÈS le débit. Si elle échoue, on rembourse avec
      // une trace de compensation (au lieu d'un crédit silencieux qui
      // laissait un débit orphelin dans l'historique).
      if (is_principal) {
        await admin.from('siavi_hubs').update({ is_principal: false }).eq('is_principal', true);
      }
      const makePrincipal = is_principal || (nbHubs || 0) === 0;
      const { error: insertErr } = await admin.from('siavi_hubs').insert({
        aeroport_oaci: code,
        is_principal: makePrincipal,
      });
      if (insertErr) {
        await crediterFelitzAvecTrace(admin, {
          compteId: compteSiavi.id,
          montant: prix,
          libelle: `Annulation achat hub SIAVI ${code} (échec création)`,
        });
        return NextResponse.json({ error: 'Erreur création hub' }, { status: 500 });
      }
    } else {
      // Hub gratuit (premier hub) : pas de mouvement financier
      if (is_principal) {
        await admin.from('siavi_hubs').update({ is_principal: false }).eq('is_principal', true);
      }
      const makePrincipal = is_principal || (nbHubs || 0) === 0;
      const { error: insertErr } = await admin.from('siavi_hubs').insert({
        aeroport_oaci: code,
        is_principal: makePrincipal,
      });
      if (insertErr) {
        return NextResponse.json({ error: 'Erreur création hub' }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, message: `Hub ${code} créé${prix > 0 ? ` (${prix.toLocaleString('fr-FR')} F$)` : ' (gratuit)'}` });
  } catch (e) {
    console.error('SIAVI hubs POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
