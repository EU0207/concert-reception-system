import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export const project='demo-concert-seat-gd91-37';
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
async function human(provider){const id=randomUUID(),email=`fake-${id}@example.com`;let r;
 if(provider==='google.com')r=await request(`${auth}/accounts:signInWithIdp?key=demo-api-key`,null,'POST',{requestUri:'http://localhost',postBody:new URLSearchParams({providerId:'google.com',id_token:JSON.stringify({sub:id,email,email_verified:true})}).toString(),returnSecureToken:true});
 else{const password=randomUUID()+'aA7!';r=await request(`${auth}/accounts:signUp?key=demo-api-key`,null,'POST',{email,password,returnSecureToken:true});ok(r);ok(await request(`${auth}/projects/${project}/accounts:update`,'owner','POST',{localId:r.body.localId,emailVerified:true}));r=await request(`${auth}/accounts:signInWithPassword?key=demo-api-key`,null,'POST',{email,password,returnSecureToken:true});}
 ok(r);const claims=JSON.parse(Buffer.from(r.body.idToken.split('.')[1],'base64url'));assert.equal(claims.aud,project);assert.equal(claims.email_verified,true);assert.equal(claims.firebase.sign_in_provider,provider);return{uid:r.body.localId,token:r.body.idToken,provider,authTime:{$timestamp:new Date(claims.auth_time*1000).toISOString()}};
}
export const projection=c=>({schemaVersion:c.schemaVersion,state:c.state,revision:c.revision,dataRevision:c.dataRevision,firstReceptionStartedAt:c.firstReceptionStartedAt,operationId:c.operationId});
export async function fixture(role='owner',state='preparing'){
 const f={show:`FAKE-${randomUUID()}`,device:await anonymous(),human:await human(['owner','deputy'].includes(role)?'google.com':'password')};
 const scope={schemaVersion:2,environmentId:'FAKE-environment',performanceId:f.show};
 const roleData={...scope,active:true,role,revision:1,receptionBaselineRevision:0,startsAt:{$timestamp:'2000-01-01T00:00:00Z'},endsAt:{$timestamp:'2100-01-01T00:00:00Z'}};
 f.control={schemaVersion:1,environmentId:'FAKE-environment',performanceId:f.show,state,revision:1,dataRevision:1,firstReceptionStartedAt:state==='preparing'?null:{$timestamp:'2026-01-01T00:00:00Z'},operationId:''};
 f.session={...scope,deviceUid:f.device.uid,humanUid:f.human.uid,active:true,emailVerified:true,authProvider:f.human.provider,roleRevision:1,revision:1,humanAuthTime:f.human.authTime,expiresAt:{$timestamp:new Date(Date.now()+3600000).toISOString()}};
 ok(await commit(f,[write(f,'roles/'+f.human.uid,roleData),write(f,'devices/'+f.device.uid,{...scope,deviceUid:f.device.uid,humanUid:f.human.uid,active:true,preparedRoleRevision:1,preparedDataRevision:1}),write(f,'control/current',f.control),write(f,'publicStatus/current',projection(f.control)),write(f,'selfRoles/'+f.human.uid,{role,revision:1}),write(f,'deviceStatus/'+f.device.uid,{active:true}),write(f,'dayViews/FAKE-day',{seatId:'FAKE-seat',currentAssignment:'FAKE-guest'}),write(f,'managementHistory/FAKE-history',{actor:'FAKE-actor',reason:'架空の管理履歴'}),write(f,'sharedDrafts/FAKE-draft',{draft:'FAKE-only'}),write(f,'arbitraryFields/FAKE-field',{value:'FAKE-private'})],'owner'));
 ok(await commit(f,[timed(f,'sessions/'+f.device.uid,f.session,'issuedAt',false)],f.human.token));
 f.seat={seatId:'FAKE-seat',seatNumber:'A-1',seatDisplayName:'架空来場者',receptionStatus:'notReceived',emergencyKind:'add',emergencyReason:'架空：補助席用途'};
 await seed(f,'receptionViews/FAKE-seat',f.seat);return f;
}
export async function statePlan(f,state){
 const b=data(await get(f,'control/current','owner')),id=randomUUID(),a={...b,state,revision:b.revision+1,operationId:id};
 const first=b.firstReceptionStartedAt===null&&state==='operating';if(first)delete a.firstReceptionStartedAt;
 const status=projection({...a,firstReceptionStartedAt:b.firstReceptionStartedAt});if(first)delete status.firstReceptionStartedAt;
 const event={operationId:id,deviceUid:f.device.uid,humanUid:f.human.uid,beforeState:b.state,afterState:state,beforeRevision:b.revision,afterRevision:a.revision,confirmed:true};
 return{b,id,writes:[first?timed(f,'control/current',a,'firstReceptionStartedAt',true):write(f,'control/current',a,true),first?timed(f,'publicStatus/current',status,'firstReceptionStartedAt',true):write(f,'publicStatus/current',status,true),timed(f,'performanceEvents/'+id,event,'occurredAt',false)]};
}
export async function probe(f,kind,overrides={}){const c=data(await get(f,'control/current','owner')),id=randomUUID();return commit(f,[write(f,'operationChecks/'+id,{kind,deviceUid:f.device.uid,controlRevision:c.revision,dataRevision:c.dataRevision,...(kind==='postCorrection'?{reason:'架空：公演後訂正'}:{}),...overrides},false)]);}
