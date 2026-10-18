import assert from 'node:assert/strict';
import '../GD91-73/tests/transport-hook.mjs';
import * as t from '../GD91-73/tests/support.mjs';
import {data} from '../GD91-60/tests/transport.mjs';
import {randomUUID} from 'node:crypto';
export {t};
const project='demo-concert-seat-gd91-60';let sourceFenced=false;
export async function getDocument(path){const r=await t.request(t.base+'/'+path,'owner');if(r.status===404)return null;t.ok(r);return data(r);}
export async function collection(f,name){
  const out={};let pageToken;
  do{const url=new URL(t.base+'/'+t.path(f,name));url.searchParams.set('pageSize','100');if(pageToken)url.searchParams.set('pageToken',pageToken);
    const r=await t.request(url.href,'owner');t.ok(r);for(const d of r.body.documents??[])out[d.name.split('/').at(-1)]=data({body:d});pageToken=r.body.nextPageToken;
  }while(pageToken);return out;
}
export async function fixture(){
  const f=await t.fixture({rows:1,columns:4});
  const groupId=randomUUID();
  const p=await t.register(f,{label:'架空A',paid:true,groupId}),q=await t.register(f,{label:'架空B',paid:false,groupId}),r=await t.register(f,{label:'架空C',paid:true});
  await t.apply(f,await t.assignment(f,'assign',{seat1:f.seats[0],attendeeId:p.attendeeId}));
  await t.apply(f,await t.assignment(f,'assign',{seat1:f.seats[1],attendeeId:r.attendeeId}));
  await t.apply(f,await t.ticketPlan(f,p.attendeeId,'qrCreate'));
  await t.apply(f,await t.ticketPlan(f,p.attendeeId,'ticketCheck',{field:'issued',value:true}));
  await t.apply(f,await t.ticketPlan(f,r.attendeeId,'qrCreate'));
  await t.apply(f,await t.ticketPlan(f,r.attendeeId,'cancelAttendance'));
  for(const[id,index]of [[p.attendeeId,1],[q.attendeeId,2],[r.attendeeId,3]]){
    const person=await t.stored(f,'attendees/'+id);
    // 旧業務PoCで省略した購入者名だけを、独立した架空の元データとして前提投入する。
    await t.seed(t.path(f,'buyers/'+person.buyerId),{name:'架空購入者'+index});
  }
  await t.seed(t.path(f,'receptionRecords/'+p.attendeeId),{status:'received'});
  await t.seed(t.path(f,'deletionMarkers/FAKE-deleted'),{deleted:true});
  f.deviceDeclarations=[{deviceUid:f.manager.uid,pendingOperations:[],unsentEvents:0}];
  return{f,active:p.attendeeId,unassigned:q.attendeeId,cancelled:r.attendeeId};
}
export async function freeze(){
  const deny="rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }";
  const r=await fetch('http://127.0.0.1:8181/emulator/v1/projects/'+project+':securityRules',{
    method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({ignore_errors:false,rules:{files:[{name:'security.rules',content:deny}]}})});
  assert.equal(r.status,200);const body=await r.json();assert(!(body.issues??[]).some(x=>x.severity==='ERROR'));
  sourceFenced=true;
}
export async function readSnapshot(f,{between=async()=>{}}={}){
  assert(sourceFenced,'source-not-fenced');
  const first=await t.stored(f,'versions/current','owner'),control=await t.stored(f,'control/current','owner');
  const layouts=[];
  for(const[sectionId,generation]of Object.entries(first.sections)){
    const root='sourceProofShows/'+f.show+'/sections/'+sectionId+'/generations/'+generation;
    const h=await getDocument(root+'/head/current'),display=await getDocument(t.path(f,'sectionDisplay/'+generation)),chunks=[];
    for(let row=0;row<h.rows;row++)for(let col=0;col<h.columns;col+=2){const id=row+'-'+col;
      chunks.push({id,chunk:await getDocument(root+'/chunks/'+id),attributes:await getDocument(root+'/attributes/'+id)});
    }
    layouts.push({formatVersion:2,environmentId:first.environmentId,performanceId:f.show,generation,initialNumbered:true,chunkSize:2,
      section:{sectionId,name:display.name,rows:h.rows,columns:h.columns,axis:h.axis,seatOrder:h.seatOrder,stagePosition:display.stagePosition,lineSettings:h.lines},chunks});
  }
  const [people,labels,tickets,credentials,codes,operations,reception,buyers,deletions,sharedDrafts,devices]=await Promise.all(
    ['attendees','attendeeLabels','tickets','credentials','confirmationCodes','operations','receptionRecords','buyers','deletionMarkers','sharedDrafts','devices'].map(name=>collection(f,name)));
  const declarations=f.deviceDeclarations;assert(Array.isArray(declarations),'missing-local-device-declarations');
  assert.deepEqual(declarations.map(x=>x.deviceUid).sort(),Object.keys(devices).sort(),'unreconciled-source-device');
  const pendingOperations=declarations.flatMap(x=>x.pendingOperations),unsentEvents=declarations.reduce((n,x)=>n+x.unsentEvents,0);
  const eligible=await t.stored(f,'eligible/current','owner'),assignments=await t.stored(f,'assignmentState/current','owner');
  const sharedHead=await getDocument(t.path(f,'sharedDraftHead/current'));await between();
  assert.deepEqual(await t.stored(f,'versions/current','owner'),first,'source-version-changed');
  assert.deepEqual(await t.stored(f,'control/current','owner'),control,'source-control-changed');
  return{format:1,versions:first,control,layouts,people,labels,tickets,credentials,codes,operations,reception,buyers,deletions,eligible,assignments,sharedDrafts,sharedHead,
    pendingOperations,unsentEvents,reconciliation:{registeredDevices:Object.keys(devices).length,declaredDevices:declarations.length,coverageConfirmed:true,sourceAccessFenced:true}};
}
export async function clean(){
  await freeze();const url='http://127.0.0.1:8181/emulator/v1/projects/'+project+'/databases/(default)/documents';
  const r=await fetch(url,{method:'DELETE'});assert.equal(r.status,200);
  for(const name of ['publicationShows','sourceProofShows']){const check=await t.request(t.base+'/'+name,'owner');t.ok(check);assert.equal((check.body.documents??[]).length,0);}
  return{rulesClosed:true,emulatorDocumentsEmpty:true};
}
