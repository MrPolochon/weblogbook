import { isChefDeBrigade } from '@/lib/siavi/permissions';
export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function PATCH(request: Request, {params}:{params:Promise<{id:string}>}) {
 try {
  const {id}=await params;
  const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser();
  if(!user) return NextResponse.json({error:'Non autorisé'},{status:401});
  const admin=createAdminClient(); const {data:profile}=await supabase.from('profiles').select('role').eq('id',user.id).single();
  const isAdmin=profile?.role==='admin';
  if(!isAdmin&&!(await isChefDeBrigade(admin,user.id))) return NextResponse.json({error:'Accès chef de brigade requis'},{status:403});
  const body=await request.json(); const gradeId=body.siavi_grade_id;
  if(gradeId!==null&&typeof gradeId!=='string') return NextResponse.json({error:'Grade invalide'},{status:400});
  const {data:target}=await admin.from('profiles').select('role,siavi,siavi_grade_id').eq('id',id).single();
  if(!target||(!target.siavi&&target.role!=='siavi')) return NextResponse.json({error:'Agent SIAVI introuvable'},{status:404});
  const {data:targetGrade}=target.siavi_grade_id?await admin.from('siavi_grades').select('nom').eq('id',target.siavi_grade_id).single():{data:null};
  const {data:newGrade}=gradeId?await admin.from('siavi_grades').select('id,nom').eq('id',gradeId).single():{data:null};
  if(gradeId&&!newGrade) return NextResponse.json({error:'Grade invalide'},{status:400});
  if(!isAdmin&&(id===user.id||target.role==='admin'||targetGrade?.nom==='Chef de brigade SIAVI'||newGrade?.nom==='Chef de brigade SIAVI')) return NextResponse.json({error:'Gestion du commandement réservée aux administrateurs.'},{status:403});
  const {error}=await admin.from('profiles').update({siavi_grade_id:gradeId||null}).eq('id',id);
  if(error) throw error;
  return NextResponse.json({ok:true});
 }catch(error){console.error('SIAVI grade:',error);return NextResponse.json({error:'Impossible de modifier le grade'},{status:500});}
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const admin = createAdminClient();
    
    // Retirer les droits SIAVI
    const { error } = await admin.from('profiles').update({
      siavi: false,
      siavi_grade_id: null,
    }).eq('id', id);

    if (error) throw error;

    // Supprimer la session si en cours
    await admin.from('afis_sessions').delete().eq('user_id', id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('SIAVI comptes DELETE:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
