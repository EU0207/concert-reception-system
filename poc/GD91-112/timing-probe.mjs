import assert from 'node:assert/strict';

// 架空の試行根だけを復元し、時刻差と送信待ち時間を別々に変える。
export function timingProbe(io,fixture,reports){
 let tested=false;
 return async(subject,path,method='GET',body)=>{
  if(tested||method!=='PATCH'||!path.startsWith('receipts/'))return io.normal(subject,path,method,body);
  tested=true;const baseline=await io.owner('');
  const eventKey=Object.keys(body).find(k=>k.startsWith('events/')&&typeof body[k]==='object');assert(eventKey);
  for(const clockAheadMs of [-1000,1000])for(const delayMs of [0,1500]){
   await io.owner('','PUT',baseline);const fixed=structuredClone(body);
   fixed[eventKey].observedAt=Date.now()+clockAheadMs;
   if(delayMs)await new Promise(resolve=>setTimeout(resolve,delayMs));
   const sentAt=Date.now(),response=await io.normal(subject,path,method,fixed),after=await io.owner('');
   const expectedStatus=clockAheadMs>0&&delayMs===0?401:200;
   assert.equal(response.status,expectedStatus);
   if(response.status===401)assert.deepEqual(after,baseline);
   else{
    const stored=after.receipts[subject.device.uid].events[body.counter.eventKey];
    assert.equal(stored.observedAt,fixed[eventKey].observedAt);assert(stored.receivedAt>=stored.observedAt);
   }
   reports.push({fixture,clockAheadMs,delayMs,httpStatus:response.status,observationToSendMs:sentAt-fixed[eventKey].observedAt,rejectedStateUnchanged:response.status===401});
  }
  await io.owner('','PUT',baseline);return io.normal(subject,path,method,body);
 };
}
