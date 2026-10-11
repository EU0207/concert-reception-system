import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {createSection,numberInitial} from '../../GD91-07/planner.mjs';
import {pack,unpack} from '../../GD91-49/codec.mjs';
import {actor,human as makeHuman,request,fields,base,ok,denied,data} from './transport.mjs';
const width=Number(process.env.GD91_FRAGMENT_WIDTH??2),context={maxCells:10000};
const name=p=>'projects/demo-concert-seat-gd91-60/databases/(default)/documents/'+p;
const write=(p,v,exists=false)=>({update:{name:name(p),fields:fields(v)},currentDocument:{exists}});
const commit=(writes,token)=>request(base+':commit',token,'POST',{writes});
const seed=async(p,v)=>ok(await commit([{update:{name:name(p),fields:fields(v)}}],'owner'));
const root=f=>'sourceProofShows/'+f.show+'/sections/'+f.section;
const doc=(f,suffix,g=f.next.generation)=>root(f)+'/generations/'+g+'/'+suffix;
function model(rows,columns,mixed=true,axis='horizontal',order='forward') {
 const raw=createSection({name:'架空試験区画',rows,columns,axis,seatOrder:order,lines:Array.from({length:axis==='horizontal'?rows:columns},(_,i)=>({name:'列'+i}))},context);
 return numberInitial(raw,Object.fromEntries(raw.section.cells.map((c,i)=>[c.row+','+c.column,mixed?['seat','gap','space','aisle','unset'][i%5]:'seat'])),context);
}
async function fixture({rows=1,columns=5,axis='horizontal',order='forward',mixed=true,showId,generationId,baseId}={}){
 const manager=await actor(),show=showId??'FAKE-'+randomUUID(),person=await makeHuman(),human=person.uid,old={environmentId:'FAKE-environment',performanceId:show,generation:baseId??randomUUID(),model:model(rows,columns,mixed,axis,order)},next=structuredClone(old);next.generation=generationId??randomUUID();
 const f={manager,person,show,human,old,next,section:old.model.section.sectionId};
 const scope={schemaVersion:2,environmentId:'FAKE-environment',performanceId:show};
 await seed('publicationShows/'+show+'/roles/'+human,{...scope,role:'owner',active:true,revision:1,receptionBaselineRevision:0,startsAt:{$timestamp:new Date(Date.now()-60000).toISOString()},endsAt:{$timestamp:new Date(Date.now()+3600000).toISOString()}});
 await seed('publicationShows/'+show+'/devices/'+manager.uid,{...scope,deviceUid:manager.uid,humanUid:human,active:true,preparedRoleRevision:1});
 const claims=JSON.parse(Buffer.from(person.token.split('.')[1],'base64url'));
 const session={...scope,deviceUid:manager.uid,humanUid:human,active:true,emailVerified:true,authProvider:person.provider,roleRevision:1,revision:1,humanAuthTime:{$timestamp:new Date(claims.auth_time*1000).toISOString()},expiresAt:{$timestamp:new Date(Date.now()+1800000).toISOString()}};
 const sessionWrite=write('publicationShows/'+show+'/sessions/'+manager.uid,session);sessionWrite.updateTransforms=[{fieldPath:'issuedAt',setToServerValue:'REQUEST_TIME'}];ok(await commit([sessionWrite],person.token));
 const s=next.model.section;f.head={environmentId:'FAKE-environment',performanceId:show,sectionId:s.sectionId,generation:next.generation,baseGeneration:old.generation,status:'building',controlRevision:1,rows:s.rows,columns:s.columns,axis:s.axis,seatOrder:s.seatOrder,lines:s.lineSettings};
 await seed(doc(f,'head/current'),f.head);
 await seed('sourceProofShows/'+show+'/control/current',{revision:1,activeGeneration:next.generation,phase:'preparing',publishedGeneration:old.generation});
 const packed=pack(old,width,context);for(const part of packed.chunks)await seed(doc(f,'chunks/'+part.id,old.generation),part.chunk);
 await issueCatalog(f);return f;
}
function manual(f,index,label='補助-1'){
 const m=f.next.model,c=m.section.cells[index],line=m.section.lineSettings[m.section.axis==='horizontal'?c.row:c.column];assert.notEqual(c.kind,'seat');c.kind='seat';c.seatId=randomUUID();m.seats.push({seatId:c.seatId,sectionId:f.section,lineId:line.lineId,numberingMode:'manual',manualNumber:label,category:'special',usable:true,emergencyChange:{kind:'add',reason:'架空：補助席用途'}});
}
const parts=f=>pack(f.next,width,context).chunks;
const writes=(f,p)=>[write(doc(f,'chunks/'+p.id),p.chunk),write(doc(f,'attributes/'+p.id),p.attributes)];
export {fixture,manual,parts,writes,commit,doc,context,write,seed};

async function issueCatalog(f){let a={sectionId:f.section,generation:f.next.generation,cursor:0,lines:[],lineIds:[]};ok(await commit([write(doc(f,'lineCatalog/current'),a)],f.manager.token));for(const line of f.head.lines){a={...a,cursor:a.cursor+1,lines:a.lines.concat([line]),lineIds:a.lineIds.concat([line.lineId])};ok(await commit([write(doc(f,'lineCatalog/current'),a,true)],f.manager.token));}return a;}
export {issueCatalog};
