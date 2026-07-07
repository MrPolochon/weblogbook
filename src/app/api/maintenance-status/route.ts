import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('app_maintenance')
      .select('active, message, maintenance_until')
      .eq('id', 1)
      .single();

    if (error || !data) {
      return NextResponse.json({ active: false, message: '', maintenance_until: null });
    }

    // Si maintenance_until est passé et que active=true → désactiver automatiquement
    if (data.active && data.maintenance_until) {
      const until = new Date(data.maintenance_until).getTime();
      if (until < Date.now()) {
        await admin
          .from('app_maintenance')
          .update({ active: false })
          .eq('id', 1);
        return NextResponse.json({
          active: false,
          message: data.message ?? '',
          maintenance_until: data.maintenance_until,
        });
      }
    }

    return NextResponse.json({
      active: data.active,
      message: data.message ?? 'Le site est en cours de mise à jour. Veuillez patienter.',
      maintenance_until: data.maintenance_until ?? null,
    });
  } catch {
    return NextResponse.json({ active: false, message: '', maintenance_until: null });
  }
}
