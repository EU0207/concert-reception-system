import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {trial,owner,user,request,provision,issue,ok,metrics} from '../GD91-84/transport.mjs';
import {build,layoutItem,publish} from '../GD91-84/generation-tests.mjs';
import {proposal} from '../GD91-86/model.mjs';import {plan as receipt} from './receipt-client.mjs';
import {command,emptyEvent,applyModel} from './model.mjs';
const files=['capacity.mjs','model.mjs','lifecycle-rules.mjs','receipt-client.mjs','receipt-rules.mjs','generate.mjs','database.rules.json','deny.rules.json','../GD91-87/receipt-client.mjs','../GD91-87/receipt-rules.mjs','../GD91-86/model.mjs','../GD91-84/transport.mjs','../GD91-84/generation-tests.mjs','../GD91-84/auth-rules.mjs'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,createHash('sha256').update(fs.readFileSync(new URL(f,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));const before=hashes(),reports=[],cleanup={rulesClosed:false,trialRootEmpty:false};let failure;
async function rules(file){ok(await request('.settings/rules',{method:'PUT',token:'owner',body:JSON.parse(fs.readFileSync(new URL(file,import.meta.url),'utf8'))}));}
const delta=(a,b)=>Object.fromEntries(Object.keys(a).map(k=>[k,b[k]-a[k]]));
try{await rules('database.rules.json');await owner(trial+'/control','PUT',{state:'preparing',revision:1});const a=await provision('owner'),r=await provision('receptionist');ok(await issue(a));ok(await issue(r));
 for(const[people,sections]of(process.env.POC88_SMOKE==='1'?[[2,2]]:[[600,2],[1000,16]])){
  await owner(trial+'/control','PUT',{state:'preparing',revision:1});await owner(trial+'/event','DELETE');await owner(trial+'/receipts','DELETE');
  const generation='capacity-'+people,nonSeatCells=Math.ceil(people/2),cells=Array.from({length:people+nonSeatCells},(_,i)=>layoutItem(i,i<people?'seat':['unset','space','aisle','gap'][i%4],'sec'+i%sections)),stages={};
  let start=structuredClone(metrics);const layout=await build(a,generation,'layout',cells,sections);const existing=await owner(trial+'/head');ok(await user('',a.device,'PATCH',publish(generation,(existing?.revision??0)+1,'layout-'+people)));stages.layout=delta(start,metrics);
  start=structuredClone(metrics);ok(await user('event/commit',a.device,'PUT',{revision:1,operationId:'initialize'}));stages.initialize=delta(start,metrics);
  const local=emptyEvent(Array.from({length:people},(_,i)=>'cell-'+i));let maxRequestBytes=0,maxProfileBytes=0;
  async function send(body){const bytes=Buffer.byteLength(JSON.stringify(body));maxRequestBytes=Math.max(maxRequestBytes,bytes);const response=await user('event',a.device,'PATCH',body);ok(response);applyModel(local,body);}
  for(const kind of ['register','assign','qrCreate','ticketCheck']){
    start=structuredClone(metrics);
    for(let i=0;i<people;i++){
      const id='person-'+i,body=kind==='assign'?proposal(a,local,'assign','cell-'+i,'none',id):command(a,local,kind,id,{code:String(10000000+i)});
      if(kind==='register')maxProfileBytes=Math.max(maxProfileBytes,Buffer.byteLength(JSON.stringify(body['profiles/'+id])));
      await send(body);
    }
    stages[kind]=delta(start,metrics);assert.equal(stages[kind].ownerRequests,0);assert.equal(stages[kind].userRequests,people);
    console.log(JSON.stringify({people,stage:kind,normalRequests:people}));
  }
  // 全件取得は試験の照合だけ。通常処理は端末にある案とPATCH応答を使う。
  const verified=await owner(trial+'/event');assert.equal(Object.keys(verified.people).length,people);assert.equal(Object.keys(verified.seats).length,people);assert.equal(verified.commit.revision,1+4*people);
  await owner(trial+'/control','PUT',{state:'operating',revision:2});
  start=structuredClone(metrics);let eventBodyBytes=0,maxReceiptRequestBytes=0;
  for(let i=0;i<people;i++){const id='person-'+i,p=receipt(trial.split('/')[1],r,i+1,id,verified.tickets[id],{sourceControlRevision:2});maxReceiptRequestBytes=Math.max(maxReceiptRequestBytes,Buffer.byteLength(JSON.stringify(p.body)));const response=await user('receipts/'+r.device.uid,r.device,'PATCH',p.body);if(response.status!==200){const person=verified.people[id],t=verified.tickets[id],session=await owner(trial+'/sessions/'+r.device.uid),control=await owner(trial+'/control');console.log(JSON.stringify({receiptIndex:i,status:response.status,controlOperating:control.state==='operating',controlRevisionMatches:control.revision===p.event.sourceControlRevision,personActive:person.active,cycleOpen:!t.cycleClosed,versionMatches:t.credentialVersion===p.event.credentialVersion,cycleMatches:t.currentCycle===p.event.currentCycle,credentialMatches:t.credentialRef===p.event.credentialRef,sessionUnexpired:session.expiresAt>Date.now(),eventFields:Object.keys(p.event)}));}ok(response);}
  stages.reception=delta(start,metrics);
  const stored=await owner(trial+'/event'),storedReceipts=await owner(trial+'/receipts');
  eventBodyBytes=Object.entries(storedReceipts[r.device.uid].events).filter(([k])=>k!=='0000000000').reduce((sum,[,e])=>sum+Buffer.byteLength(JSON.stringify(e)),0);
  reports.push({people,sections,nonSeatCells,layoutParts:layout.parts,layoutMaxPartBytes:layout.maxPartBytes,layoutMaxRequestBytes:layout.maxRequestBytes,normalStages:stages,maxRequestBytes,maxProfileBytes,maxReceiptRequestBytes,eventBodyBytes,modeledSixEnvironmentEventBytes:eventBodyBytes*6,actualSixSdkEnvironmentsMeasuredHere:false,eventJsonBytes:Buffer.byteLength(JSON.stringify(stored)),receiptJsonBytes:Buffer.byteLength(JSON.stringify(storedReceipts)),registered:people,assigned:people,qrCreated:people,checksMarked:people,receiptsAccepted:people,sparseUnassignedRows:true,ownerPersonOrTicketWrites:0,preparationNormalRequestsExcludingLayoutAndAuth:4*people+1,dayNormalRequests:people,controlAndDeviceBootstrapByOwner:true,fullBusinessBudgetVerified:false});
 }
}catch(e){failure={code:e.code??'ASSERTION',message:e.message};console.error(e.stack);process.exitCode=1;}
finally{await rules('deny.rules.json');cleanup.rulesClosed=JSON.stringify((await request('.settings/rules',{token:'owner'})).body)===JSON.stringify(JSON.parse(fs.readFileSync(new URL('deny.rules.json',import.meta.url),'utf8')));await owner(trial,'DELETE');cleanup.trialRootEmpty=(await owner(trial))===null;}
const result={sourceHashes:before,endSourceHashes:hashes(),reports,cleanup,...(failure?{failure}:{}),externalFirebaseConnected:false,fullBusinessRulesVerified:false,productionFreeTierVerified:false,tested3000:false};assert.deepEqual(result.sourceHashes,result.endSourceHashes);fs.writeFileSync(new URL(process.env.POC88_SMOKE==='1'?'artifacts/capacity-smoke-summary.json':'artifacts/capacity-summary.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({cases:reports.length,failure:failure??null,cleanup}));
