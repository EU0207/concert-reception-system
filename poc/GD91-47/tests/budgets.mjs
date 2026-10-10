import fs from 'node:fs';
import assert from 'node:assert/strict';
import {budgets as previousBudgets} from '../../GD91-44/tests/budgets.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
function functions(s){const out=new Map();for(const m of s.matchAll(/^ +function (\w+)\(/gm)){let start=s.indexOf('{',m.index),end=start+1,depth=1;while(depth){if(s[end]==='{')depth++;if(s[end]==='}')depth--;end++;}out.set(m[1],s.slice(m.index,end).trim().replace(/^ +/gm,''));}return out;}
const source=read('../firestore.rules'),current=functions(source),old=functions(read('../../GD91-46/firestore.rules'));
for(const[name,body]of old){if(name==='construction_currentBase'||name==='construction_initial')continue;assert.equal(current.get(name),body,name);}
assert.equal(current.get('construction_currentBase'),old.get('construction_currentBase').replace("b.status == 'countReady' && b.sectionId","(b.status == 'countReady' || b.status == 'building' && b.cursor == b.rows * b.columns) && b.sectionId"));
assert.equal(current.get('construction_initial'),old.get('construction_initial').replace('a.basePublishedRevision > 0 && construction_currentBase','a.basePublishedRevision >= 0 && construction_currentBase'));
function refs(name,stack=[]){assert(!stack.includes(name));const body=current.get(name);assert(body,name);let n=(body.match(/(?<![\w.])(?:get|getAfter|exists|existsAfter)\(/g)||[]).length;for(const child of current.keys()){const times=(body.slice(body.indexOf('{')).match(new RegExp('(?<![\\w.])'+child+'\\(','g'))||[]).length;if(times)n+=times*refs(child,[...stack,name]);}return n;}
export const budgets={...previousBudgets,candidateEmission:[refs('manager')+refs('newSectionCandidate')],comparisonStart:[refs('construction_manager')+refs('replacementProofStart')],comparisonStep:[refs('construction_manager')+refs('replacementProofStep')],replacementEmission:[refs('manager')+refs('replacementCandidate'),refs('construction_manager')+refs('replacementSelection')]};
assert.deepEqual(budgets.candidateEmission,[8]);assert.deepEqual(budgets.comparisonStart,[10]);assert.deepEqual(budgets.comparisonStep,[8]);assert.deepEqual(budgets.replacementEmission,[9,4]);
for(const group of Object.values(budgets)){assert(Math.max(...group)<=10);assert(group.reduce((a,b)=>a+b,0)<=20);}
assert(source.includes('existsAfter(/databases/$(database)/documents/preparedSeatShows/$(p)/sections/$(sectionNamespace)/generations/$(g)/replacementProof/current)'));
if(process.argv[1]?.endsWith('budgets.mjs'))console.log(JSON.stringify({budgets,unchangedFunctions:old.size-2,cacheDiscount:false}));
