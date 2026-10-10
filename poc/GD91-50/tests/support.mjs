import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {createSection,numberInitial} from '../../GD91-07/planner.mjs';
import {pack,unpack} from '../../GD91-49/codec.mjs';
import {actor,request,fields,base,ok,denied,data} from './transport.mjs';
const width=Number(process.env.GD91_FRAGMENT_WIDTH??2),context={maxCells:10000};
const name=p=>'projects/demo-concert-seat-gd91-50/databases/(default)/documents/'+p;
const write=(p,v,exists=false)=>({update:{name:name(p),fields:fields(v)},currentDocument:{exists}});
const commit=(writes,token)=>request(base+':commit',token,'POST',{writes});
const seed=async(p,v)=>ok(await commit([{update:{name:name(p),fields:fields(v)}}],'owner'));
const root=f=>'sourceProofShows/'+f.show+'/sections/'+f.section;
const doc=(f,suffix,g=f.next.generation)=>root(f)+'/generations/'+g+'/'+suffix;
function model(rows,columns,mixed=true,axis='horizontal',order='forward') {
 const raw=createSection({name:'架空試験区画',rows,columns,axis,seatOrder:order,lines:Array.from({length:axis==='horizontal'?rows:columns},(_,i)=>({name:'列'+i}))},context);
 return numberInitial(raw,Object.fromEntries(raw.section.cells.map((c,i)=>[c.row+','+c.column,mixed?['seat','gap','space','aisle','unset'][i%5]:'seat'])),context);
}
async function fixture({rows=1,columns=5,axis='horizontal',order='forward',mixed=true}={}){
 const manager=await actor(),show='FAKE-'+randomUUID(),human='FAKE-human-'+randomUUID(),old={environmentId:'FAKE-environment',performanceId:show,generation:randomUUID(),model:model(rows,columns,mixed,axis,order)},next=structuredClone(old);next.generation=randomUUID();
 const f={manager,show,human,old,next,section:old.model.section.sectionId};
 const scope={schemaVersion:2,environmentId:'FAKE-environment',performanceId:show};
 await seed('publicationShows/'+show+'/roles/'+human,{...scope,role:'owner',active:true,revision:1,receptionBaselineRevision:0,startsAt:{$timestamp:new Date(Date.now()-60000).toISOString()},endsAt:{$timestamp:new Date(Date.now()+3600000).toISOString()}});
 await seed('publicationShows/'+show+'/devices/'+manager.uid,{...scope,deviceUid:manager.uid,humanUid:human,active:true,preparedRoleRevision:1});
 await seed('publicationShows/'+show+'/sessions/'+manager.uid,{...scope,deviceUid:manager.uid,humanUid:human,active:true,emailVerified:true,authProvider:'google.com',roleRevision:1,revision:1,expiresAt:{$timestamp:new Date(Date.now()+3600000).toISOString()}});
 const s=next.model.section;f.head={environmentId:'FAKE-environment',performanceId:show,sectionId:s.sectionId,generation:next.generation,baseGeneration:old.generation,status:'building',controlRevision:1,rows:s.rows,columns:s.columns,axis:s.axis,lines:s.lineSettings};
 await seed(doc(f,'head/current'),f.head);await seed(doc(f,'lineCatalog/current'),{sectionId:s.sectionId,generation:next.generation,lines:s.lineSettings});
 await seed('sourceProofShows/'+show+'/control/current',{revision:1,activeGeneration:next.generation,phase:'preparing'});
 const packed=pack(old,width,context);for(const part of packed.chunks)await seed(doc(f,'chunks/'+part.id,old.generation),part.chunk);
 return f;
}
function manual(f,index,label='補助-1'){
 const m=f.next.model,c=m.section.cells[index],line=m.section.lineSettings[m.section.axis==='horizontal'?c.row:c.column];assert.notEqual(c.kind,'seat');c.kind='seat';c.seatId=randomUUID();m.seats.push({seatId:c.seatId,sectionId:f.section,lineId:line.lineId,numberingMode:'manual',manualNumber:label,category:'special',usable:true,emergencyChange:{kind:'add',reason:'架空：補助席用途'}});
}
const parts=f=>pack(f.next,width,context).chunks;
const writes=(f,p)=>[write(doc(f,'chunks/'+p.id),p.chunk),write(doc(f,'attributes/'+p.id),p.attributes)];
export {fixture,manual,parts,writes,commit,doc,context};
