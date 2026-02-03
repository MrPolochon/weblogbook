import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

// POST - Créer un avion pour une compagnie (admin only)
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });
    }

    const body = await request.json();
    const { compagnie_id, type_avion_id, immatriculation, nom_bapteme, aeroport_actuel } = body;

    if (!compagnie_id || !type_avion_id) {
      return NextResponse.json({ error: 'compagnie_id et type_avion_id requis' }, { status: 400 });
    }

    const admin = createAdminClient();
    
    // Vérifier que la compagnie existe
    const { data: compagnie } = await admin.from('compagnies').select('id, nom').eq('id', compagnie_id).single();
    if (!compagnie) {
      return NextResponse.json({ error: 'Compagnie introuvable' }, { status: 404 });
    }

    // Générer une immatriculation si non fournie
    let immat = immatriculation?.trim().toUpperCase();
    if (!immat) {
      const { data: immatData } = await admin.rpc('generer_immatriculation', { prefixe: 'F-' });
      immat = immatData || `F-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    }

    // Déterminer l'aéroport initial
    let aeroport = aeroport_actuel?.trim().toUpperCase();
    if (!aeroport) {
      const { data: hubPrincipal } = await admin
        .from('compagnie_hubs')
        .select('aeroport_code')
        .eq('compagnie_id', compagnie_id)
        .eq('est_hub_principal', true)
        .maybeSingle();
      aeroport = hubPrincipal?.aeroport_code || 'IRFD';
    }

    const { data: avion, error } = await admin
      .from('compagnie_avions')
      .insert({
        compagnie_id,
        type_avion_id,
        immatriculation: immat,
        nom_bapteme: nom_bapteme?.trim() || null,
        aeroport_actuel: aeroport,
        usure_percent: 100,
        statut: 'ground',
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Cette immatriculation existe déjà.' }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id: avion.id, message: `Avion ${immat} ajouté à ${compagnie.nom}` });
  } catch (e) {
    console.error('Admin avions POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// GET - Liste tous les avions de toutes les compagnies (admin only)
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('compagnie_avions')
      .select(`
        *,
        types_avion(id, nom, constructeur),
        compagnies(id, nom)
      `)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const { data: armeeAvions, error: armeeError } = await admin
      .from('armee_avions')
      .select('id, nom_personnalise, created_at, detruit, detruit_at, detruit_raison, types_avion(id, nom, constructeur)')
      .order('created_at', { ascending: false });
    if (armeeError) return NextResponse.json({ error: armeeError.message }, { status: 400 });

    const armeeMapped = (armeeAvions || []).map((a) => ({
      id: a.id,
      immatriculation: `ARM-${a.id.slice(0, 6).toUpperCase()}`,
      nom_bapteme: a.nom_personnalise || null,
      usure_percent: 100,
      aeroport_actuel: '—',
      statut: a.detruit ? 'bloque' : 'armee',
      created_at: a.created_at,
      detruit: a.detruit || false,
      detruit_at: a.detruit_at || null,
      detruit_raison: a.detruit_raison || null,
      types_avion: a.types_avion,
      compagnies: { id: 'armee', nom: 'Armée' },
      source: 'armee'
    }));

    const compagnieMapped = (data || []).map((a) => ({ ...a, source: 'compagnie' }));
    return NextResponse.json([...armeeMapped, ...compagnieMapped]);
  } catch (e) {
    console.error('Admin avions GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// PATCH - Modifier un avion (déplacer, changer statut, marquer détruit, etc.)
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });
    }

    const body = await request.json();
    const { id, aeroport_actuel, statut, usure_percent, immatriculation, nom_bapteme, detruit, detruit_raison, source } = body;

    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 });
    }

    const admin = createAdminClient();

    if (source === 'armee') {
      const updates: Record<string, unknown> = {};
      if (nom_bapteme !== undefined) updates.nom_personnalise = nom_bapteme || null;
      if (detruit === true) {
        updates.detruit = true;
        updates.detruit_at = new Date().toISOString();
        updates.detruit_raison = detruit_raison || 'Crash';
      }
      if (detruit === false) {
        updates.detruit = false;
        updates.detruit_at = null;
        updates.detruit_raison = null;
      }
      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'Aucune modification' }, { status: 400 });
      }
      const { data, error } = await admin
        .from('armee_avions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json(data);
    }

    const updates: Record<string, unknown> = {};
    if (aeroport_actuel !== undefined) updates.aeroport_actuel = aeroport_actuel.toUpperCase();
    if (statut !== undefined) updates.statut = statut;
    if (usure_percent !== undefined) updates.usure_percent = Math.max(0, Math.min(100, usure_percent));
    if (immatriculation !== undefined) updates.immatriculation = immatriculation.toUpperCase();
    if (nom_bapteme !== undefined) updates.nom_bapteme = nom_bapteme || null;
    
    // Marquer comme détruit
    if (detruit === true) {
      updates.detruit = true;
      updates.detruit_at = new Date().toISOString();
      updates.detruit_par_id = user.id;
      updates.detruit_raison = detruit_raison || 'Crash';
      updates.statut = 'bloque'; // L'avion est bloqué définitivement
      updates.usure_percent = 0;
    }
    // Restaurer un avion détruit (rare mais possible)
    if (detruit === false) {
      updates.detruit = false;
      updates.detruit_at = null;
      updates.detruit_par_id = null;
      updates.detruit_raison = null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Aucune modification' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('compagnie_avions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    console.error('Admin avions PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// DELETE - Supprimer un avion
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const source = searchParams.get('source');

    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 });
    }

    const admin = createAdminClient();
    const targetTable = source === 'armee' ? 'armee_avions' : 'compagnie_avions';
    const { error } = await admin.from(targetTable).delete().eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Admin avions DELETE:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
