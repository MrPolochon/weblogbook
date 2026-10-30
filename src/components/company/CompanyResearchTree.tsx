'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Clock3, FlaskConical, GitBranch, Leaf, LockKeyhole, Maximize2, Minus, Network, Package, Plus, Search, ShieldCheck, Sofa, Users, Wifi, Wrench } from 'lucide-react';
import { buildResearchTree, researchAncestors, researchCountdown, type CompanyResearch } from '@/lib/company-research-tree';
import styles from './CompanyResearchTree.module.css';

const accents=['#5ee5b1','#f6be6a','#94baff','#dca2ff','#5ad8f4','#c8b5ff','#f3a2c4','#9bdba9'];
const icons=[Leaf,Wrench,Users,Sofa,Wifi,Network,Package,ShieldCheck];
const prefixes=['ENE','MAI','PER','CAB','NUM','RES','LOG','GOU'];
const money=(value:number)=>`${value.toLocaleString('fr-FR',{maximumFractionDigits:2})} F$`;
const duration=(seconds:number)=>{const minutes=Math.ceil(seconds/60);const hours=Math.floor(minutes/60);return hours?`${hours} h${minutes%60?` ${minutes%60} min`:''}`:`${minutes} min`;};
const utc=(value:string|null)=>value?`${new Date(value).toLocaleString('fr-FR',{timeZone:'UTC',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})} UTC`:'À confirmer';
const labels={available:'Disponible',running:'En recherche',completed:'Acquise',locked:'Prérequis requis'};

