// 隔離試験の通常送信へ公開索引を追加する。owner読取りは準備済み提案の組立て代用。
import {fields,data,base} from '../../GD91-60/tests/transport.mjs';
const original=globalThis.fetch;
export const ledger=[];
export const displaySpecs=new Map();
export const rawFetch=original;
const getOwner=async name=>{const r=await original('http://127.0.0.1:8181/v1/'+name,{headers:{authorization:'Bearer owner'}});return r.status===200?data({body:await r.json()}):null;};
const index=(v,a)=>({schemaVersion:1,environmentId:v.environmentId,performanceId:v.performanceId,versions:v.values,sections:v.sections,seatIds:v.seatIds,assignments:a?.assignments??{}});
globalThis.fetch=async(input,init)=>{
 const url=String(input),body=init?.body?JSON.parse(init.body):null;
 if(url===base+':commit'&&body?.writes&&init.headers?.authorization!=='Bearer owner'){
  const w=body.writes.find(w=>w.update?.name.endsWith('/versions/current'));
  if(w&&!body.writes.some(w=>w.update?.name.endsWith('/publicIndex/current'))){
   const v=data({body:w.update}),prefix=w.update.name.slice(0,-'versions/current'.length);
   const event=body.writes.map(w=>w.update&&data({body:w.update})).find(e=>e&&['publishSection','extendSection','seatEdit'].includes(e.kind));
   if(event){
    const name=prefix+'sectionDisplay/'+event.generation,existing=await getOwner(name);
    if(!existing){const m=await getOwner(prefix+'candidates/'+event.generation);if(m?.ready&&m.geometry){
     const value={schemaVersion:1,environmentId:v.environmentId,performanceId:v.performanceId,sectionId:event.sectionId,generation:event.generation,rows:m.geometry.rows,columns:m.geometry.columns,...(displaySpecs.get(event.generation)??{name:'架空自由区画',stagePosition:'top'})};
     const r=await original(base+':commit',{method:'POST',headers:init.headers,body:JSON.stringify({writes:[{update:{name,fields:fields(value)},currentDocument:{exists:false}}]})});
     ledger.push({performanceId:v.performanceId,displayPreparation:true,writes:1,status:r.status});
    }}
   }
   let assignments={};
   if(v.seatIds.length>0){
    const a=body.writes.find(w=>w.update?.name===prefix+'assignmentState/current');
    assignments=a?data({body:a.update}).assignments:data({body:await(await original('http://127.0.0.1:8181/v1/'+prefix+'assignmentState/current',{headers:{authorization:'Bearer owner'}})).json()}).assignments;
   }
   assignments??={};
   const previous=await original('http://127.0.0.1:8181/v1/'+prefix+'publicIndex/current',{headers:{authorization:'Bearer owner'}});
   const value={schemaVersion:1,environmentId:v.environmentId,performanceId:v.performanceId,versions:v.values,sections:v.sections,seatIds:v.seatIds,assignments};
   body.writes.push({update:{name:prefix+'publicIndex/current',fields:fields(value)},currentDocument:{exists:previous.status===200}});
   ledger.push({performanceId:v.performanceId,commit:v.values.commit,writes:body.writes.length,indexWrites:1});
   init={...init,body:JSON.stringify(body)};
  }
 }
 const result=await original(input,init);
 if(url===base+':commit'&&result.ok&&body?.writes&&init.headers?.authorization==='Bearer owner'){
  const w=body.writes.find(w=>/\/(versions|assignmentState)\/current$/.test(w.update?.name??''));
  if(w){
   const prefix=w.update.name.replace(/(versions|assignmentState)\/current$/,'');
   const v=await getOwner(prefix+'versions/current');
   if(v){const a=v.values.layout>0?await getOwner(prefix+'assignmentState/current'):null;
    const r=await original(base+':commit',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer owner'},body:JSON.stringify({writes:[{update:{name:prefix+'publicIndex/current',fields:fields(index(v,a))}}]})});
    if(!r.ok)throw new Error('fixture index seed failed');
    ledger.push({performanceId:v.performanceId,fixturePreseed:true,indexWrites:1});
   }
  }
 }
 return result;
};
