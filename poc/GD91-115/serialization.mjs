import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {createSection,numberInitial} from '../GD91-07/planner.mjs';
import {build} from '../GD91-110/layout.mjs';
const reports=[];
for(const [name,character] of [['three-byte','界'],['escaped-control','\u0001']]){
 const model=numberInitial(createSection({name:character.repeat(100),rows:256,columns:16,axis:'horizontal',seatOrder:'reverse',stagePosition:'left',
  lines:Array.from({length:256},()=>({name:character.repeat(64),prefix:character.repeat(48),startNumber:9007199254740000}))},{maxCells:4096}),
  Object.fromEntries(Array.from({length:4096},(_,i)=>[Math.floor(i/16)+','+i%16,i<1000?'seat':['unset','space','aisle','gap'][i%4]])),{maxCells:4096});
 for(const seat of model.seats){seat.reservedLabel=character.repeat(100);seat.emergencyChange={kind:'add',reason:character.repeat(200)};}
 const manual=model.seats[0];manual.numberingMode='manual';manual.manualNumber=character.repeat(64);delete manual.prefix;delete manual.number;
 let maxBodyBytes=0,requestBodies=0,totalRequestBodyBytes=0,maxBodyKind;
 await build(async(path,method,body)=>{
  const bytes=Buffer.byteLength(JSON.stringify(body));requestBodies++;totalRequestBodyBytes+=bytes;
  if(bytes>maxBodyBytes){maxBodyBytes=bytes;maxBodyKind=path.endsWith('/meta')?'metadata':'atomic-patch';}
 },'candidate',[model]);
 assert(maxBodyBytes<1048576,'exceeds-conservative-1MiB-comparison');
 reports.push({name,cells:4096,seats:1000,sections:1,numberingLines:256,requestBodies,maxBodyBytes,maxBodyKind,totalRequestBodyBytes,serverAcceptanceVerified:false});
}
assert(reports[1].maxBodyBytes>reports[0].maxBodyBytes);
const paths=['serialization.mjs','../GD91-07/planner.mjs','../GD91-110/layout.mjs','../GD91-104/geometry.mjs','../GD91-102/layout-model.mjs'];
const sourceHashes=Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
fs.writeFileSync(new URL('artifacts/serialization-summary.json',import.meta.url),JSON.stringify({sourceHashes,endSourceHashes:sourceHashes,reports,method:'Actual layout write plans serialized in memory. Escaped control is a byte-size stress input, not an approved display format.',externalFirebaseConnected:false,productionImplementation:false,tested3000:false},null,2)+'\n');
console.log(JSON.stringify({maximumWriteBodies:reports.map(x=>x.maxBodyBytes),serverAcceptanceVerified:false,externalFirebaseConnected:false}));
