import assert from 'node:assert/strict';
import {runCases as closingCases} from '../GD91-111/common-cases.mjs';
import {createSection,numberInitial} from '../GD91-07/planner.mjs';
import {build,snapshot} from '../GD91-116/layout.mjs';
import {preparePublication} from '../GD91-104/slide.mjs';
import {initialMeta} from '../GD91-102/layout-model.mjs';
export async function runCases(io,m,a){
 const reports=[];
 const prior=await closingCases({...io,onReport:r=>{reports.push(r);io.onReport?.(r);}},m,a);
 let maxJsonNodes=prior.maxJsonNodes,maxRootJsonBytes=prior.maxRootJsonBytes;
 const nodes=v=>v===null||typeof v!=='object'?1:1+Object.values(v).reduce((n,x)=>n+nodes(x),0);
 const report=async(id,facts)=>{
  const root=await io.owner('');maxJsonNodes=Math.max(maxJsonNodes,nodes(root));maxRootJsonBytes=Math.max(maxRootJsonBytes,Buffer.byteLength(JSON.stringify(root)));
  assert(maxJsonNodes<=20000);assert(maxRootJsonBytes<=1048576);reports.push({id,...facts});io.onReport?.({id,...facts});
 };
 const send=async(p,method,body)=>{const r=await io.normal(m,p,method,body);assert.equal(r.status,200);return r.body;},read=p=>send(p,'GET');
 const old=await io.owner(''),base={roles:old.roles,devices:old.devices,sessions:old.sessions,
  control:{state:'preparing',revision:1,layoutSchemaVersion:2,businessSchemaVersion:3,layoutAuditVersion:1,layoutEditVersion:1}};
 function models(count,lines=1,axis='horizontal'){
  return Array.from({length:count},(_,i)=>{
   const rows=axis==='horizontal'?lines:1,columns=axis==='vertical'?lines:1;
   const s=createSection({name:'架空区画'+i,rows,columns,axis,seatOrder:'reverse',stagePosition:'left',lines:Array.from({length:lines},(_,j)=>({name:'列'+j,prefix:'L'+j+'-',startNumber:1}))},{maxCells:4096});
   return numberInitial(s,Object.fromEntries(s.section.cells.map((c,j)=>[c.row+','+c.column,j===0?'seat':'unset'])),{maxCells:4096});
  });
 }
 for(const [id,ms] of [['U01-sixteen-sections',models(16)],['U02-horizontal-256',models(1,256)],['U03-vertical-256',models(1,256,'vertical')]]){
  await io.owner('','PUT',base);await build(send,id,ms);const proof=await preparePublication(read,send,m,id);
  await send('','PATCH',proof.publish(1));await send('','PATCH',proof.complete());
  const view=await snapshot(read,async()=>({rows:{}}));assert.equal(view.models.length,ms.length);assert.equal(Object.keys(view.cells).length,ms.reduce((n,x)=>n+x.section.cells.length,0));
  await report(id,{normalBuildPublishRead:true});
 }
 const head=await read('head');
 const meta={...initialMeta(2,17),auditVersion:1,geometryCursor:0,lastGeometrySection:''};
 assert.equal((await io.normal(m,'generations/over-sections/meta','PUT',meta)).status,401);
 for(const axis of ['horizontal','vertical']){
  let calls=0;await assert.rejects(()=>build(async()=>{calls++;},'over-lines',models(1,257,axis)),/layout-numbering-line-limit/);assert.equal(calls,0);
 }
 assert.deepEqual(await read('head'),head);await report('U04-overflow-preserves-head',{direct17SectionsDenied:true,client257BothAxesBlocked:true});
 return{...prior,reports,maxJsonNodes,maxRootJsonBytes,realIndexedDbVerifiedHere:false,fullBusinessFreeTierVerified:false};
}
