import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isChefDeBrigade } from '@/lib/siavi/permissions';
export async function PATCH(request: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    try {
        const { data: { user } } = await (await createClient()).auth.getUser();
        if (!user)
            return NextResponse.json({ error: 'Connexion requise' }, { status: 401 });
        const admin = createAdminClient();
        if (!await isChefDeBrigade(admin, user.id))
            return NextResponse.json({ error: 'Réservé au chef de brigade' }, { status: 403 });
        const { id } = await params;
        const body = await request.json();
        if (!['rename', 'maintenance', 'release', 'repair'].includes(body.action) || (body.action === 'rename' && (typeof body.name !== 'string' || body.name.length > 80))) {
            return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
        }
        const { data, error } = await admin.rpc('manage_siavi_aircraft', { p_actor: user.id, p_aircraft: id, p_action: body.action, p_name: body.action === 'rename' ? body.name.trim() : null });
        if (error)
            return NextResponse.json({ error: error.code === 'P0001' ? error.message : 'Opération indisponible. Réessayez.' }, { status: 409 });
        return NextResponse.json(data);
    }
    catch {
        return NextResponse.json({ error: 'Impossible de modifier cet appareil' }, { status: 500 });
    }
}
