import assert from 'node:assert/strict';
import {hashes,rules,cleanup,setup,trial,owner,user,ok,command,proposal,metrics,finish} from './support.mjs';
import {client,wait} from './sdk-client.mjs';import {plan} from '../GD91-88/receipt-client.mjs';
const before=hashes(['capacity.mjs','sdk-client.mjs','../GD91-88/receipt-client.mjs']),reports=[],clients=[],watchers=[];let clean;
const delta=(a,b)=>Object.fromEntries(Object.keys(a).map(k=>[k,b[k]-a[k]]));
try{await rules();
 for(const[people,sections]of(process.env.GD89_SMOKE==='1'?[[4,2]]:[[600,2],[1000,16]])){
  await owner(trial,'DELETE');const start=structuredClone(metrics),f=await setup(people,sections),{manager:m,staff,state,send}=f;
  const stages={};let maxRequestBytes=0;
  for(const kind of ['register','assign','qrCreate','ticketCheck']){
   const before=structuredClone(metrics);
   for(let i=0;i<people;i++){
    const id='person-'+i,body=kind==='assign'?proposal(m,{...state,seats:{...state.seats,['cell-'+i]:state.seats?.['cell-'+i]??{personId:'none'}}},'assign','cell-'+i,'none',id):command(m,state,kind,id,{code:String(10000000+i)});
    maxRequestBytes=Math.max(maxRequestBytes,Buffer.byteLength(JSON.stringify(body)));await send(body);
   }
   stages[kind]=delta(before,metrics);assert.equal(stages[kind].ownerRequests,0);assert.equal(stages[kind].userRequests,people);console.log(JSON.stringify({people,stage:kind,normalRequests:people}));
  }
  const preparation=delta(start,metrics);await f.control('operating',2);
  for(let i=0;i<6;i++)clients.push(await client(staff.human));const snapshots=[],snapshotStats=[];
  for(const c of clients){let current;for(let pass=0;pass<3;pass++){current=await c.snapshot();assert.equal(Object.keys(current.rows).length,people);assert.equal(current.revision,state.commit.revision);for(let i=0;i<people;i++){const row=current.rows['i-person-'+i];assert(row.eligible);assert.equal(row.credentialRef,state.tickets['person-'+i].credentialRef);assert.equal(row.seatId,'cell-'+i);}}snapshots.push(current);snapshotStats.push(c.stats());}
  const writer=clients[0];for(const c of clients)watchers.push(c.subscribe(writer.device.uid));
  const receiptStart=structuredClone(metrics),started=Date.now();
  for(let i=0;i<people;i++){const row=snapshots[0].rows['i-person-'+i],p=plan(trial.split('/')[1],writer,i+1,'person-'+i,row,{sourceControlRevision:2});ok(await user('receipts/'+writer.device.uid,writer.device,'PATCH',p.body));}
  await wait(()=>watchers.every(w=>w.store.snapshot().records.size===people));for(const w of watchers)assert.equal(w.stats.error,null);
  const eventBodyBytes=watchers.map(w=>w.stats.bodyBytes),elapsedMs=Date.now()-started,receiptStats=delta(receiptStart,metrics);
  for(const w of watchers)await w.stop();
  let reconnectEvents=0;for(const w of watchers){const c=clients[watchers.indexOf(w)],r=c.subscribe(writer.device.uid,w.store);await new Promise(resolve=>setTimeout(resolve,100));reconnectEvents+=r.stats.events;await r.stop();assert.equal(r.stats.error,null);}assert.equal(reconnectEvents,0);
  const event=await owner(trial+'/event'),receipts=await owner(trial+'/receipts'),layout=await owner(trial+'/generations/layout');
  reports.push({people,sections,nonSeatCells:people,stages,preparation,normalRegistrationAndTicketWrites:4*people,ownerPersonOrTicketWrites:0,maxRequestBytes,layoutParts:f.layout.parts,layoutMaxPartBytes:f.layout.maxPartBytes,snapshotStats,snapshotPassesPerEnvironment:3,actualSdkEnvironments:6,eventsPerEnvironment:watchers.map(w=>w.stats.events),eventBodyBytes,reconnectEvents,receiptStats,elapsedMs,eventStorageBytes:Buffer.byteLength(JSON.stringify(event)),receiptStorageBytes:Buffer.byteLength(JSON.stringify(receipts)),layoutStorageBytes:Buffer.byteLength(JSON.stringify(layout)),normalIssuanceToSixSdkConnected:true,ramJournalOnly:true,realIndexedDbVerified:false,completeBusinessBudgetVerified:false});
  for(const c of clients)await c.close();clients.length=0;watchers.length=0;console.log(JSON.stringify({people,snapshotClients:6,receiptEventsPerClient:people,passed:true}));
 }
}finally{for(const w of watchers)await w.stop();for(const c of clients)await c.close();clean=await cleanup();}
finish(process.env.GD89_SMOKE==='1'?'capacity-smoke':'capacity',before,reports,clean,{normalIssuanceAndSixSdkCombined:true,countsAreApplicationOperations:true,sdkInternalWireRequestsMeasured:false});process.exit(0);
