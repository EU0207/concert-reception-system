import fs from 'node:fs';
import assert from 'node:assert/strict';
import {budgets as previousBudgets} from '../../GD91-44/tests/budgets.mjs';

const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const source=read('../firestore.rules');

function functions(s){
 const result=new Map();for(const m of s.matchAll(/^ +function (\w+)\(/gm)){
  const begin=s.indexOf('{',m.index);let depth=1,end=begin+1;
  while(depth&&end<s.length){if(s[end]==='{')depth++;if(s[end]==='}')depth--;end++;}
  assert.equal(depth,0);result.set(m[1],s.slice(m.index,end).trim().replace(/^ +/gm,''));
 }return result;
}
const current=functions(source),old=functions(read('../../GD91-44/firestore.rules')),previous=functions(read('../../GD91-45/firestore.rules'));
for(const[name,body]of previous)if(name.startsWith('construction_')){let expected=body.replaceAll('splitSeatShows/$(p)/','preparedSeatShows/$(p)/sections/$(sectionNamespace)/');for(const c of ['roles','devices','sessions'])expected=expected.replaceAll('preparedSeatShows/$(p)/sections/$(sectionNamespace)/'+c+'/', 'publicationShows/$(p)/'+c+'/');if(name==='construction_initial')expected=expected.replace('&& construction_uuid(a.sectionId) && a.sectionName','&& construction_uuid(a.sectionId) && a.sectionId == sectionNamespace && a.sectionName');assert.equal(current.get(name),expected,name);}
for(const[name,body]of old)assert.equal(current.get(name),body,name);
function refs(name,stack=[]){
 assert(!stack.includes(name));const text=current.get(name);assert(text,name);
 let count=(text.match(/(?<![\w.])(?:get|getAfter|exists|existsAfter)\(/g)||[]).length;
 for(const child of current.keys()){
  const times=(text.slice(text.indexOf('{')).match(new RegExp('(?<![\\w.])'+child+'\\(','g'))||[]).length;
  if(times)count+=times*refs(child,[...stack,name]);
 }return count;
}
export const budgets={...previousBudgets,candidateEmission:[refs('manager')+refs('newSectionCandidate')]};
assert.deepEqual(budgets.candidateEmission,[8]);
assert(source.includes('m.changedSeatIds == []')&&source.includes('!b.sections.keys().hasAny([m.sectionId])'));
assert(source.includes('allow create: if manager(p) && newSectionCandidate(p,g,request.resource.data); allow update, delete: if false;'));
for(const b of Object.values(budgets)){assert(Math.max(...b)<=10);assert(b.reduce((a,b)=>a+b,0)<=20);}
if(process.argv[1]?.endsWith('budgets.mjs'))console.log(JSON.stringify({budgets,constructionFunctionsPreserved:165,publicationFunctionsPreserved:old.size,sourceSealExtraReference:1,cacheDiscount:false}));
