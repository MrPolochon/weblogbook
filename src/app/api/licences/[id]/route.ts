import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

const TYPES_VALIDES = [
  'PPL', 'CPL', 'ATPL',
  'IR ME',
  'Qualification Type',
  'CAT 3', 'CAT 4', 'CAT 5',
  'CLASS-M', 'CLASS-MT', 'CLASS-MRP',
  'IFR', 'VFR',
  'COM 1', 'COM 2', 'COM 3', 'COM 4', 'COM 5', 'COM 6',
  'CAL-ATC', 'CAL-AFIS',
  'PCAL-ATC', 'PCAL-AFIS',
  'LPAFIS', 'LATC',
] as const;

const TYPES_COM = ['COM 1', 'COM 2', 'COM 3', 'COM 4', 'COM 5', 'COM 6'] as const;
const TYPE_QUALIFICATION_TYPE = 'Qualification Type';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const body = await request.json();
    const { type, type_avion_id, langue, date_delivrance, date_expiration, a_vie, note } = body;

    const admin = createAdminClient();
    const { data: existing } = await admin.from('licences_qualifications').select('type').eq('id', params.id).single();
    if (!existing) return NextResponse.json({ error: 'Licence introuvable' }, { status: 404 });

    const updates: any = {};

    if (type !== undefined) {
      if (!TYPES_VALIDES.includes(type)) {
        return NextResponse.json({ error: 'Type de licence invalide' }, { status: 400 });
      }
      updates.type = String(type).trim();
    }

    if (a_vie !== undefined) {
      updates.a_vie = Boolean(a_vie);
    }

    if (type === TYPE_QUALIFICATION_TYPE || existing.type === TYPE_QUALIFICATION_TYPE) {
      if (type_avion_id !== undefined) {
        if (!type_avion_id) {
          updates.type_avion_id = null;
        } else {
          const { data: avion } = await admin.from('types_avion').select('id').eq('id', type_avion_id).single();
          if (!avion) return NextResponse.json({ error: 'Type d\'avion introuvable' }, { status: 400 });
          updates.type_avion_id = type_avion_id;
        }
      }
    } else if (type_avion_id !== undefined) {
      updates.type_avion_id = null;
    }

    const currentType = type || existing.type;
    if (TYPES_COM.includes(currentType as any)) {
      if (langue !== undefined) {
        if (!langue || !String(langue).trim()) {
          return NextResponse.json({ error: 'langue requise pour COM' }, { status: 400 });
        }
        updates.langue = String(langue).trim();
      }
    } else if (langue !== undefined) {
      updates.langue = null;
    }

    if (date_delivrance !== undefined) {
      updates.date_delivrance = date_delivrance ? String(date_delivrance) : null;
    }

    if (date_expiration !== undefined) {
      const isAVie = a_vie !== undefined ? Boolean(a_vie) : existing.a_vie;
      if (isAVie) {
        updates.date_expiration = null;
      } else {
        updates.date_expiration = date_expiration ? String(date_expiration) : null;
      }
    } else if (a_vie !== undefined && Boolean(a_vie)) {
      updates.date_expiration = null;
    }

    if (note !== undefined) {
      updates.note = note ? String(note).trim() : null;
    }

    const { error } = await admin.from('licences_qualifications').update(updates).eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Licences PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const admin = createAdminClient();
    const { error } = await admin.from('licences_qualifications').delete().eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Licences DELETE:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
