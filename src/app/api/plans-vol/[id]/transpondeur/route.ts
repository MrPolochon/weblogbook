import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';

// Validation du code transpondeur (0-7 uniquement, 4 chiffres)
function validateTransponderCode(code: string): boolean {
  if (!code || code.length !== 4) return false;
  return /^[0-7]{4}$/.test(code);
}

// PATCH - Mettre à jour le code transpondeur
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await request.json();
    const { code_transpondeur, mode_transpondeur } = body;

    // Valider le code transpondeur
    if (code_transpondeur && !validateTransponderCode(code_transpondeur)) {
      return NextResponse.json(
        { error: 'Code transpondeur invalide. Utilisez 4 chiffres de 0 à 7 (ex: 1234, 7700)' },
        { status: 400 }
      );
    }

    // Valider le mode
    if (mode_transpondeur && !['A', 'C', 'S'].includes(mode_transpondeur)) {
      return NextResponse.json(
        { error: 'Mode transpondeur invalide. Utilisez A, C ou S.' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Vérifier que le plan existe et appartient à l'utilisateur
    const { data: plan, error: planError } = await admin
      .from('plans_vol')
      .select('pilote_id, statut')
      .eq('id', id)
      .single();

    if (planError || !plan) {
      return NextResponse.json({ error: 'Plan de vol non trouvé' }, { status: 404 });
    }

    // Vérifier que c'est bien le pilote du vol
    if (plan.pilote_id !== user.id) {
      return NextResponse.json(
        { error: 'Vous n\'êtes pas le pilote de ce vol' },
        { status: 403 }
      );
    }

    // Vérifier que le plan est dans un statut qui permet la modification du transpondeur
    const allowedStatuts = ['accepte', 'en_cours', 'automonitoring', 'en_attente_cloture'];
    if (!allowedStatuts.includes(plan.statut)) {
      return NextResponse.json(
        { error: 'Le transpondeur ne peut être modifié que pour un vol accepté ou en cours' },
        { status: 400 }
      );
    }

    // Mettre à jour le transpondeur
    const updateData: Record<string, string | null> = {};
    if (code_transpondeur !== undefined) {
      updateData.code_transpondeur = code_transpondeur || null;
    }
    if (mode_transpondeur !== undefined) {
      updateData.mode_transpondeur = mode_transpondeur;
    }

    const { error: updateError } = await admin
      .from('plans_vol')
      .update(updateData)
      .eq('id', id);

    if (updateError) {
      console.error('Erreur update transpondeur:', updateError);
      return NextResponse.json(
        { error: 'Erreur lors de la mise à jour du transpondeur' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erreur PATCH transpondeur:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// GET - Récupérer le code transpondeur d'un plan
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: plan, error } = await admin
      .from('plans_vol')
      .select('code_transpondeur, mode_transpondeur, pilote_id, statut')
      .eq('id', id)
      .single();

    if (error || !plan) {
      return NextResponse.json({ error: 'Plan de vol non trouvé' }, { status: 404 });
    }

    return NextResponse.json({
      code_transpondeur: plan.code_transpondeur,
      mode_transpondeur: plan.mode_transpondeur,
    });
  } catch (err) {
    console.error('Erreur GET transpondeur:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
