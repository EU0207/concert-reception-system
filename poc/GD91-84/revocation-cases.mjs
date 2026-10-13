import assert from 'node:assert/strict';
export async function waitUntil(test,ms){const until=Date.now()+ms;while(Date.now()<until&&!test())await new Promise(r=>setTimeout(r,20));return test();}
export async function restObserver(response,controller){
  assert.equal(response.status,200);const reader=response.body.getReader(),decoder=new TextDecoder(),state={seen:[],error:null};let buffer='';
  const task=(async()=>{try{while(true){const next=await reader.read();if(next.done)break;buffer+=decoder.decode(next.value,{stream:true}).replace(/\r\n/g,'\n');let end;
    while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);const event=block.split('\n').find(x=>x.startsWith('event:'))?.slice(6).trim(),data=block.split('\n').find(x=>x.startsWith('data:'))?.slice(5).trim();
      if(['cancel','auth_revoked'].includes(event)){state.error=event;continue;}if(['put','patch'].includes(event)&&data){const value=JSON.parse(data);if(value.path==='/')state.seen.push(value.data?.value);}
    }
  }}catch{if(!controller.signal.aborted)state.error='stream-failed';}})();
  const close=async()=>{controller.abort();await task;};if(!await waitUntil(()=>state.seen.length>0,5000)){await close();throw new Error('rest-initial-timeout');}return{state,close};
}
const nodeCount=v=>1+(v&&typeof v==='object'?Object.values(v).reduce((n,x)=>n+nodeCount(x),0):0);
export async function runRevocations(io,{expiryWindowMs=3000}={}){
  const [a,b]=await io.subjects(),reports=[];let peakNodes=0;
  for(const kind of ['role','device','session','control','session-expiry','role-expiry']){
    await io.owner('control','PUT',{state:'operating',revision:1});await io.owner('probes/general','PUT',{revision:1,value:'FAKE-before'});
    const expires=Date.now()+expiryWindowMs;
    await io.reset(a,kind==='role-expiry'?expires:Date.now()+86400000);await io.reset(b,Date.now()+86400000);
    await io.issue(a,kind.endsWith('expiry')?expires:Date.now()+3600000);await io.issue(b,Date.now()+3600000);
    peakNodes=Math.max(peakNodes,nodeCount(await io.owner('','GET')));assert(peakNodes<=150);
    const wa=io.sdkWatch(a),wb=io.sdkWatch(b),rest=await io.restWatch(a);
    try{
      assert(await waitUntil(()=>wa.state.seen.length&&wb.state.seen.length,5000));assert.equal((await io.current(a)).status,200);
      const started=Date.now();
      if(kind==='role')await io.owner('roles/'+a.human.uid+'/active','PUT',false);
      if(kind==='device')await io.owner('devices/'+a.device.uid+'/active','PUT',false);
      if(kind==='session')await io.owner('sessions/'+a.device.uid+'/active','PUT',false);
      if(kind==='control')await io.owner('control/state','PUT','stopped');
      if(kind.endsWith('expiry'))await waitUntil(()=>Date.now()>expires+200,expiryWindowMs+500);
      await waitUntil(()=>wa.state.error!==null,1000);
      const cancelledBeforePayload=wa.state.error!==null,current=await io.current(a);assert.equal(current.status,401);
      await io.owner('probes/general','PUT',{revision:2,value:'FAKE-after'});
      await waitUntil(()=>wa.state.error!==null||wa.state.seen.includes('FAKE-after'),1500);await waitUntil(()=>rest.state.error!==null||rest.state.seen.includes('FAKE-after'),1500);
      if(kind!=='control')assert(await waitUntil(()=>wb.state.seen.includes('FAKE-after'),5000));
      const result={kind,currentRestStatus:current.status,cancelledBeforePayload,cancelledAfterPayload:wa.state.error!==null,
        postInvalidationDataReceived:wa.state.seen.includes('FAKE-after'),retainedLastValue:wa.state.seen.at(-1),restStreamCancelled:rest.state.error!==null,restStreamPostInvalidationDataReceived:rest.state.seen.includes('FAKE-after'),
        otherContinues:kind==='control'?null:wb.state.seen.includes('FAKE-after'),elapsedMs:Date.now()-started,roleAndSessionExpiryCoincide:kind==='role-expiry',
        serverRejectionVerified:wa.state.error!==null&&!wa.state.seen.includes('FAKE-after')&&rest.state.error!==null&&!rest.state.seen.includes('FAKE-after')};
      if(kind.endsWith('expiry')){await io.owner('sessions/'+a.device.uid+'/active','PUT',false);await waitUntil(()=>wa.state.error!==null&&rest.state.error!==null,1500);result.explicitRevocationStopsBoth=wa.state.error!==null&&rest.state.error!==null;}
      reports.push(result);io.record?.(result);
    }finally{wa.close();wb.close();await rest.close();}
  }
  return{reports,peakNodes,subjectsCreated:4,expiryWindowMs,allComparedRevocationsVerified:reports.length===6&&reports.every(r=>r.serverRejectionVerified)};
}
