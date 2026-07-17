'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Loader2, Lock } from 'lucide-react';
import FormRenderer from '@/components/aeroschool/FormRenderer';

interface FormData {
  id: string;
  title: string;
  description?: string;
  time_limit_minutes?: number | null;
  antitriche_enabled?: boolean;
  requires_auth?: boolean;
  sections: Array<{
    id: string;
    title: string;
    description?: string;
    questions: Array<{
      id: string;
      type: 'short_text' | 'paragraph' | 'radio' | 'checkbox' | 'dropdown' | 'linear_scale' | 'question_module';
      title: string;
      description?: string;
      required?: boolean;
      options?: string[];
      is_graded?: boolean;
      points?: number;
      scale_min?: number;
      scale_max?: number;
      scale_min_label?: string;
      scale_max_label?: string;
      module_id?: string;
      module_count?: number;
    }>;
  }>;
}

export default function AeroSchoolFormPage() {
  const params = useParams();
  const id = params.id as string;
  const [form, setForm] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiresAuth, setRequiresAuth] = useState(false);

  useEffect(() => {
    fetch(`/api/aeroschool/forms/${id}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (r.status === 401 && data.requires_auth) {
          setRequiresAuth(true);
          throw new Error('Connexion requise');
        }
        if (!r.ok) throw new Error(data.error || 'Formulaire introuvable');
        return data;
      })
      .then((data) => setForm(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-amber-400 animate-spin" />
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          {requiresAuth ? (
            <>
              <Lock className="h-12 w-12 text-sky-400 mx-auto mb-4" />
              <p className="text-sky-200 text-lg font-semibold">Connexion requise</p>
              <p className="text-slate-400 text-sm mt-2">Ce questionnaire est réservé aux membres connectés.</p>
              <Link
                href={`/login?redirect=${encodeURIComponent(`/aeroschool/${id}`)}`}
                className="inline-block mt-6 px-6 py-3 bg-sky-500 text-white font-bold rounded-xl hover:bg-sky-400 transition-colors"
              >
                Se connecter
              </Link>
            </>
          ) : (
            <p className="text-red-400 text-lg">{error || 'Formulaire introuvable'}</p>
          )}
          <Link href="/aeroschool" className="text-sky-400 hover:text-sky-300 mt-4 inline-block">
            ← Retour à AeroSchool
          </Link>
        </div>
      </div>
    );
  }

  return <FormRenderer form={form} />;
}
