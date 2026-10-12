import fs from 'node:fs';import assert from 'node:assert/strict';
import {digest} from './meter.mjs';
await import('../GD91-73/tests/transport-partials.mjs');
const t=await import('../GD91-73/tests/support.mjs');
const {data}=await import('../GD91-60/tests/transport.mjs');
const sources=['retention.mjs','../GD91-73/node_modules/.cache/firestore.rules','../GD91-73/tests/transport-partials.mjs'];
const hashes=()=>Object.fromEntries(sources.map(p=>[p,digest(new URL(p,import.meta.url))]));
const sourceHashes=hashes(),reports=[];
try{
 const f=await t.fixture(),v=await t.version(f),old=v.sections[f.section];
 const originalOperation=v.operationId;
 const ext=await t.extension(f);await t.confirmExtension(f,ext);
 const next=await t.version(f);assert.notEqual(next.sections[f.section],old);
 const shared=await t.draftPlan(f,{fixture:'FAKE-retention'});t.ok(await t.commit(shared.writes,f.manager.token));
 const paths=[['current-canonical',t.path(f,'versions/current')],['current-geometry','sourceProofShows/'+f.show+'/sections/'+f.section+'/generations/'+next.sections[f.section]+'/chunks/0-0'],['retired-geometry','sourceProofShows/'+f.show+'/sections/'+f.section+'/generations/'+old+'/chunks/0-0'],['operation-result',t.path(f,'operations/'+originalOperation)],['shared-result',t.path(f,'sharedDrafts/'+shared.id)]];
 for(const [id,path]of paths){
  const name='projects/demo-concert-seat-gd91-60/databases/(default)/documents/'+path;
  const r=await t.commit([{delete:name,currentDocument:{exists:true}}],f.manager.token);assert.equal(r.status,403);
  const check=await t.request(t.base+'/'+path,'owner');t.ok(check);reports.push({id,status:'passed',deleteDenied:true,documentRetained:true});
 }
 const current=await t.stored(f,'candidates/'+next.sections[f.section]);
 const changed=await t.commit([t.write(t.path(f,'candidates/'+next.sections[f.section]),{...current,status:'deleting'},true)],f.manager.token);assert.equal(changed.status,403);reports.push({id:'unverified-retirement',status:'passed',transitionDenied:true});
 const operation=await t.request(t.base+'/'+t.path(f,'operations/'+originalOperation),f.manager.token);t.ok(operation);assert.equal(data(operation).operationId,originalOperation);
 const draft=await t.request(t.base+'/'+t.path(f,'sharedDrafts/'+shared.id),f.manager.token);t.ok(draft);assert.equal(data(draft).operationId,shared.id);reports.push({id:'same-id-result-survives',status:'passed',operationAndSharedResultsReadable:true});
 const endSourceHashes=hashes();assert.deepEqual(sourceHashes,endSourceHashes);fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('artifacts/retention.json',import.meta.url),JSON.stringify({sourceHashes,endSourceHashes,reports,safeReclamationSuccessTested:false,positiveDeletionImplemented:false},null,2)+'\n');console.log(JSON.stringify({scenarios:reports.length,allPassed:true,safeReclamationImplemented:false}));
}catch(e){fs.mkdirSync(new URL('artifacts/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('artifacts/failed-retention-'+Date.now()+'.json',import.meta.url),JSON.stringify({sourceHashes,reports,error:String(e)},null,2)+'\n');throw e;}
