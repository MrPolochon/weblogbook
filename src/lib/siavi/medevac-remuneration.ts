export function medevacRevenue(minutes: number, helicopter: boolean): number {
 const duration=Math.max(0,Number.isFinite(minutes)?minutes:0);
 return Math.round(helicopter ? Math.min(800000,100000+3000*Math.min(duration,60)+2000*Math.max(duration-60,0)) : Math.min(1000000,150000+5000*duration));
}
export function splitMedevacRevenue(revenue:number,count:number) {
 if(!Number.isInteger(count)||count<1) throw new Error('Équipage invalide');
 const siavi=Math.floor(revenue/2),pool=revenue-siavi;
 return {siavi,crew:pool,shares:Array.from({length:count},(_,i)=>Math.floor(pool/count)+(i<pool%count?1:0))};
}
