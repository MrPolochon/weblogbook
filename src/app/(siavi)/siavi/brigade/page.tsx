import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isChefDeBrigade } from '@/lib/siavi/permissions';
import { redirect } from 'next/navigation';
import AdminSiaviComptes from '../admin/AdminSiaviComptes';
export default async function BrigadePage(){
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect('/login');
 const admin=createAdminClient();if(!(await isChefDeBrigade(admin,user.id)))redirect('/siavi');
 const [{data:profile},{data:agents,error:agentError},{data:grades,error:gradeError}]=await Promise.all([
 admin.from('profiles').select('role').eq('id',user.id).single(),
 admin.from('profiles').select('id,identifiant,role,siavi,siavi_grade_id').or('siavi.eq.true,role.eq.siavi').order('identifiant'),
 admin.from('siavi_grades').select('id,nom,ordre').order('ordre')]);
 if(agentError||gradeError)throw new Error('Impossible de charger la brigade.');
 const isAdmin=profile?.role==='admin';const chiefIds=new Set((grades??[]).filter(g=>g.nom==='Chef de brigade SIAVI').map(g=>g.id));
 const editable=(agents??[]).filter(a=>isAdmin||(a.id!==user.id&&a.role!=='admin'&&!chiefIds.has(a.siavi_grade_id)));
 return <div className="siavi-workspace siavi-enter space-y-6"><header className="rounded-2xl border border-amber-500/30 bg-slate-900 p-6"><p className="text-sm font-semibold text-amber-300">COMMANDEMENT SIAVI</p><h1 className="mt-2 text-3xl font-bold text-white">Gestion de la brigade</h1><p className="mt-3 text-slate-300">Modifiez les grades des agents. Les comptes et la nomination des chefs de brigade restent sous la responsabilité des administrateurs.</p><Link href="/siavi/flotte" className="mt-5 inline-flex min-h-12 items-center rounded-xl border border-rose-500/50 bg-rose-950 px-4 font-semibold text-rose-100">Gérer les avions et hélicoptères MEDEVAC</Link></header><AdminSiaviComptes comptes={editable} grades={(grades??[]).filter(g=>isAdmin||g.nom!=='Chef de brigade SIAVI')} canRemove={false}/></div>;
}
