'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import FormRenderer from '@/components/aeroschool/FormRenderer';

interface FormData {
  id: string;
  title: string;
  description?: string;
  sections: Array<{
    id: string;
    title: string;
    description?: string;
    questions: Array<{
      id: string;
      type: 'short_text' | 'paragraph' | 'radio' | 'checkbox' | 'dropdown' | 'linear_scale';
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
    }>;
  }>;
}

export default function AeroSchoolFormPage() {
  const params = useParams();
  const id = params.id as string;
  const [form, setForm] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/aeroschool/forms/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Formulaire introuvable');
        return r.json();
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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-lg">{error || 'Formulaire introuvable'}</p>
          <a href="/aeroschool" className="text-sky-400 hover:text-sky-300 mt-4 inline-block">
            ← Retour à AeroSchool
          </a>
        </div>
      </div>
    );
  }

  return <FormRenderer form={form} />;
}
