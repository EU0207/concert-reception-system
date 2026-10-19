import assert from 'node:assert/strict';
import {scope} from './scope.mjs';

export function meter({fetcher=fetch,allow,
 maxCalls=scope.maxApplicationCallsIncludingCleanup,
 normalCallLimit=maxCalls-scope.cleanupCallReserve,
 maxBodyBytes=scope.maxObservedRequestAndResponseBodyBytes,
 cleanupReserveBytes=scope.cleanupBodyReserveBytes,
 maxResponseBytes=8*1024*1024,onRequest=()=>{},onProgress=()=>{}}={}){
 const state={requests:0,requestBodyBytes:0,responseBodyBytes:0,cleanupMode:false,groups:{},oauthRequests:0,serviceRequests:0,lastBlockedReason:null};
 let tag='setup';
 const limit=()=>state.cleanupMode?maxBodyBytes:maxBodyBytes-cleanupReserveBytes;
 const total=()=>state.requestBodyBytes+state.responseBodyBytes;
 return{
  state,phase:name=>{tag=name;},cleanup:()=>{state.cleanupMode=true;tag='cleanup';},
  fetch:async(input,options={})=>{
   assert(typeof input==='string'||input instanceof URL,'unsupported-request-input');
   const url=new URL(input);
   const block=reason=>{state.lastBlockedReason=reason;onProgress();throw Error('transport-policy-'+reason);};
   const oauth=url.origin==='https://www.googleapis.com'&&url.pathname==='/oauth2/v3/token'&&url.search==='';
   if(!oauth&&!allow(url))block('unapproved-endpoint');
   if(oauth){
    if(options.method!=='POST'||!Buffer.isBuffer(options.body)||options.body.length>16384)block('oauth-request-shape');
    const contentType=new Headers(options.headers).get('content-type')??'';
    if(!contentType.startsWith('multipart/form-data; boundary='))block('oauth-content-type');
    if(state.oauthRequests>=scope.maxOAuthCredentialRefreshCalls+(state.cleanupMode?scope.cleanupOAuthRefreshReserve:0))block('oauth-call-budget');
   }
   assert(options.body===undefined||typeof options.body==='string'||oauth&&Buffer.isBuffer(options.body),'unsupported-request-body');
   const sent=Buffer.byteLength(options.body??'');
   assert(state.requests<(state.cleanupMode?maxCalls:normalCallLimit),'call-budget');
   assert(total()+sent<=limit(),'body-budget');
   state.requests++;if(oauth)state.oauthRequests++;else state.serviceRequests++;state.groups[tag]=(state.groups[tag]??0)+1;state.requestBodyBytes+=sent;onRequest();
   const abort=new AbortController();
   const signal=options.signal?AbortSignal.any([options.signal,abort.signal]):abort.signal;
   const response=await fetcher(input,{...options,...(oauth?{redirect:'error'}:{}),signal}),reader=response.body?.getReader(),chunks=[];
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
