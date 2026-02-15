import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

interface Question {
  id: string;
  type: string;
  is_graded?: boolean;
  points?: number;
  correct_answers?: string[];
  required?: boolean;
}

interface Section {
  questions?: Question[];
}

// POST — soumettre une réponse (public, pas besoin d'auth)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { answers, cheating_detected } = body;

    if (!answers || typeof answers !== 'object') {
      return NextResponse.json({ error: 'Réponses manquantes' }, { status: 400 });
    }

    const admin = createAdminClient();

    // Récupérer le formulaire
    const { data: form, error: formError } = await admin
      .from('aeroschool_forms')
      .select('*')
      .eq('id', id)
      .eq('is_published', true)
      .single();

    if (formError || !form) {
      return NextResponse.json({ error: 'Formulaire introuvable ou non publié' }, { status: 404 });
    }

    // Calculer le score si des questions sont notées
    let score = 0;
    let maxScore = 0;
    const sections: Section[] = Array.isArray(form.sections) ? form.sections : [];

    for (const section of sections) {
      const questions = Array.isArray(section.questions) ? section.questions : [];
      for (const q of questions) {
        if (q.is_graded && q.points) {
          maxScore += q.points;
          const answer = answers[q.id];
          if (answer && q.correct_answers && q.correct_answers.length > 0) {
            // Pour les questions à choix multiples (checkbox), vérifier que toutes les réponses sont correctes
            if (q.type === 'checkbox' && Array.isArray(answer)) {
              const correctSet = new Set(q.correct_answers);
              const answerSet = new Set(answer as string[]);
              if (correctSet.size === answerSet.size && Array.from(correctSet).every((a) => answerSet.has(a))) {
                score += q.points;
              }
            } else {
              // Pour les autres types, vérifier si la réponse est dans les réponses correctes
              if (q.correct_answers.includes(String(answer))) {
                score += q.points;
              }
            }
          }
        }
      }
    }

    // Si triche détectée, marquer comme trashed
    const status = cheating_detected ? 'trashed' : 'submitted';

    const responseRow = {
      form_id: id,
      answers,
      score: maxScore > 0 ? score : null,
      max_score: maxScore > 0 ? maxScore : null,
      cheating_detected: Boolean(cheating_detected),
      status,
    };

    // Mode webhook : envoyer au webhook puis ne pas stocker (sauf si triche)
    if (form.delivery_mode === 'webhook' && form.webhook_url && !cheating_detected) {
      try {
        await fetch(form.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            form_id: id,
            form_title: form.title,
            answers,
            score: maxScore > 0 ? score : null,
            max_score: maxScore > 0 ? maxScore : null,
            submitted_at: new Date().toISOString(),
          }),
        });
      } catch (webhookErr) {
        console.error('[AeroSchool] Webhook error:', webhookErr);
        // On continue même si le webhook échoue — on stocke en fallback
        const { error: insertErr } = await admin.from('aeroschool_responses').insert(responseRow);
        if (insertErr) console.error('[AeroSchool] Fallback insert error:', insertErr);
        return NextResponse.json({ ok: true, score: maxScore > 0 ? score : undefined, maxScore: maxScore > 0 ? maxScore : undefined, webhookFailed: true });
      }
      return NextResponse.json({ ok: true, score: maxScore > 0 ? score : undefined, maxScore: maxScore > 0 ? maxScore : undefined });
    }

    // Mode review ou triche : stocker en BDD
    const { error: insertErr } = await admin.from('aeroschool_responses').insert(responseRow);
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, score: maxScore > 0 ? score : undefined, maxScore: maxScore > 0 ? maxScore : undefined });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
