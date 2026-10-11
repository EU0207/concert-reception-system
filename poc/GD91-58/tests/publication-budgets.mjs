import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const source=read('../firestore.rules'),prior=read('../../GD91-47/firestore.rules');
function functions(s){const out=new Map();for(const m of s.matchAll(/^    function (\w+)\(/gm)){let start=s.indexOf('{',m.index),end=start+1,depth=1;while(depth){if(s[end]==='{')depth++;if(s[end]==='}')depth--;end++;}out.set(m[1],s.slice(m.index,end));}return out;}
const current=functions(source),old=functions(prior);
for(const[name,body]of old){if(['newSectionCandidate','replacementCandidate','publicationProof'].includes(name))continue;assert.equal(current.get(name),body,name);}
function refs(name,stack=[]){assert(!stack.includes(name));const body=current.get(name);assert(body,name);let n=(body.match(/(?<![\w.])(?:get|getAfter|exists|existsAfter)\(/g)||[]).length;for(const child of current.keys()){const times=(body.slice(body.indexOf('{')).match(new RegExp('(?<![\\w.])'+child+'\\(','g'))||[]).length;if(times)n+=times*refs(child,[...stack,name]);}return n;}
const central=refs('manager')+refs('nextEvent'),assignment=refs('assignmentUpdate'),event=refs('eventCreate');
export const referenceUpperBounds={publication:[central+refs('publication'),assignment,event],assignmentProbe:[central+refs('assignmentProbe'),assignment-refs('publicationChild'),event-refs('publicationProof')]};
assert.deepEqual(referenceUpperBounds,{publication:[8,6,6],assignmentProbe:[9,3,3]});
for(const group of Object.values(referenceUpperBounds)){assert(Math.max(...group)<=10);assert(group.reduce((a,b)=>a+b,0)<=20);}
const issuer=s=>s.slice(s.indexOf('    match /publicationShows/{p}/candidates/{g}'),s.indexOf('      allow update,delete: if false;',s.indexOf('    match /publicationShows/{p}/candidates/{g}')));
assert.equal(issuer(source),issuer(read('../../GD91-57/firestore.rules')));
if(process.argv[1]?.endsWith('publication-budgets.mjs'))console.log(JSON.stringify({referenceUpperBounds,cacheDiscount:false,ordinaryCandidateIssuerUnchanged:true}));
