import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Bot } from 'lucide-react';
import SupportBotAdminClient from './SupportBotAdminClient';

export const dynamic = 'force-dynamic';

export default async function SupportBotAdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/admin');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <Bot className="h-7 w-7 text-indigo-400" />
          Bot assistance Discord
        </h1>
        <p className="text-slate-400 mt-1 text-sm">
          Configuration en amont : panel, 11 sections, logs. Le bot ne parle que dans les tickets.
        </p>
      </div>
      <SupportBotAdminClient />
    </div>
  );
}
