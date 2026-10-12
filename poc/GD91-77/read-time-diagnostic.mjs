import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {reader} from '../GD91-73/tests/support.mjs';
import {seedMany,pub} from '../GD91-75/fixtures.mjs';
import {request,base,ok} from '../GD91-60/tests/transport.mjs';
const f={show:randomUUID()},scope={schemaVersion:1,environmentId:'FAKE-environment',performanceId:f.show};
await seedMany([[pub(f,'control/current'),{...scope,state:'operating',revision:1}],
  [pub(f,'receiptEvents/'+randomUUID()),{...scope,eventId:randomUUID(),receivedAt:{$timestamp:'2026-01-01T00:00:00Z'}}]]);
const a=await reader(f);
const query={structuredQuery:{from:[{collectionId:'receiptEvents'}],limit:1}};
const url=base+'/publicationShows/'+f.show+':runQuery';
const initial=await request(url,a.device.token,'POST',query);ok(initial);
const readTime=initial.body.filter(x=>x.readTime).at(-1).readTime;
const roleResponse=await request(base+'/'+pub(f,'roles/'+a.person.uid),'owner');ok(roleResponse);
// 既存取得ヘルパーで認可本文を読む。結果へUID・トークン・本文は出さない。
const {data}=await import('../GD91-60/tests/transport.mjs');
await seedMany([[pub(f,'roles/'+a.person.uid),{...data(roleResponse),active:false,revision:2}]]);
const reports=[];
for(const [id,token,selector] of [['revoked-current',a.device.token,{}],['revoked-historical',a.device.token,{readTime}],
  ['anonymous-current',null,{}],['anonymous-historical',null,{readTime}]]){
  const r=await request(url,token,'POST',{...query,...selector});
  reports.push({id,httpStatus:r.status,documents:Array.isArray(r.body)?r.body.filter(x=>x.document).length:0});
}
const hash=p=>createHash('sha256').update(fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex');
const result={sourceHashes:Object.fromEntries(['read-time-diagnostic.mjs','receipt.rules','node_modules/.cache/firestore.rules'].map(p=>[p,hash(p)])),
  reports,productionReproduced:false,safeToAdoptHistoricalRead:false};
fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('artifacts/read-time-diagnostic.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
