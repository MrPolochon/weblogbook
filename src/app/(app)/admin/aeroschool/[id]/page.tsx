'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import FormBuilder, { type FormData } from '@/components/aeroschool/FormBuilder';

export default function AdminAeroSchoolEditPage() {
  const params = useParams();
  const id = params.id as string;
  const [form, setForm] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/aeroschool/forms/${id}`);
        if (!res.ok) throw new Error('Formulaire introuvable');
        const data = await res.json();
        setForm({
          id: data.id,
          title: data.title || '',
          description: data.description || '',
          delivery_mode: data.delivery_mode || 'review',
          webhook_url: data.webhook_url || '',
          webhook_role_id: data.webhook_role_id || '',
          is_published: Boolean(data.is_published),
          sections: Array.isArray(data.sections) ? data.sections : [],
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 text-sky-400 animate-spin" />
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400">{error || 'Formulaire introuvable'}</p>
      </div>
    );
  }

  return (
    <div className="py-4">
      <FormBuilder initial={form} />
    </div>
  );
}
