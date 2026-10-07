begin;
alter table public.plans_vol add column if not exists deroutement_at timestamptz;
alter table public.plans_vol add column if not exists deroutement_destination_initiale text;
create table if not exists public.diversion_settlements(plan_id uuid primary key references public.plans_vol(id), result jsonb not null, created_at timestamptz not null default now());
alter table public.diversion_settlements enable row level security;
revoke all on public.diversion_settlements from public,anon,authenticated;
grant all on public.diversion_settlements to service_role;
create or replace function public.diversion_cheque(p_plan uuid,p_recipient uuid,p_account uuid,p_amount bigint,p_kind text,p_company boolean,p_label text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_number text; v_company text;
begin
 if p_amount<0 or p_account is null or p_recipient is null then raise exception 'Invalid settlement recipient'; end if;
 select p.numero_vol,c.nom into v_number,v_company from public.plans_vol p left join public.compagnies c on c.id=p.compagnie_id where p.id=p_plan;
 insert into public.messages(destinataire_id,expediteur_id,titre,contenu,type_message,cheque_montant,cheque_encaisse,cheque_destinataire_compte_id,cheque_libelle,cheque_numero_vol,cheque_compagnie_nom,cheque_pour_compagnie)
 values(p_recipient,null,p_label||' - '||v_number,'Vol dérouté : recette divisée par deux, taxes aéroportuaires multipliées par vingt. '||p_label||' : '||p_amount||' F$.',p_kind,p_amount,false,p_account,p_label||' vol '||v_number,v_number,v_company,p_company);
end $$;
revoke all on function public.diversion_cheque(uuid,uuid,uuid,bigint,text,boolean,text) from public,anon,authenticated;
create or replace function public.settle_diverted_flight(p_plan uuid,p_revenue bigint,p_salary bigint,p_tax_base bigint,p_pilot_account uuid,p_copilot_account uuid,p_company_account uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 p public.plans_vol%rowtype; c public.compagnies%rowtype; v_existing jsonb; v_rate numeric; v_tax bigint; v_salary bigint; v_royalty bigint:=0; v_net bigint; v_before bigint; v_loss bigint:=0; v_part bigint; v_count integer; v_account uuid; v_session uuid; r record; v_loan public.prets_bancaires%rowtype; v_repay bigint:=0; v_alliance public.alliance_parametres%rowtype; v_alliance_tax bigint:=0; v_codeshare bigint:=0; v_cs_pct numeric; v_result jsonb;
begin
 select * into p from public.plans_vol where id=p_plan for update;
 if not found or p.deroutement_at is null or not p.vol_commercial or p.compagnie_id is null or p.accepted_at is null then raise exception 'Invalid diverted flight'; end if;
 select result into v_existing from public.diversion_settlements where plan_id=p_plan;
 if found then return v_existing; end if;
 if p_revenue<0 or p_salary<0 or p_tax_base<0 then raise exception 'Invalid settlement amounts'; end if;
 select * into c from public.compagnies where id=p.compagnie_id;
 if not found then raise exception 'Missing company'; end if;
 if not exists(select 1 from public.felitz_comptes where id=p_company_account and compagnie_id=p.compagnie_id and type='entreprise') or not exists(select 1 from public.felitz_comptes where id=p_pilot_account and proprietaire_id=p.pilote_id and type='personnel') then raise exception 'Invalid settlement accounts'; end if;
 if p.copilote_id is not null and p.copilote_id<>p.pilote_id and not exists(select 1 from public.felitz_comptes where id=p_copilot_account and proprietaire_id=p.copilote_id and type='personnel') then raise exception 'Invalid copilot account'; end if;
 select case when p.type_vol='VFR' then taxe_vfr_pourcent else taxe_pourcent end into v_rate from public.taxes_aeroport where code_oaci=p.aeroport_arrivee;
 v_rate:=coalesce(v_rate,case when p.type_vol='VFR' then 5 else 2 end);
 v_tax:=round(p_tax_base*v_rate*20/100); v_salary:=p_salary;
 if p.location_loueur_compagnie_id is not null then v_royalty:=greatest(0,round((p_revenue-v_tax)*coalesce(p.location_pourcentage_revenu_loueur,0)/100)); end if;
 v_net:=p_revenue-v_tax-v_royalty-v_salary;
 if exists(select 1 from public.ground_service_requests where plan_vol_id=p_plan and statut='completed') then v_salary:=v_salary+round(v_salary*.10); v_net:=p_revenue-v_tax-v_royalty-v_salary+round(greatest(0,v_net)*.05); end if;
 v_before:=v_net;
 -- A negative operating result is charged atomically, even when it causes an overdraft.
 if v_net<0 then
   v_loss:=-v_net;
   update public.felitz_comptes set solde=solde-v_loss where id=p_company_account;
   insert into public.felitz_transactions(compte_id,type,montant,libelle) values(p_company_account,'debit',v_loss,'Déficit déroutement vol '||p.numero_vol);
 end if;
 if v_net>0 then
   select * into v_loan from public.prets_bancaires where compagnie_id=p.compagnie_id and statut='actif' for update;
   if found then
     v_repay:=least(round(v_net*.30),greatest(0,v_loan.montant_total_du-v_loan.montant_rembourse));
     update public.prets_bancaires set montant_rembourse=montant_rembourse+v_repay,statut=case when montant_rembourse+v_repay>=montant_total_du then 'rembourse' else statut end,rembourse_at=case when montant_rembourse+v_repay>=montant_total_du then now() else rembourse_at end where id=v_loan.id;
     v_net:=v_net-v_repay;
   end if;
   if c.alliance_id is not null then
     select * into v_alliance from public.alliance_parametres where alliance_id=c.alliance_id;
     if found then
       if v_alliance.taxe_alliance_actif then
         v_alliance_tax:=round(v_net*least(100,greatest(0,coalesce(v_alliance.taxe_alliance_pourcent,0)))/100);
         if v_alliance_tax>0 then
           select id into v_account from public.felitz_comptes where alliance_id=c.alliance_id and type='alliance' limit 1;
           if v_account is null then raise exception 'Missing alliance account'; end if;
           update public.felitz_comptes set solde=solde+v_alliance_tax where id=v_account;
           insert into public.felitz_transactions(compte_id,type,montant,libelle) values(v_account,'credit',v_alliance_tax,'Taxe alliance déroutement '||p.numero_vol);
           v_net:=v_net-v_alliance_tax;
         end if;
       end if;
       if v_alliance.codeshare_actif then
         select codeshare_pourcent into v_cs_pct from public.alliance_membres where alliance_id=c.alliance_id and compagnie_id=c.id;
         select count(*) into v_count from public.alliance_membres where alliance_id=c.alliance_id and compagnie_id<>c.id;
         if v_count>0 and coalesce(v_cs_pct,0)>0 then
           v_part:=floor(v_net*least(v_cs_pct,100)/100/v_count);
           for r in select m.compagnie_id,cc.pdg_id from public.alliance_membres m join public.compagnies cc on cc.id=m.compagnie_id where m.alliance_id=c.alliance_id and m.compagnie_id<>c.id loop
             select id into v_account from public.felitz_comptes where compagnie_id=r.compagnie_id and type='entreprise' limit 1;
             perform public.diversion_cheque(p.id,r.pdg_id,v_account,v_part,'cheque_revenu_compagnie',true,'Codeshare déroutement');
             v_codeshare:=v_codeshare+v_part;
           end loop;
           v_net:=v_net-v_codeshare;
         end if;
       end if;
     end if;
   end if;
 end if;
 -- Preserve the existing salary split and cheque collection workflow.
 v_part:=case when p.copilote_id is not null and p.copilote_id<>p.pilote_id then ceil(v_salary/2.0) else v_salary end;
 perform public.diversion_cheque(p.id,p.pilote_id,p_pilot_account,v_part,'cheque_salaire',false,'Salaire déroutement');
 if p.copilote_id is not null and p.copilote_id<>p.pilote_id then perform public.diversion_cheque(p.id,p.copilote_id,p_copilot_account,v_salary-v_part,'cheque_salaire',false,'Salaire copilote déroutement'); end if;
 if v_net>=0 then perform public.diversion_cheque(p.id,coalesce(c.pdg_id,p.pilote_id),p_company_account,v_net,'cheque_revenu_compagnie',true,'Revenu déroutement'); end if;
 if v_royalty>0 then
   select id into v_account from public.felitz_comptes where compagnie_id=p.location_loueur_compagnie_id and type='entreprise' limit 1;
   select pdg_id into r from public.compagnies where id=p.location_loueur_compagnie_id;
   perform public.diversion_cheque(p.id,r.pdg_id,v_account,v_royalty,'cheque_revenu_compagnie',true,'Location déroutement');
 end if;
 -- Airport taxes are charged even without a controller; distribute the usual shares when present.
 select count(distinct aeroport) into v_count from public.atc_plans_controles where plan_vol_id=p.id;
 if v_count>0 then
   for r in select user_id,aeroport,floor(v_tax::numeric/v_count/count(*) over(partition by aeroport))::bigint as amount from public.atc_plans_controles where plan_vol_id=p.id order by user_id loop
     select id into v_session from public.atc_sessions where user_id=r.user_id limit 1;
     if v_session is not null then insert into public.atc_taxes_pending(user_id,session_id,plan_vol_id,montant,aeroport,description) values(r.user_id,v_session,p.id,r.amount,r.aeroport,'Taxes déroutement ×20');
     else
       select id into v_account from public.felitz_comptes where proprietaire_id=r.user_id and type='personnel' limit 1;
       perform public.diversion_cheque(p.id,r.user_id,v_account,r.amount,'cheque_taxes_atc',false,'Taxes déroutement ×20');
     end if;
   end loop;
 elsif p.current_afis_user_id is not null and exists(select 1 from public.afis_sessions where user_id=p.current_afis_user_id and est_afis) then
   perform public.pay_siavi_taxes(p.current_afis_user_id,p.id,p.aeroport_arrivee,v_tax);
 end if;
 update public.plans_vol set revenue_effectif=p_revenue,revenue_net=v_net where id=p.id;
 v_result:=jsonb_build_object('net',v_net,'salaire',v_salary,'taxes',v_tax,'deficit',v_loss,'remboursementPret',v_repay,'taxeAlliance',v_alliance_tax,'codeshare',v_codeshare);
 insert into public.diversion_settlements(plan_id,result) values(p.id,v_result);
 return v_result;
end $$;
revoke all on function public.settle_diverted_flight(uuid,bigint,bigint,bigint,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.settle_diverted_flight(uuid,bigint,bigint,bigint,uuid,uuid,uuid) to service_role;



-- Atomic destination change, including the departure of a pending MEDEVAC segment.
create or replace function public.divert_active_flight(p_plan uuid,p_user uuid,p_destination text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.plans_vol%rowtype;
begin
 select * into p from public.plans_vol where id=p_plan for update;
 if not found or p.pilote_id<>p_user then return jsonb_build_object('error','Accès refusé','status',403); end if;
 if p.statut not in ('accepte','en_cours','automonitoring') or p.deroutement_at is not null then return jsonb_build_object('error','Le vol a changé ou est déjà dérouté.','status',409); end if;
 if p_destination=p.aeroport_arrivee or not exists(select 1 from public.aeroports where code_oaci=p_destination) then return jsonb_build_object('error','Destination invalide','status',400); end if;
 if p.medevac_next_plan_id is not null then
   perform 1 from public.plans_vol where id=p.medevac_next_plan_id and pilote_id=p_user and statut='planifie_suivant' for update;
   if not found then return jsonb_build_object('error','Le segment suivant a changé.','status',409); end if;
   update public.plans_vol set aeroport_depart=p_destination,sid_depart=null,strip_sid_atc=null where id=p.medevac_next_plan_id;
 end if;
 update public.plans_vol set deroutement_at=now(),deroutement_destination_initiale=p.aeroport_arrivee,aeroport_arrivee=p_destination,star_arrivee=null,strip_star=null,route_ifr=null,strip_route=null,pending_transfer_aeroport=null,pending_transfer_position=null,pending_transfer_at=null where id=p.id;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.divert_active_flight(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.divert_active_flight(uuid,uuid,text) to service_role;
commit;

