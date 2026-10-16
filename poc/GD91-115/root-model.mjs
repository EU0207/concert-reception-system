import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {createSection,numberInitial} from '../GD91-07/planner.mjs';import {build} from '../GD91-110/layout.mjs';
const reports=[];
for(const [name,character] of [['three-byte','界'],['escaped-control','\u0001']]){
 const models=Array.from({length:16},(_,i)=>{
  const base=createSection({name:character.repeat(100),rows:1,columns:256,axis:'vertical',seatOrder:'reverse',stagePosition:'left',lines:Array.from({length:256},(_,j)=>({name:character.repeat(64),prefix:character.repeat(48),startNumber:9007199254700000+i*256+j}))},{maxCells:4096});
  const model=numberInitial(base,Object.fromEntries(base.section.cells.map(c=>[c.row+','+c.column,'seat'])),{maxCells:4096});
  for(const seat of model.seats){seat.reservedLabel=character.repeat(100);seat.emergencyChange={kind:'add',reason:character.repeat(200)};}return model;
 });
 const tree=Object.create(null);let requests=0,maxRequestBytes=0;
 const set=(path,value)=>{const keys=path.split('/');let node=tree;for(const key of keys.slice(0,-1))node=node[key]??=Object.create(null);node[keys.at(-1)]=structuredClone(value);};
 await build(async(path,method,body)=>{requests++;maxRequestBytes=Math.max(maxRequestBytes,Buffer.byteLength(JSON.stringify(body)));if(path)set(path,body);else for(const [key,value] of Object.entries(body))set(key,value);},'candidate',models);
 const serialized=JSON.stringify(tree.generations.candidate);assert.equal(tree.generations.candidate.meta.receivedCells,4096);
 assert.equal(tree.generations.candidate.meta.expectedSections,16);assert(maxRequestBytes<1048576);
 reports.push({name,sections:16,cells:4096,seatRecords:4096,attendeeRecords:0,numberingLines:4096,requests,maxRequestBytes,generationJsonBytes:Buffer.byteLength(serialized),serverAcceptanceVerified:false});
}
const paths=['root-model.mjs','../GD91-07/planner.mjs','../GD91-110/layout.mjs','../GD91-104/geometry.mjs','../GD91-102/layout-model.mjs'];
const sourceHashes=Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
fs.writeFileSync(new URL('artifacts/root-model-summary.json',import.meta.url),JSON.stringify({sourceHashes,endSourceHashes:sourceHashes,reports,method:'Combined layout size model only, no attendee or load test. Control-character case is conservative serialization stress, not an approved format.',externalFirebaseConnected:false,productionImplementation:false,tested3000People:false},null,2)+'\n');
console.log(JSON.stringify({generationBytes:reports.map(x=>x.generationJsonBytes),maxRequestBytes:reports.map(x=>x.maxRequestBytes),attendeeRecords:0,loadTest:false}));