export default function CompanyResearchTree({research,busy,onFinance,onRefresh}:{research:CompanyResearch[];busy:boolean;onFinance:(item:CompanyResearch)=>void;onRefresh?:()=>void}) {
  const [domain,setDomain]=useState('');
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [query,setQuery]=useState('');
  const [zoom,setZoom]=useState(1);
  const [now,setNow]=useState(()=>Date.now());
  const viewport=useRef<HTMLDivElement>(null);
  const pointer=useRef<{id:number;x:number;y:number;left:number;top:number}|null>(null);
  const refreshed=useRef(new Set<string>());
  const active=research.filter(item=>item.status==='running');
  const domains=[...new Set(research.map(item=>item.domain))].sort((a,b)=>{
    const prefix=(name:string)=>research.find(item=>item.domain===name)?.id.split('-')[0]??'';
    return prefixes.indexOf(prefix(a))-prefixes.indexOf(prefix(b));
  });
  const selected=research.find(item=>item.id===selectedId)??null;
  const selectedDomain=domains.includes(domain)?domain:'';
  const normalized=query.trim().toLocaleLowerCase('fr');
  const matches=(item:CompanyResearch)=>!normalized||`${item.title} ${item.description} ${item.domain}`.toLocaleLowerCase('fr').includes(normalized);
  const matching=research.filter(matches);
  const layout=buildResearchTree(research,selectedDomain);
  const ancestry=researchAncestors(research,selected?.id??'');
  const byId=new Map(layout.nodes.map(node=>[node.id,node]));
  const domainIndex=Math.max(0,domains.indexOf(selectedDomain));
  const accent=accents[domainIndex%accents.length];
  const selectedNode=byId.get(selectedId??'');
  const selectedX=selectedNode?.x, selectedY=selectedNode?.y;

  useEffect(()=>{
    const element=viewport.current;
    if(!element) return;
    if(!selectedDomain) setZoom(Math.max(.45,Math.min(1,(element.clientWidth-20)/1120,(element.clientHeight-20)/680)));
    else setZoom(1);
    element.scrollTo?.({left:0,top:0});
  },[selectedDomain]);
  useEffect(()=>{
    const element=viewport.current;
    if(!element||selectedX===undefined||selectedY===undefined) return;
    element.scrollTo?.({left:Math.max(0,(selectedX+118)*zoom-element.clientWidth/2),top:Math.max(0,(selectedY+47)*zoom-element.clientHeight/2)});
  },[selectedId,selectedDomain,selectedX,selectedY,zoom]);

  useEffect(()=>{
    if(!active.length) return;
    setNow(Date.now());
    const timer=window.setInterval(()=>setNow(Date.now()),1000);
    return()=>window.clearInterval(timer);
  },[active.length]);
  useEffect(()=>{
    if(!onRefresh) return;
    const due=active.filter(item=>item.ready_at&&Date.parse(item.ready_at)<=now&&!refreshed.current.has(item.id));
    if(due.length){due.forEach(item=>refreshed.current.add(item.id));onRefresh();}
  },[active,now,onRefresh]);

  function explore(name:string){setDomain(name);setSelectedId(null);setZoom(1);viewport.current?.scrollTo?.({left:0,top:0});}
  function select(item:CompanyResearch){setDomain(item.domain);setSelectedId(item.id);}
  function fit(){
    const width=viewport.current?.clientWidth??1000;
    const height=viewport.current?.clientHeight??600;
    setZoom(Math.max(.45,Math.min(1,(width-20)/(selectedDomain?layout.width:1120),(height-20)/(selectedDomain?layout.height:680))));
    viewport.current?.scrollTo?.({left:0,top:0});
  }

  return <div className={styles.research}>
    <section className={styles.activeSection} aria-label="Recherches en cours">
      <header><span><FlaskConical size={17}/> Laboratoire de la compagnie</span><strong>{active.length} / 3 en cours</strong></header>
      <div className={styles.activeSlots}>
        {active.map(item=><button type="button" key={item.id} className={styles.activeProject} onClick={()=>select(item)} aria-label={`Suivre la recherche : ${item.title}`}>
          <span className={styles.activeIcon}><FlaskConical size={19}/></span><span><strong>{item.title}</strong><time role="timer" aria-live="off" dateTime={item.ready_at??undefined} data-research-countdown={item.id}>{researchCountdown(item.ready_at,now)}</time><span className={styles.progress}><span style={{width:`${Math.max(0,Math.min(100,100*(1-((Date.parse(item.ready_at??'')-now)/1000)/Math.max(1,item.delay_seconds))))||0}%`}}/></span></span>
        </button>)}
        {Array.from({length:Math.max(0,3-active.length)},(_,index)=><div className={styles.emptySlot} key={`slot-${index}`}><Plus size={17}/><span>Un emplacement libre<small>Sélectionnez une recherche dans l’arbre</small></span></div>)}
      </div>
      {active.length>=3&&<p className={styles.capacity}>Le laboratoire est occupé. Une place se libérera à la fin d’une recherche.</p>}
    </section>

    <div className={styles.toolbar}>
      <div className={styles.breadcrumb}><button type="button" onClick={()=>explore('')} aria-current={!selectedDomain?'page':undefined}><GitBranch size={17}/>Arbre technologique</button>{selectedDomain&&<><span>/</span><strong>{selectedDomain}</strong></>}</div>
      <label className={styles.search}><Search size={16}/><input aria-label="Rechercher une recherche dans l’arbre" type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Trouver une recherche…"/></label>
    </div>
    {normalized&&<div className={styles.searchResults} aria-label="Recherches correspondantes">{matching.length?matching.map(item=><button type="button" key={item.id} onClick={()=>select(item)}>{item.title}<small>{item.domain}</small></button>):<p>Aucune recherche révélée ne correspond à votre recherche.</p>}</div>}
    <nav className={styles.domainTabs} aria-label="Branches de recherche"><button type="button" aria-pressed={!selectedDomain} onClick={()=>explore('')}><ArrowLeft size={14}/>Vue d’ensemble</button>{domains.map(name=><button type="button" key={name} aria-pressed={name===selectedDomain} onClick={()=>explore(name)}>{name}</button>)}</nav>

    <div className={styles.workspace}>
      <section className={styles.map} aria-label="Carte de l’arbre de recherche">
        <div className={styles.mapHeading}><span><span className={styles.liveDot}/> {selectedDomain?'Parcours de recherche':'Choisissez votre spécialisation'}</span><div className={styles.mapControls}><button type="button" onClick={()=>setZoom(value=>Math.max(.45,Math.round((value-.15)*100)/100))} aria-label="Réduire le zoom"><Minus size={15}/></button><span>{Math.round(zoom*100)} %</span><button type="button" onClick={()=>setZoom(value=>Math.min(1.6,Math.round((value+.15)*100)/100))} aria-label="Agrandir le zoom"><Plus size={15}/></button><button type="button" onClick={fit} aria-label="Adapter l’arbre à l’écran"><Maximize2 size={15}/></button></div></div>
        <div ref={viewport} className={styles.viewport} tabIndex={0} aria-label="Arbre navigable : faites défiler pour explorer les branches" onPointerDown={event=>{
          if(event.pointerType==='touch'||event.button!==0||(event.target as HTMLElement).closest('button,input,a'))return;
          const element=event.currentTarget;pointer.current={id:event.pointerId,x:event.clientX,y:event.clientY,left:element.scrollLeft,top:element.scrollTop};element.setPointerCapture(event.pointerId);
        }} onPointerMove={event=>{const start=pointer.current;if(!start||start.id!==event.pointerId)return;event.currentTarget.scrollLeft=start.left-(event.clientX-start.x);event.currentTarget.scrollTop=start.top-(event.clientY-start.y);}} onPointerUp={()=>{pointer.current=null;}} onPointerCancel={()=>{pointer.current=null;}}>
          <div className={styles.sceneSize} style={{width:(selectedDomain?layout.width:1120)*zoom,height:(selectedDomain?layout.height:680)*zoom}}>
            <div className={styles.scene} style={{width:selectedDomain?layout.width:1120,height:selectedDomain?layout.height:680,transform:`scale(${zoom})`,'--branch-color':accent} as React.CSSProperties}>
              {!selectedDomain?<>
                <svg aria-hidden className={styles.connectors} width="1120" height="680" viewBox="0 0 1120 680">{domains.map((name,index)=>{
                  const left=index<4;const y=82+(index%4)*155;const edge=left?292:828;
                  return <path key={name} d={`M ${left?450:670} 340 C ${left?362:758} 340, ${left?375:745} ${y+43}, ${edge} ${y+43}`} stroke={accents[index%accents.length]} className={styles.domainEdge}/>;
                })}</svg>
                <div className={styles.core}><svg aria-hidden viewBox="0 0 240 240"><polygon points="120,4 222,62 222,178 120,236 18,178 18,62"/><polygon points="120,22 206,71 206,169 120,218 34,169 34,71"/></svg><GitBranch size={28}/><strong>RECHERCHE<br/>& DÉVELOPPEMENT</strong><span>Votre compagnie, ses possibilités</span></div>
                {domains.map((name,index)=>{const Icon=icons[index%icons.length];const running=active.some(item=>item.domain===name);const highlighted=!normalized||matching.some(item=>item.domain===name);return <button key={name} type="button" aria-label={`Explorer le domaine : ${name}`} className={styles.domainNode} data-dimmed={!highlighted} onClick={()=>explore(name)} style={{left:index<4?40:828,top:82+(index%4)*155,'--branch-color':accents[index%accents.length]} as React.CSSProperties}><span className={styles.domainIcon}><Icon size={23}/></span><span><strong>{name}</strong><small>{running?'Recherche en cours':'Explorer cette branche'}<span>↗</span></small></span></button>;})}
              </>:<>
                <svg aria-hidden className={styles.connectors} width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`}>
                  {layout.nodes.filter(node=>!layout.edges.some(edge=>edge.to===node.id)).map(node=><path key={`root-${node.id}`} d={`M 154 78 V ${node.y+47} H ${node.x}`} className={styles.rootEdge}/>)}
                  {layout.edges.map(edge=>{const from=byId.get(edge.from)!;const to=byId.get(edge.to)!;const hot=ancestry.has(edge.from)&&ancestry.has(edge.to);return <path key={`${edge.from}-${edge.to}`} d={`M ${from.x+236} ${from.y+47} C ${from.x+274} ${from.y+47},${to.x-38} ${to.y+47},${to.x} ${to.y+47}`} className={styles.prerequisiteEdge} data-active={hot}/>;})}
                </svg>
                <div className={styles.branchOrigin}><GitBranch size={22}/><strong>{selectedDomain}</strong><span>Développez votre savoir-faire</span></div>
                {layout.nodes.map(node=><button key={node.id} type="button" aria-label={`Examiner la recherche : ${node.item.title}`} aria-pressed={selectedId===node.id} data-status={node.item.status} data-dimmed={!matches(node.item)&&!ancestry.has(node.id)} className={styles.researchNode} style={{left:node.x,top:node.y}} onClick={()=>select(node.item)}><span className={styles.nodeIcon}>{node.item.status==='completed'?<Check size={19}/>:node.item.status==='running'?<FlaskConical size={19}/>:node.item.status==='locked'?<LockKeyhole size={19}/>:<GitBranch size={19}/>}</span><span><strong>{node.item.title}</strong><small>{labels[node.item.status]}</small></span><span className={styles.nodePort}/></button>)}
              </>}
            </div>
          </div>
        </div>
        <footer className={styles.legend}><span><i data-status="available"/>Disponible</span><span><i data-status="running"/>En recherche</span><span><i data-status="completed"/>Acquise</span><p>L’arbre se dévoile au fil de vos recherches.</p></footer>
      </section>

      <aside className={styles.inspector} aria-label="Détails de la recherche sélectionnée">
        {selected?<><span className={styles.inspectorEyebrow}>{selected.domain}</span><span className={styles.status} data-status={selected.status}>{labels[selected.status]}</span><h3>{selected.title}</h3><p>{selected.description}</p><dl><div><dt>Investissement</dt><dd>{money(selected.cost)}</dd></div><div><dt>Déploiement</dt><dd>{duration(selected.delay_seconds)}</dd></div></dl>
          {!!selected.prerequisites.length&&<div className={styles.requirements}><h4>Prérequis</h4>{selected.prerequisites.map(id=>{const parent=research.find(item=>item.id===id);return <p key={id}>{parent?.status==='completed'?<Check size={14}/>:<LockKeyhole size={14}/>} {parent?.title??'Recherche préalable à découvrir'}</p>;})}</div>}
          {selected.status==='running'&&<div className={styles.timerDetail}><Clock3 size={17}/><time role="timer" aria-live="off" dateTime={selected.ready_at??undefined} data-research-countdown={selected.id}>{researchCountdown(selected.ready_at,now)}</time><small>Échéance : {utc(selected.ready_at)}</small></div>}
          {selected.status==='completed'&&<p className={styles.unlocked}><Check size={16}/>{selected.panel?'Recherche acquise. Les réglages et dossiers disponibles se trouvent dans Services et contrats.':'Cette recherche est acquise pour la compagnie.'}</p>}
          {selected.status==='available'&&<><button type="button" className={styles.finance} disabled={busy||active.length>=3} onClick={()=>onFinance(selected)}><FlaskConical size={17}/>Financer la recherche</button><small className={styles.finePrint}>{active.length>=3?'Attendez qu’une recherche en cours se termine.':'Le financement sera confirmé avant tout débit.'}</small></>}
        </>:<div className={styles.inspectorEmpty}><GitBranch size={38}/><h3>Une direction à explorer</h3><p>Choisissez une branche puis un jalon pour voir ses possibilités, ses prérequis et son déploiement.</p><div><span><Check size={15}/>Progrès conservé</span><span><Clock3 size={15}/>Déploiement dans le temps</span></div></div>}
      </aside>
    </div>
  </div>;
}
