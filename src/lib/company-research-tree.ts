export type CompanyResearch = {
  id: string; title: string; domain: string; description: string; panel: string | null;
  unlock_key: string | null; cost: number; delay_seconds: number; prerequisites: string[];
  status: 'locked' | 'available' | 'running' | 'completed'; ready_at: string | null;
};

/** Only place discoveries supplied by the server. Missing ancestors stay private. */
export function buildResearchTree(items: CompanyResearch[], domain: string) {
  const visible = items.filter(item => item.domain === domain);
  const byId = new Map(visible.map(item => [item.id,item]));
  const depths = new Map<string,number>();
  const depthOf = (id:string, visiting = new Set<string>()):number => {
    if (depths.has(id)) return depths.get(id)!;
    if (visiting.has(id)) return 0;
    const next = new Set(visiting); next.add(id);
    const parents = (byId.get(id)?.prerequisites ?? []).filter(parent=>byId.has(parent)&&parent!==id);
    const depth = parents.length ? 1+Math.max(...parents.map(parent=>depthOf(parent,next))) : 0;
    depths.set(id,depth); return depth;
  };
  visible.forEach(item=>depthOf(item.id));
  const occupied = new Map<number,Set<number>>();
  const rows = new Map<string,number>();
  let rootRow=0;
  const ordered = [...visible].sort((a,b)=>depthOf(a.id)-depthOf(b.id)||a.id.localeCompare(b.id));
  const nodes=ordered.map(item=>{
    const depth=depthOf(item.id);
    const parentRows=item.prerequisites.map(id=>rows.get(id)).filter((row):row is number=>row!==undefined);
    let row=parentRows.length ? Math.round(parentRows.reduce((a,b)=>a+b,0)/parentRows.length) : rootRow++;
    const taken=occupied.get(depth)??new Set<number>();
    while(taken.has(row)) row++;
    taken.add(row); occupied.set(depth,taken); rows.set(item.id,row);
    return {id:item.id,x:300+depth*310,y:66+row*142,depth,item};
  });
  const edges=visible.flatMap(item=>item.prerequisites.filter(parent=>byId.has(parent)&&parent!==item.id).map(from=>({from,to:item.id})));
  return {nodes,edges,width:Math.max(1050,...nodes.map(node=>node.x+310)),height:Math.max(600,...nodes.map(node=>node.y+160))};
}

export function researchAncestors(items: CompanyResearch[], id: string) {
  const byId=new Map(items.map(item=>[item.id,item]));
  const result=new Set<string>();
  const visit=(key:string)=>{
    if(result.has(key)||!byId.has(key)) return;
    result.add(key); byId.get(key)!.prerequisites.forEach(visit);
  };
  visit(id); return result;
}

export function researchCountdown(readyAt:string|null,now:number) {
  const end=readyAt?Date.parse(readyAt):NaN;
  if(!Number.isFinite(end)) return 'Échéance indisponible';
  const total=Math.max(0,Math.ceil((end-now)/1000));
  if(!total) return 'Vérification de la fin…';
  const days=Math.floor(total/86400),hours=Math.floor(total%86400/3600),minutes=Math.floor(total%3600/60),seconds=total%60;
  return `${days?`${days} j `:''}${String(hours).padStart(2,'0')} h ${String(minutes).padStart(2,'0')} min ${String(seconds).padStart(2,'0')} s`;
}
