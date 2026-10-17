import assert from 'node:assert/strict';

export function installMeter(){
 const nativeFetch=globalThis.fetch,buckets={};let phase='preparation';
 const bucket=actor=>buckets[phase+':'+actor]??=( {requests:0,requestBodyBytes:0,responseBodyBytes:0,failedResponses:0,transportErrors:0} );
 globalThis.fetch=async(input,options={})=>{
  const url=new URL(input instanceof Request?input.url:input);
  if(url.hostname!=='127.0.0.1'||url.port!=='9000')return nativeFetch(input,options);
  assert(!(input instanceof Request),'meter-requires-explicit-options');
  const actor=new Headers(options.headers).get('authorization')==='Bearer owner'?'diagnostic':'normal',b=bucket(actor);
  b.requests++;assert(options.body===undefined||typeof options.body==='string');
  b.requestBodyBytes+=Buffer.byteLength(options.body??'');
  try{
   const r=await nativeFetch(input,options);b.responseBodyBytes+=(await r.clone().arrayBuffer()).byteLength;
   if(!r.ok)b.failedResponses++;return r;
  }catch(e){b.transportErrors++;throw e;}
 };
 return {phase:name=>{assert(['preparation','register','bulkAssign','qrCreate','ticketCheck','sdk-setup','reception','closing','cleanup'].includes(name));phase=name;},snapshot:()=>structuredClone(buckets),restore:()=>{globalThis.fetch=nativeFetch;}};
}
