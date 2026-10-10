import fs from 'node:fs';
import assert from 'node:assert/strict';
import {budgets as previousBudgets} from '../../GD91-44/tests/budgets.mjs';

const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const source=read('../firestore.rules');
let construction=read('../../GD91-42/firestore.rules');
const names=[...construction.matchAll(/function (\w+)\(/g)].map(x=>x[1]);
for(const n of names)construction=construction.replace(new RegExp('\\b'+n+'\\(','g'),'construction_'+n+'(');
construction=construction.replace('allow update: if construction_manager(p) && construction_updateHead(p, g, resource.data, request.resource.data);',
 "allow update: if construction_manager(p) && (resource.data.status != 'countReady' || !existsAfter(/databases/$(database)/documents/publicationShows/$(p)/candidates/$(g))) && construction_updateHead(p, g, resource.data, request.resource.data);");
assert(source.startsWith(construction.slice(0,construction.lastIndexOf('  }'))));

function functions(s){
 const result=new Map();for(const m of s.matchAll(/^    function (\w+)\(/gm)){
  const begin=s.indexOf('{',m.index);let depth=1,end=begin+1;
  while(depth&&end<s.length){if(s[end]==='{')depth++;if(s[end]==='}')depth--;end++;}
  assert.equal(depth,0);result.set(m[1],s.slice(m.index,end));
 }return result;
}
const current=functions(source),old=functions(read('../../GD91-44/firestore.rules'));
for(const[name,body]of old)assert.equal(current.get(name),body,name);
function refs(name,stack=[]){
 assert(!stack.includes(name));const text=current.get(name);assert(text,name);
 let count=(text.match(/(?<![\w.])(?:get|getAfter|exists|existsAfter)\(/g)||[]).length;
 for(const child of current.keys()){
  const times=(text.slice(text.indexOf('{')).match(new RegExp('(?<![\\w.])'+child+'\\(','g'))||[]).length;
  if(times)count+=times*refs(child,[...stack,name]);
 }return count;
}
export const budgets={...previousBudgets,candidateEmission:[refs('manager')+refs('initialCandidate')]};
assert.deepEqual(budgets.candidateEmission,[8]);
assert(source.includes('m.changedSeatIds == []')&&source.includes('b.sections == {}'));
assert(source.includes('allow create: if manager(p) && initialCandidate(p,g,request.resource.data); allow update, delete: if false;'));
for(const b of Object.values(budgets)){assert(Math.max(...b)<=10);assert(b.reduce((a,b)=>a+b,0)<=20);}
if(process.argv[1]?.endsWith('budgets.mjs'))console.log(JSON.stringify({budgets,constructionFunctionsPreserved:names.length,publicationFunctionsPreserved:old.size,sourceSealExtraReference:1,cacheDiscount:false}));
