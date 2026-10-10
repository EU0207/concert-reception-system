import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const source=read('../firestore.rules'),old=read('../../GD91-42/firestore.rules');
const auth=s=>s.slice(s.indexOf('    function scope('),s.indexOf('    function transition(')<0?s.indexOf('    // 公開境界だけの形式1。'):s.indexOf('    function transition('));
const usedAuth=s=>auth(s).replace(/^    function (active|highImpact)\(p\).*\n/gm,'');
assert.equal(usedAuth(source),usedAuth(old).replaceAll('splitSeatShows','publicationShows'));
const matches=[...source.matchAll(/^    function (\w+)\(/gm)],functions=new Map(matches.map((m,i)=>[m[1],source.slice(m.index,i+1<matches.length?matches[i+1].index:source.indexOf('    match /publicationShows/'))]));
function refs(name,stack=[]){assert(!stack.includes(name));const text=functions.get(name);assert(text,name);let n=(text.match(/(?<![\w.])(?:get|getAfter|exists)\(/g)||[]).length;for(const child of functions.keys()){const count=(text.slice(text.indexOf('{')).match(new RegExp('(?<![\\w.])'+child+'\\(','g'))||[]).length;if(count)n+=count*refs(child,[...stack,name]);}return n;}
const central=refs('manager')+refs('nextEvent'),assignment=refs('assignmentUpdate'),event=refs('eventCreate');
export const budgets={publication:[central+refs('publication'),event,assignment],sameSeatSet:[central+refs('publication'),event,assignment],assignmentProbe:[central+refs('assignmentProbe'),event-refs('publicationProof'),assignment-refs('publicationChild')]};
assert.deepEqual(budgets,{publication:[8,5,6],sameSeatSet:[8,5,6],assignmentProbe:[9,3,3]});
for(const v of Object.values(budgets)){assert(Math.max(...v)<=10);assert(v.reduce((a,b)=>a+b,0)<=20);}
if(process.argv[1]?.endsWith('budgets.mjs'))console.log(JSON.stringify({budgets,cacheDiscount:false,actualBillingMeasured:false,oldAuthorizationBodyPreserved:true}));
