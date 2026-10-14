import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {runMinimalCases} from './minimal-cases.mjs';
import {actor,request,trial,owner,user,session,ok} from '../GD91-84/transport.mjs';
import {createQueue} from '../GD91-96/queue.mjs';import {cleanup} from '../GD91-89/support.mjs';
const files=['release-probe.mjs','minimal-cases.mjs','quarantine.mjs','quarantine-rules.mjs','database.rules.json','../GD91-96/queue.mjs','../GD91-84/transport.mjs','../GD91-89/support.mjs'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,createHash('sha256').update(fs.readFileSync(new URL(f,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')])),before=hashes();let result,clean;
try{
 ok(await request('.settings/rules',{token:'owner',method:'PUT',body:JSON.parse(fs.readFileSync(new URL('database.rules.json',import.meta.url),'utf8'))}));
 const human=await actor('password'),a={human,device:await actor(),sessionRevision:0},b={human,device:await actor(),sessionRevision:0};
 const io={performanceId:trial.split('/')[1],owner:(p,m='GET',body)=>owner(trial+(p?'/'+p:''),m,body),normal:(f,p,m='GET',body)=>user(p,f.device,m,body),issue:async f=>ok(await user('sessions/'+f.device.uid,f.human,'PUT',session(f,++f.sessionRevision)))};
 await runMinimalCases(io,a,b);
 await io.owner('devices/'+a.device.uid+'/active','PUT',true);await io.issue(a);
 const event=await io.owner('quarantine/'+a.device.uid+'/events/1000000001'),id=event.layoutReferenceId,record=await io.owner('references/'+id);
 const queue=createQueue({user:io.normal,loadState:async()=>({lease:{id,record},queue:[]}),saveState:async()=>{}});
 await queue.release(a);assert.equal(await io.owner('generations/layout/refs/'+id),null);
 assert(await io.owner('quarantine/'+a.device.uid+'/events/1000000001'));
 result={unreviewedQuarantineExists:true,recoveredDeviceReleasedReference:true,serverReviewHoldMissing:true,productionDefect:false,baselineOnly:true};
}finally{clean=await cleanup();}
assert.deepEqual(before,hashes());fs.writeFileSync(new URL('artifacts/release-gap-summary.json',import.meta.url),JSON.stringify({sourceHashes:before,endSourceHashes:hashes(),...result,cleanup:clean,externalFirebaseConnected:false,productionFreeTierVerified:false,tested3000:false},null,2)+'\n');console.log(JSON.stringify({baselineReleaseGapReproduced:true,cleanup:clean}));
process.exit(0);
