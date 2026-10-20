const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
function load(file){const module={exports:{}};const link=({children,...props})=>React.createElement('a',props,children);const req=n=>n==='next/link'?{__esModule:true,default:link}:require(n);new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(req,module,module.exports);return module.exports.default;}
const Pagination=load('src/components/logbook/LogbookPagination.tsx'),Overview=load('src/components/logbook/LogbookOverview.tsx');
const render=props=>renderToStaticMarkup(React.createElement(Pagination,{page:1,total:253,search:'',status:'',date:'',location:'haut',...props}));
test('253 flights show the complete count, 30 visible flights and direct access to the ninth page',()=>{
 const html=render();assert.match(html,/Vols 1 à 30 sur 253/);assert.match(html,/Page 1 sur 9/);assert.match(html,/aria-label="Page 9"/);assert.match(html,/aria-current="page"/);assert.doesNotMatch(html,/page=0/);
});
test('middle-page navigation preserves all filters and exposes accessible page links',()=>{
 const html=render({page:5,search:'IRFD / ITKO',status:'validé',date:'2026-10-01'});
 assert.match(html,/Vols 121 à 150 sur 253/);
 const links=[...html.matchAll(/href="([^"]+)"/g)].map(m=>new URL(m[1].replaceAll('&amp;','&'),'https://example.test'));
 for(const url of links){assert.equal(url.searchParams.get('q'),'IRFD / ITKO');assert.equal(url.searchParams.get('statut'),'validé');assert.equal(url.searchParams.get('date'),'2026-10-01');assert.equal(url.hash,'#historique');}
 assert.ok(links.some(u=>u.searchParams.get('page')==='4'));assert.ok(links.some(u=>u.searchParams.get('page')==='6'));
});
test('last and empty pages do not invent flights or a next page',()=>{
 const last=render({page:9});assert.match(last,/Vols 241 à 253 sur 253/);assert.doesNotMatch(last,/page=10/);
 const empty=render({total:0});assert.match(empty,/0 vol/);assert.doesNotMatch(empty,/Vols 1 à/);assert.doesNotMatch(empty,/href=/);
});
test('overview totals are independent of the 30-flight page and preserve validated hours',()=>{
 const html=renderToStaticMarkup(React.createElement(Overview,{summary:{total:253,validated:251,pending:2,refused:0,minutes:4457,types:['IFR']},initialMinutes:0}));
 assert.match(html,/>253</);assert.match(html,/>251</);assert.match(html,/>74 h 17</);assert.match(html,/Toutes les pages/);
});
