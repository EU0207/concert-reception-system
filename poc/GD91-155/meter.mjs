import assert from 'node:assert/strict';
import {scope} from './scope.mjs';

export function meter({fetcher=fetch,allow,
 maxCalls=scope.maxApplicationCallsIncludingCleanup,
 normalCallLimit=maxCalls-scope.cleanupCallReserve,
 maxBodyBytes=scope.maxObservedRequestAndResponseBodyBytes,
 cleanupReserveBytes=scope.cleanupBodyReserveBytes,
 maxResponseBytes=8*1024*1024,onRequest=()=>{},onProgress=()=>{}}={}){
 const state={requests:0,requestBodyBytes:0,responseBodyBytes:0,cleanupMode:false,groups:{}};
 let tag='setup';
 const limit=()=>state.cleanupMode?maxBodyBytes:maxBodyBytes-cleanupReserveBytes;
 const total=()=>state.requestBodyBytes+state.responseBodyBytes;
 return{
  state,phase:name=>{tag=name;},cleanup:()=>{state.cleanupMode=true;tag='cleanup';},
  fetch:async(input,options={})=>{
   assert(typeof input==='string'||input instanceof URL,'unsupported-request-input');
   const url=new URL(input);assert(allow(url),'unapproved-endpoint');
   assert(options.body===undefined||typeof options.body==='string','unsupported-request-body');
   const sent=Buffer.byteLength(options.body??'');
   assert(state.requests<(state.cleanupMode?maxCalls:normalCallLimit),'call-budget');
   assert(total()+sent<=limit(),'body-budget');
   state.requests++;state.groups[tag]=(state.groups[tag]??0)+1;state.requestBodyBytes+=sent;onRequest();
   const abort=new AbortController();
   const signal=options.signal?AbortSignal.any([options.signal,abort.signal]):abort.signal;
   const response=await fetcher(input,{...options,signal}),reader=response.body?.getReader(),chunks=[];
   let bytes=0;
   if(reader){
    try{
     for(;;){
      const {done,value}=await reader.read();if(done)break;
      bytes+=value.byteLength;state.responseBodyBytes+=value.byteLength;onProgress();
      if(bytes>maxResponseBytes||total()>limit())throw Error('response-body-budget');
      chunks.push(value);
     }
    }catch(error){abort.abort();await reader.cancel().catch(()=>{});throw error;}
    finally{reader.releaseLock();}
   }
   // cloneの片側だけを停止して読み残しを作らず、計測済み本文だけを呼出元へ返す。
   return new Response(reader?Buffer.concat(chunks,bytes):null,{status:response.status,statusText:response.statusText,headers:response.headers});
  },
  snapshot:()=>structuredClone(state)
 };
}
