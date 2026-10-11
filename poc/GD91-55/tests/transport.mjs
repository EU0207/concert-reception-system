import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const project = 'demo-concert-seat-gd91-55';
assert.equal(process.env.GCLOUD_PROJECT, project);
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8181');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9191');
const base = `http://127.0.0.1:8181/v1/projects/${project}/databases/(default)/documents`;
const auth = 'http://127.0.0.1:9191/identitytoolkit.googleapis.com/v1';
const context = {maxCells:10000}, deltas = {up:[-1,0],down:[1,0],left:[0,-1],right:[0,1]};
const encode = v => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'string' ? { stringValue: v }
    : Array.isArray(v) ? { arrayValue: { values: v.map(encode) } } : Object.hasOwn(v, '$timestamp') ? { timestampValue: v.$timestamp }
      : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])) } };
const decode = v => Object.hasOwn(v, 'nullValue') ? null : Object.hasOwn(v, 'booleanValue') ? v.booleanValue
  : Object.hasOwn(v, 'integerValue') ? Number(v.integerValue) : Object.hasOwn(v, 'stringValue') ? v.stringValue
    : Object.hasOwn(v, 'timestampValue') ? { $timestamp: v.timestampValue } : Object.hasOwn(v, 'arrayValue') ? (v.arrayValue.values ?? []).map(decode)
      : Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, decode(x)]));
const fields = v => encode(v).mapValue.fields;
async function request(url, token, method = 'GET', body) {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: r.status, body: await r.json() };
}
async function actor() {
  const r = await request(`${auth}/accounts:signUp?key=demo-api-key`, null, 'POST', { returnSecureToken: true }); assert.equal(r.status, 200);
  assert.equal(JSON.parse(Buffer.from(r.body.idToken.split('.')[1], 'base64url')).aud, project);
  return { uid: r.body.localId, token: r.body.idToken };
}
async function human(provider='google.com',verified=true) {
  const id=randomUUID(),email=`fake-${id}@example.com`;let r;
  if(provider==='google.com')r=await request(`${auth}/accounts:signInWithIdp?key=demo-api-key`,null,'POST',{requestUri:'http://localhost',postBody:new URLSearchParams({providerId:'google.com',id_token:JSON.stringify({sub:id,email,email_verified:verified})}).toString(),returnSecureToken:true});
  else {
    const password=randomUUID()+'aA7!';r=await request(`${auth}/accounts:signUp?key=demo-api-key`,null,'POST',{email,password,returnSecureToken:true});assert.equal(r.status,200);
    if(verified){assert.equal((await request(`${auth}/projects/${project}/accounts:update`,'owner','POST',{localId:r.body.localId,emailVerified:true})).status,200);r=await request(`${auth}/accounts:signInWithPassword?key=demo-api-key`,null,'POST',{email,password,returnSecureToken:true});}
  }
  assert.equal(r.status,200);const claims=JSON.parse(Buffer.from(r.body.idToken.split('.')[1],'base64url'));
  assert.equal(claims.aud,project);assert.equal(claims.firebase.sign_in_provider,provider);assert.equal(claims.email_verified,verified);
  return {uid:r.body.localId,token:r.body.idToken,provider};
}
function sessionData(f,a=f.owner,h=f.human,revision=1) {return {schemaVersion:2,environmentId:'FAKE-environment',performanceId:f.show,deviceUid:a.uid,humanUid:h.uid,active:true,emailVerified:true,authProvider:h.provider,roleRevision:1,revision,humanAuthTime:{$timestamp:new Date(JSON.parse(Buffer.from(h.token.split('.')[1],'base64url')).auth_time*1000).toISOString()},expiresAt:{$timestamp:new Date(Date.now()+3600000).toISOString()}};}
function sessionWrite(f,a=f.owner,h=f.human,revision=1,overrides={}) {
 const s={...sessionData(f,a,h,revision),...overrides};const w=update(f,'sessions/'+a.uid,s,undefined,revision>1);
 if(!Object.hasOwn(s,'issuedAt'))w.updateTransforms=[{fieldPath:'issuedAt',setToServerValue:'REQUEST_TIME'}];return w;
}
async function issue(f,a=f.owner,h=f.human,revision=1) {
 const r=await request(`${base}:commit`,h.token,'POST',{writes:[sessionWrite(f,a,h,revision)]});ok(r);f.sessionCosts.requests++;f.sessionCosts.writes++;return data(await get(f,'sessions/'+a.uid));
}
async function revoke(f,a=f.owner,h=f.human) {
 const before=data(await get(f,'sessions/'+a.uid));const w=update(f,'sessions/'+a.uid,{active:false,revision:before.revision+1},['active','revision'],true);
 const r=await request(`${base}:commit`,h.token,'POST',{writes:[w]});ok(r);return before;
}


const relative=(f,suffix)=>'publicationShows/'+f.show+'/'+suffix;
const name=(f,suffix)=>'projects/'+project+'/databases/(default)/documents/'+relative(f,suffix);
const update=(f,suffix,value,exists)=>({update:{name:name(f,suffix),fields:fields(value)},...(exists===undefined?{}:{currentDocument:{exists}})});
const get=(f,suffix,token='owner')=>request(base+'/'+relative(f,suffix),token);
const data=r=>decode({mapValue:{fields:r.body.fields}});
const commit=(f,writes,token=f.owner.token)=>request(base+':commit',token,'POST',{writes});
const ok=r=>assert.equal(r.status,200,JSON.stringify(r.body));
const denied=r=>assert.equal(r.status,403,JSON.stringify(r.body));
const seed=async(f,path,value)=>ok(await commit(f,[update(f,path,value)],'owner'));
export {project,actor,human,issue,commit,update,get,data,ok,denied,seed};

export {request, fields, base};
