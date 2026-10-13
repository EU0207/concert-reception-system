import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {createRequire} from 'node:module';
const require=createRequire(new URL('../POC-004/package.json',import.meta.url));
const {ref,onValue,get}=require('firebase/database');
const denied=s=>s===401||s===403;
const count=v=>v===null?0:typeof v==='object'?Object.keys(v).length:1;
const nodes=v=>1+(v&&typeof v==='object'?Object.values(v).reduce((n,x)=>n+nodes(x),0):0);
async function wait(test,ms=10000){const until=Date.now()+ms;while(!test()&&Date.now()<until)await new Promise(r=>setTimeout(r,20));return test();}
async function bounded(p){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('observation-timeout')),15000);})]);}finally{clearTimeout(timer);}}
async function sdkWatch(db,path){const state={records:0,error:null,notifications:0};let stop;
  const ready=new Promise((resolve,reject)=>{stop=onValue(ref(db,path),snapshot=>{state.records=count(snapshot.val());state.notifications++;if(state.records===1)resolve();},e=>{state.error=e.code;reject(e);});});
  ready.catch(()=>{});try{await bounded(ready);}catch(e){stop?.();throw e;}return{state,close:()=>stop()};
}
async function restWatch(io,path,token){
  const controller=new AbortController(),r=await io.user(path,{token,stream:true,signal:controller.signal});assert.equal(r.status,200);
  const state={records:0,error:null,notifications:0};let values={},buffer='';const reader=r.body.getReader(),decoder=new TextDecoder();
  const task=(async()=>{try{while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true}).replace(/\r\n/g,'\n');
    let end;while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);
      const event=block.split('\n').find(x=>x.startsWith('event:'))?.slice(6).trim(),raw=block.split('\n').find(x=>x.startsWith('data:'))?.slice(5).trim();
      if(event==='cancel'||event==='auth_revoked'){state.error=event;continue;}
      if(!['put','patch'].includes(event)||!raw)continue;const data=JSON.parse(raw);
      if(data.path==='/'){values=event==='patch'?{...values,...data.data}:data.data??{};}
      else{const key=data.path.slice(1);if(data.data===null)delete values[key];else values[key]=data.data;}
      state.records=count(values);state.notifications++;
    }
  }}catch(e){if(!controller.signal.aborted)state.error='stream-failed';}})();
  if(!await wait(()=>state.notifications>0||state.error)){controller.abort();await task;throw new Error('stream-initial-timeout');}
  assert.equal(state.records,1);return{state,close:async()=>{controller.abort();await task;}};
}
async function read(io,path,token,params={}){const r=await io.user(path,{token,params}),body=await r.json();return{httpStatus:r.status,records:r.status===200?count(body):0};}
export async function runCases(io,subjects){
  const [a,b]=subjects,reports=[];let peakNodes=0,sdkCalls=0;
  for(const kind of['role','device','session','control']){
    const primary=randomUUID(),other=randomUUID(),root='checks/'+primary,otherRoot='checks/'+other;io.registerRoot(root);io.registerRoot(otherRoot);
    const initial={roles:{'FAKE-person-a':true,'FAKE-person-b':true},devices:{[a.uid]:'FAKE-person-a',[b.uid]:'FAKE-person-b'},sessions:{[a.uid]:true,[b.uid]:true},control:true,events:{a:'FAKE-one'}};
    const alternate={roles:{'FAKE-person-b':true},devices:{[b.uid]:'FAKE-person-b'},sessions:{[b.uid]:true},control:true,events:{a:'FAKE-other'}};
    peakNodes=Math.max(peakNodes,nodes({checks:{[primary]:initial,[other]:alternate}})+2);assert(peakNodes<=30);
    let aw,bw,sw;
    try{
      await io.owner(root,'PUT',initial);await io.owner(otherRoot,'PUT',alternate);
      const path=root+'/events',bpath=(kind==='control'?otherRoot:root)+'/events',oldTime=new Date().toISOString();
      const routes=[['collection',path,{}],['node',path+'/a',{}],['query',path,{orderBy:'"$key"',limitToFirst:'10'}],['shallow',path,{shallow:'true'}]];
      const variants=[{readTime:oldTime},{transaction:'FAKE-previous-transaction'},{newTransaction:JSON.stringify({readOnly:{readTime:oldTime}})},{deviceUid:b.uid}];
      const before=[];for(const [method,p,params]of routes){const r=await read(io,p,a.token,params);assert.equal(r.httpStatus,200);assert.equal(r.records,1);before.push({method,...r});}
      const modifierBefore=[];for(let i=0;i<variants.length;i++)modifierBefore.push({variant:i,...await read(io,path,a.token,variants[i])});
      assert(denied((await read(io,path,null)).httpStatus));assert(denied((await read(io,'checks/FAKE-unapproved/events',a.token)).httpStatus));
      sdkCalls+=2;aw=await sdkWatch(a.db,path);bw=await sdkWatch(b.db,bpath);sw=await restWatch(io,path,a.token);
      const target=kind==='role'?'roles/FAKE-person-a':kind==='device'?'devices/'+a.uid:kind==='session'?'sessions/'+a.uid:'control';
      await io.owner(root+'/'+target,'PUT',false);
      const stoppedWithoutEvent=await wait(()=>Boolean(aw.state.error&&sw.state.error));
      const current=[];for(const [method,p,params]of routes)current.push({method,...await read(io,p,a.token,params)});
      assert(current.every(x=>denied(x.httpStatus)&&x.records===0));
      const modifiers=[];for(let i=0;i<variants.length;i++){const r=await read(io,path,a.token,variants[i]);assert(r.httpStatus>=400&&r.records===0);modifiers.push({variant:i,...r});}
      const selfRestore=await io.user(root+'/'+target,{token:a.token,method:'PUT',body:true});assert(denied(selfRestore.status));
      await io.owner(path+'/b','PUT','FAKE-after-stop');if(kind==='control')await io.owner(bpath+'/b','PUT','FAKE-valid-performance');
      assert(await wait(()=>bw.state.records===2));assert.equal(aw.state.records,1);assert.equal(sw.state.records,1);assert(!bw.state.error);
      sdkCalls++;let freshError=null;try{await bounded(get(ref(a.db,path)));}catch(e){freshError=e.code??'request-failed';}assert(freshError);
      const valid=await read(io,bpath,b.token);assert.equal(valid.httpStatus,200);assert.equal(valid.records,2);
      const record={kind,before,modifierBefore,current,modifiers,selfRestoreStatus:selfRestore.status,stoppedWithoutEvent,observationMs:10000,
        sdkAfterStop:{...aw.state},restStreamAfterStop:{...sw.state},freshSdkError:freshError,otherActivePrincipal:valid,
        otherPrincipalUsesDifferentPerformance:kind==='control',humanIdentityVerified:false,sessionIssuanceVerified:false};
      assert(stoppedWithoutEvent,'revocation-not-observed');reports.push(record);console.log(JSON.stringify({kind,currentRejected:4,modifiersRejected:4,stoppedWithoutEvent,otherContinued:true}));
    }finally{
      aw?.close();bw?.close();await sw?.close();await io.owner(root,'DELETE');await io.owner(otherRoot,'DELETE');
    }
  }
  return{reports,peakNodes,sdkApplicationCalls:sdkCalls,historicalApiEquivalenceClaimed:false,fullApplicationAuthorizationVerified:false};
}
