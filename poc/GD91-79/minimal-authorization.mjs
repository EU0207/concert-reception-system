import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {collection,query,limit,onSnapshot,getDocsFromServer} from '../POC-001/node_modules/firebase/firestore/dist/index.mjs';
import {actor,request,base,ok} from '../GD91-60/tests/transport.mjs';
import {seedMany} from '../GD91-75/fixtures.mjs';
import {client} from '../GD91-72/sdk-adapter.mjs';
const paths=['minimal-authorization.mjs','minimal.rules','minimal.firebase.json','../GD91-72/sdk-adapter.mjs','../GD91-60/tests/transport.mjs'];
const hashes=()=>Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
const sourceHashes=hashes(),s=randomUUID(),root='diagnostic/'+s,a=await actor(),token=a.token,c=await client(token);
const q=query(collection(c.db,root+'/items'),limit(10)),url=base+'/'+root+':runQuery',body={structuredQuery:{from:[{collectionId:'items'}],limit:10}};
let error=null,size=0,stop,report;
async function wait(test){const end=Date.now()+10000;while(!test()&&Date.now()<end)await new Promise(r=>setTimeout(r,20));return test();}
try{
  await seedMany([[root+'/access/current',{active:true,subjectUid:a.uid}],[root+'/items/a',{value:'FAKE-one'}]]);
  stop=onSnapshot(q,snapshot=>{if(!snapshot.metadata.fromCache)size=snapshot.size;},e=>{error=e.code;});assert(await wait(()=>size===1));
  const before=await request(url,token,'POST',body);ok(before);const readTime=before.body.filter(x=>x.readTime).at(-1).readTime;
  await seedMany([[root+'/access/current',{active:false,subjectUid:a.uid}]]);
  const stoppedWithoutItemChange=await wait(()=>Boolean(error));
  const current=await request(url,token,'POST',body),historical=await request(url,token,'POST',{...body,readTime});
  await seedMany([[root+'/items/b',{value:'FAKE-two'}]]);await wait(()=>Boolean(error)||size>1);
  const afterItemChange={size,error};let freshError=null;
  try{await getDocsFromServer(q);}catch(e){freshError=e.code;}
  report={stoppedWithoutItemChange,observationMs:10000,currentStatus:current.status,historicalStatus:historical.status,
    historicalDocuments:Array.isArray(historical.body)?historical.body.filter(x=>x.document).length:0,afterItemChange,freshError,
    permissionDependencies:1,applicationSeatRulesUsed:false,productionReproduced:false,serverAuthorizationVerified:false,tested3000:false};
}catch(e){report={error:{message:e.message,code:e.code??null},tested3000:false};process.exitCode=1;}
finally{stop?.();await c.close();}
report.sourceHashes=sourceHashes;report.endSourceHashes=hashes();assert.deepEqual(sourceHashes,report.endSourceHashes);
fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('artifacts/minimal-authorization.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));process.exit(process.exitCode??0);
