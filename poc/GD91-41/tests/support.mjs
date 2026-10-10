import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export const project='demo-concert-seat-gd91-41';
assert.equal(process.env.GCLOUD_PROJECT,project);
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8181');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9191');
export const base=`http://127.0.0.1:8181/v1/projects/${project}/databases/(default)/documents`;
const auth='http://127.0.0.1:9191/identitytoolkit.googleapis.com/v1';
const encode=v=>v===null?{nullValue:null}:typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?{integerValue:String(v)}:typeof v==='string'?{stringValue:v}:Array.isArray(v)?{arrayValue:{values:v.map(encode)}}:Object.hasOwn(v,'$timestamp')?{timestampValue:v.$timestamp}:{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}};
const decode=v=>Object.hasOwn(v,'nullValue')?null:Object.hasOwn(v,'booleanValue')?v.booleanValue:Object.hasOwn(v,'integerValue')?Number(v.integerValue):Object.hasOwn(v,'stringValue')?v.stringValue:Object.hasOwn(v,'timestampValue')?{$timestamp:v.timestampValue}:Object.hasOwn(v,'arrayValue')?(v.arrayValue.values??[]).map(decode):Object.fromEntries(Object.entries(v.mapValue.fields??{}).map(([k,x])=>[k,decode(x)]));
export const data=r=>decode({mapValue:{fields:r.body.fields}});
export async function request(url,token,method='GET',body){const r=await fetch(url,{method,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:r.status,body:await r.json()};}
export const ok=r=>assert.equal(r.status,200,JSON.stringify(r.body));
export const denied=r=>assert.equal(r.status,403,JSON.stringify(r.body));
export const conflict=r=>assert([403,409].includes(r.status),JSON.stringify(r.body));
export const name=(f,path)=>`projects/${project}/databases/(default)/documents/splitSeatShows/${f.show}/${path}`;
export const write=(f,path,value,exists)=>({update:{name:name(f,path),fields:encode(value).mapValue.fields},...(exists===undefined?{}:{currentDocument:{exists}})});
export const timed=(f,path,value,field,exists)=>({...write(f,path,value,exists),updateTransforms:[{fieldPath:field,setToServerValue:'REQUEST_TIME'}]});
export const commit=(f,writes,token=f.device.token)=>request(`${base}:commit`,token,'POST',{writes});
export const get=(f,path,token=f.device.token)=>request(`${base}/splitSeatShows/${f.show}/${path}`,token);
export const seed=(f,path,value)=>commit(f,[write(f,path,value)],'owner').then(ok);
export const list=(f,collection,token=f.device.token,limit=100)=>request(`${base}/splitSeatShows/${f.show}:runQuery`,token,'POST',{structuredQuery:{from:[{collectionId:collection}],...(limit===null?{}:{limit})}});
export async function anonymous(){const r=await request(`${auth}/accounts:signUp?key=demo-api-key`,null,'POST',{returnSecureToken:true});ok(r);return{uid:r.body.localId,token:r.body.idToken};}
export async function human(provider){const id=randomUUID(),email=`fake-${id}@example.com`;let r;
 if(provider==='google.com')r=await request(`${auth}/accounts:signInWithIdp?key=demo-api-key`,null,'POST',{requestUri:'http://localhost',postBody:new URLSearchParams({providerId:'google.com',id_token:JSON.stringify({sub:id,email,email_verified:true})}).toString(),returnSecureToken:true});
 else{const password=randomUUID()+'aA7!';r=await request(`${auth}/accounts:signUp?key=demo-api-key`,null,'POST',{email,password,returnSecureToken:true});ok(r);ok(await request(`${auth}/projects/${project}/accounts:update`,'owner','POST',{localId:r.body.localId,emailVerified:true}));r=await request(`${auth}/accounts:signInWithPassword?key=demo-api-key`,null,'POST',{email,password,returnSecureToken:true});}
 ok(r);const claims=JSON.parse(Buffer.from(r.body.idToken.split('.')[1],'base64url'));assert.equal(claims.aud,project);assert.equal(claims.email_verified,true);assert.equal(claims.firebase.sign_in_provider,provider);return{uid:r.body.localId,token:r.body.idToken,provider,authTime:{$timestamp:new Date(claims.auth_time*1000).toISOString()}};
}
export const stamp=(f,values={})=>({schemaVersion:9,environmentId:'FAKE-environment',performanceId:f.show,...values});
export async function addIdentity(f,role='owner') {
 const g={...f,device:await anonymous(),human:await human(['owner','deputy'].includes(role)?'google.com':'password')};
 const scope={schemaVersion:2,environmentId:'FAKE-environment',performanceId:f.show};
 g.role={...scope,active:true,role,revision:1,receptionBaselineRevision:0,startsAt:{$timestamp:'2000-01-01T00:00:00Z'},endsAt:{$timestamp:'2100-01-01T00:00:00Z'}};
 const v=data(await get(f,'versions/current','owner'));
 g.deviceData={...scope,deviceUid:g.device.uid,humanUid:g.human.uid,active:true,preparedRoleRevision:1,preparedDataSchemaVersion:9,preparedDataRevision:v.values.reception};
 g.session={...scope,deviceUid:g.device.uid,humanUid:g.human.uid,active:true,emailVerified:true,authProvider:g.human.provider,roleRevision:1,revision:1,humanAuthTime:g.human.authTime,expiresAt:{$timestamp:new Date(Date.now()+3600000).toISOString()}};
 await seed(g,'roles/'+g.human.uid,g.role);await seed(g,'devices/'+g.device.uid,g.deviceData);
 ok(await commit(g,[timed(g,'sessions/'+g.device.uid,g.session,'issuedAt',false)],g.human.token));return g;
}
export async function fixture(role='owner') {
 const f={show:`FAKE-${randomUUID()}`},c=stamp(f,{state:'preparing',revision:1,firstReceptionStartedAt:null,dayStartsAt:{$timestamp:'2099-01-01T00:00:00Z'},dayEndsAt:{$timestamp:'2099-01-02T00:00:00Z'}});
 await seed(f,'control/current',c);
 await seed(f,'versions/current',stamp(f,{values:{commit:1,attendee:1,ticket:1,control:1,layout:0,source:0,assignment:0,reception:1},generationId:'',operationId:''}));
 await seed(f,'attendeeState/current',stamp(f,{eligibleIds:[],revision:1,operationId:'',attendeeId:''}));
 return addIdentity(f,role);
}
export async function prepareFixture(f) {
 const d=data(await get(f,'devices/'+f.device.uid,'owner')),v=data(await get(f,'versions/current','owner'));
 await seed(f,'devices/'+f.device.uid,{...d,preparedDataSchemaVersion:9,preparedDataRevision:v.values.reception});
}
export async function publishFixture(f,ids,state='operating') {
 const c=data(await get(f,'control/current','owner')),v=data(await get(f,'versions/current','owner')),generationId='FAKE-published';
 await seed(f,'control/current',{...c,state,firstReceptionStartedAt:{$timestamp:new Date().toISOString()},dayStartsAt:{$timestamp:new Date(Date.now()-3600000).toISOString()},dayEndsAt:{$timestamp:new Date(Date.now()+3600000).toISOString()}});
 await seed(f,'versions/current',{...v,generationId,values:{...v.values,layout:1,source:1,assignment:1}});
 await seed(f,'assignmentState/current',stamp(f,{revision:1,generationId,assignments:Object.fromEntries(ids.map((id,i)=>['FAKE-seat-'+i,id]))}));
 await seed(f,'selection/current',stamp(f,{generationId,state:'published'}));await prepareFixture(f);
}
export async function plan(f,kind,id=randomUUID(),seatDisplayName='架空一',reason='架空：表示修正') {
 // 最新の公開版と対象表示名だけを通常権限で取得。臨時担当へ管理索引を読ませない。
 const vr=await get(f,'versions/current');ok(vr);const b=data(vr),cr=await get(f,'control/current');ok(cr);const c=data(cr),onDay=Date.parse(c.dayStartsAt.$timestamp)<=Date.now()&&Date.now()<Date.parse(c.dayEndsAt.$timestamp);
 const op=randomUUID(),before=kind==='register'?null:data(await checked(get(f,'attendeeLabels/'+id))),after=stamp(f,{attendeeId:id,seatDisplayName,revision:(before?.revision??0)+1,operationId:op});
 const v={...b,operationId:op,values:{...b.values,commit:b.values.commit+1,attendee:b.values.attendee+1,reception:b.values.reception+1}};
 const profile=kind==='register'?stamp(f,{attendeeId:id,buyerId:randomUUID(),attendancePlan:'planned',paid:false,revision:1,operationId:op}):null;
 const e=stamp(f,{operationId:op,kind,attendeeId:id,actorUid:f.human.uid,deviceUid:f.device.uid,beforeValues:b.values,afterValues:v.values,confirmed:true,onDay,reason:onDay?reason:'',beforeLabel:before,afterLabel:after,profile});
 const idx={revision:v.values.attendee,operationId:op,attendeeId:id};
 if(kind==='register'){const ir=await get(f,'attendeeState/current');ok(ir);idx.eligibleIds=[...data(ir).eligibleIds,id];}
 const iw={...write(f,'attendeeState/current',idx,true),updateMask:{fieldPaths:Object.keys(idx)}};
 const writes=[write(f,'versions/current',v,true),write(f,'attendeeLabels/'+id,after,kind!=='register'),iw,timed(f,'operations/'+op,e,'occurredAt',false)];
 if(kind==='register')writes.splice(1,0,write(f,'attendees/'+id,profile,false));
 else if(onDay)writes.push(timed(f,`dayEvents/${f.human.uid}/entries/${op}`,stamp(f,{operationId:op,kind,attendeeId:id,actorUid:f.human.uid,deviceUid:f.device.uid,beforeRevision:before.revision,afterRevision:after.revision,controlRevision:c.revision,receptionRevision:v.values.reception,reason}),'occurredAt',false));
 return{id,op,b,v,before,after,writes};
}
async function checked(promise){const r=await promise;ok(r);return r;}
export async function register(f,label='架空一'){const p=await plan(f,'register',undefined,label);ok(await commit(f,p.writes));return p;}
export async function snapshot(f,p){return Promise.all(p.writes.map(w=>request(`${base}/${w.update.name.split('/documents/')[1]}`,'owner')));}
export async function rejected(f,p,writes=p.writes,check=denied){const before=await snapshot(f,p);check(await commit(f,writes));assert.deepEqual(await snapshot(f,p),before);}
