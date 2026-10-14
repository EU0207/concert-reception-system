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
export async function clockFetch(input,options={}){
 const url=new URL(input);
 if(url.hostname==='127.0.0.1'&&url.port==='9000'&&options.method==='PATCH'&&options.body){
  const original=url.pathname.replace(/^\//,'').replace(/\.json$/,''),p=clockPatch(original,JSON.parse(options.body));
  url.pathname='/'+p.path+'.json';return globalThis.fetch(url,{...options,body:JSON.stringify(p.body)});
 }
 return globalThis.fetch(input,options);
}
