import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !key) return NextResponse.json({ hasAdmin: false });
    const supabase = createClient(url, key);
    const { count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'admin');
    return NextResponse.json({ hasAdmin: (count ?? 0) > 0 });
  } catch {
    return NextResponse.json({ hasAdmin: false });
  }
}
