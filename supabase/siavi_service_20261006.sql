begin;
create or replace function public.answer_siavi_call(p_user uuid,p_call uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.afis_sessions%rowtype; c public.atc_calls%rowtype;
begin
 if not exists(select 1 from public.profiles where id=p_user and (role in ('admin','siavi') or siavi)) then return jsonb_build_object('error','Accès SIAVI requis','status',403); end if;
 select * into s from public.afis_sessions where user_id=p_user for update;
 if not found then return jsonb_build_object('error','Prenez votre service avant de répondre','status',403); end if;
 select * into c from public.atc_calls where id=p_call for update;
 if not found then return jsonb_build_object('error','Appel introuvable','status',404); end if;
 if c.to_user_id is distinct from p_user and not(c.is_emergency is true and c.from_user_id is distinct from p_user) then return jsonb_build_object('error','Appel non autorisé','status',403); end if;
 if c.status='connected' and c.to_user_id=p_user then return jsonb_build_object('ok',true); end if;
 if c.status is distinct from 'ringing' then return jsonb_build_object('error','Cet appel a déjà été traité','status',409); end if;
 if c.is_emergency and not s.est_afis then
   if not exists(select 1 from public.felitz_comptes where proprietaire_id=p_user and type='personnel') then raise exception 'Compte personnel manquant'; end if;
   perform public.pay_siavi_intervention(p_user,c.id,s.aeroport);
 end if;
 update public.atc_calls set status='connected',answered_at=now(),to_user_id=p_user where id=c.id;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.answer_siavi_call(uuid,uuid) from public,anon,authenticated;
grant execute on function public.answer_siavi_call(uuid,uuid) to service_role;
revoke all on function public.pay_siavi_intervention(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.pay_siavi_intervention(uuid,uuid,text) to service_role;
commit;

