import assert from 'node:assert/strict';
import {trial,owner,user,check,ok,denied,metrics,provision,issue} from './transport.mjs';
import {build,publish,layoutItem,rosterItem} from './generation-tests.mjs';
const diff=(after,before)=>Object.fromEntries(Object.entries(after).map(([k,v])=>[k,v-before[k]]));
export async function capacityTests(actors){
  const manager=actors.owner,results=[];
  const staff=[];for(let i=0;i<6;i++){const f=await provision('receptionist');ok(await issue(f));staff.push(f);}
  let headRevision=2;
  for(const count of [600,1000])for(const sections of [2,16])await check(`C-${count}-${sections}`,async()=>{
    const before={...metrics},id='layout-'+count+'-'+sections,roster='roster-'+count+'-'+sections;
    const cells=Array.from({length:count*2},(_,i)=>layoutItem(id+'-'+i,i<count?'seat':['gap','aisle','space','unset'][i%4],'sec'+(i%sections)));
    const people=Array.from({length:count},(_,i)=>rosterItem(roster+'-'+i));
    const layoutResult=await build(manager,id,'layout',cells,sections),rosterResult=await build(manager,roster,'roster',people);
    assert(layoutResult.maxPartBytes<=65536);assert(rosterResult.maxPartBytes<=65536);
    const operation=publish(id,++headRevision);ok(await user('',manager.device,'PATCH',operation));
    const preparation=diff(metrics,before),headBytes=Buffer.byteLength(JSON.stringify(operation.head)),initialRead={...metrics};
    for(const f of staff){
      for(let reconnect=0;reconnect<3;reconnect++){
        const first=await user('head',f.device);ok(first);let total=0;
        for(let i=0;i<layoutResult.parts;i++){const r=await user('generations/'+id+'/parts/p'+i,f.device);ok(r);total+=Object.keys(r.body.slots).length;}
        const last=await user('head',f.device);ok(last);assert.deepEqual(first.body,last.body);assert.equal(total,count*2);
      }
      denied(await user('generations/'+roster+'/parts/p0',f.device));
    }
    const reads=diff(metrics,initialRead);
    const stored=await owner(trial+'/generations/'+id),storedRoster=await owner(trial+'/generations/'+roster);
    const storageBytes=Buffer.byteLength(JSON.stringify(stored))+Buffer.byteLength(JSON.stringify(storedRoster));
    const result={people:count,sections,cells:cells.length,layoutParts:layoutResult.parts,rosterParts:rosterResult.parts,
      maxLayoutPartBytes:layoutResult.maxPartBytes,maxRosterPartBytes:rosterResult.maxPartBytes,maxRequestBytes:Math.max(layoutResult.maxRequestBytes,rosterResult.maxRequestBytes),headBytes,storageBytes,
      preparation,initialPlusTwoRestDownloadsForSixEnvironments:reads,
      measuredBodiesOnly:true,sdkReconnectMeasured:false,fullBusinessBudgetVerified:false};results.push(result);return result;
  });
  for(const result of results)assert(result.headBytes<=128);
  return results;
}
