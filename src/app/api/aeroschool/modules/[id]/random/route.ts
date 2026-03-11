import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

/** Question QCM dans un module */
interface ModuleQuestion {
  id: string;
  title: string;
  options: string[];
  correct_answers: string[];
}

// GET — N questions aléatoires du module (public, pour les candidats qui remplissent un formulaire)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(_request.url);
    const countParam = url.searchParams.get('count');
    const count = Math.min(100, Math.max(1, parseInt(countParam || '10', 10) || 10));

    const admin = createAdminClient();
    const { data: module, error } = await admin
      .from('aeroschool_question_modules')
      .select('questions')
      .eq('id', id)
      .single();

    if (error || !module) return NextResponse.json({ error: 'Module introuvable' }, { status: 404 });

    const questions: ModuleQuestion[] = Array.isArray(module.questions) ? module.questions : [];
    if (questions.length === 0) return NextResponse.json({ questions: [] });

    // Mélange Fisher-Yates et prendre les N premiers
    const shuffled = [...questions];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const selected = shuffled.slice(0, Math.min(count, shuffled.length));

    return NextResponse.json({ questions: selected });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
