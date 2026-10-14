export function clockPatch(path,body){
 const match=/^(checks\/[^/]+)\/(receipts|quarantine)\/([^/]+)$/.exec(path);
 if(!match||!body?.counter)return{path,body};
 const[,root,kind,deviceUid]=match,destination=kind==='receipts'?'normal':'quarantine',counter=body.counter;
 const sequence=destination==='normal'?counter.sequence:counter.lastSourceSequence;
 const full=Object.fromEntries(Object.entries(body).map(([p,value])=>[kind+'/'+deviceUid+'/'+p,value]));
 full['receiptClocks/'+deviceUid]={sequence,eventId:counter.eventId,destination};
 full['receiptSources/'+deviceUid+'/'+String(1000000000+sequence)]={eventId:counter.eventId,destination,key:counter.eventKey};
 full['receiptEventIds/'+deviceUid+'/'+counter.eventId]=String(1000000000+sequence);
 return{path:root,body:full};
}
export async function protocolPatch(path,body,read){
 const p=clockPatch(path,body),match=/^(checks\/[^/]+)\/quarantine\/([^/]+)$/.exec(path);
 if(match&&body?.counter){
  const event=body['events/'+body.counter.eventKey];
  if(typeof event?.layoutReferenceId==='string'){
   const r=await read(match[1]+'/quarantineReviewState/'+event.layoutReferenceId);
   if(r.status!==200)return{response:r};
   const old=r.body;p.body['quarantineReviewState/'+event.layoutReferenceId]={receivedCount:(old?.receivedCount??0)+1,reviewedCount:old?.reviewedCount??0,lastReceiveKey:body.counter.eventKey,lastReviewKey:old?.lastReviewKey??''};
  }
 }
 return p;
}
export async function clockFetch(input,options={}){
 const url=new URL(input);
 if(url.hostname==='127.0.0.1'&&url.port==='9000'&&options.method==='PATCH'&&options.body){
  const original=url.pathname.replace(/^\//,'').replace(/\.json$/,''),p=await protocolPatch(original,JSON.parse(options.body),async path=>{const target=new URL(url);target.pathname='/'+path+'.json';const r=await globalThis.fetch(target);return{status:r.status,body:await r.json()};});
  if(p.response)return new Response(JSON.stringify(p.response.body),{status:p.response.status});
  url.pathname='/'+p.path+'.json';return globalThis.fetch(url,{...options,body:JSON.stringify(p.body)});
 }
 return globalThis.fetch(input,options);
}
