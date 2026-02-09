import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

const TYPES_VALIDES = [
  'PPL', 'CPL', 'ATPL',
  'IR ME',
  'Qualification Type',
  'CAT 3', 'CAT 4', 'CAT 5', 'CAT 6',
  'C1', 'C2', 'C3', 'C4', 'C6',
  'CLASS-M', 'CLASS-MT', 'CLASS-MRP',
  'IFR', 'VFR',
  'COM 1', 'COM 2', 'COM 3', 'COM 4', 'COM 5', 'COM 6',
  'CAL-ATC', 'CAL-AFIS',
  'PCAL-ATC', 'PCAL-AFIS',
  'LPAFIS', 'LATC',
] as const;

const TYPES_COM = ['COM 1', 'COM 2', 'COM 3', 'COM 4', 'COM 5', 'COM 6'] as const;
const isTypeCom = (type: string): boolean => (TYPES_COM as readonly string[]).includes(type);
const TYPE_QUALIFICATION_TYPE = 'Qualification Type';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';

    let targetUserId = user.id;
    if (userId && isAdmin) {
      targetUserId = userId;
    } else if (userId && userId !== user.id) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('licences_qualifications')
      .select('id, type, type_avion_id, langue, date_delivrance, date_expiration, a_vie, note, created_at, types_avion(nom, constructeur)')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data: data || [] });
  } catch (e) {
    console.error('Licences GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const body = await request.json();
    const { user_id, type, type_avion_id, langue, date_delivrance, date_expiration, a_vie, note } = body;

    if (!type || !TYPES_VALIDES.includes(type)) {
      return NextResponse.json({ error: 'Type de licence invalide' }, { status: 400 });
    }

    if (!user_id) return NextResponse.json({ error: 'user_id requis' }, { status: 400 });

    const admin = createAdminClient();
    const { data: targetUser } = await admin.from('profiles').select('id').eq('id', user_id).single();
    if (!targetUser) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 400 });

    const row: any = {
      user_id: targetUser.id,
      type: String(type).trim(),
      a_vie: Boolean(a_vie),
      created_by: user.id,
    };

    if (type === TYPE_QUALIFICATION_TYPE) {
      if (!type_avion_id) return NextResponse.json({ error: 'type_avion_id requis pour Qualification Type' }, { status: 400 });
      row.type_avion_id = type_avion_id;
    } else {
      row.type_avion_id = null;
    }

    if (isTypeCom(type)) {
      if (!langue || !String(langue).trim()) return NextResponse.json({ error: 'langue requise pour COM' }, { status: 400 });
      row.langue = String(langue).trim();
    } else {
      row.langue = null;
    }

    if (date_delivrance) {
      row.date_delivrance = String(date_delivrance);
    }

    if (date_expiration && !a_vie) {
      row.date_expiration = String(date_expiration);
    } else if (a_vie) {
      row.date_expiration = null;
    }

    if (note) {
      row.note = String(note).trim();
    }

    const { data, error } = await admin.from('licences_qualifications').insert(row).select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error('Licences POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
