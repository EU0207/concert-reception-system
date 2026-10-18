import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {chromium} from '../POC-001/node_modules/playwright/index.mjs';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
const root=new URL('./',import.meta.url),files=['run-local.mjs','browser.mjs'],before=sourceHashes(root,files),reports=[];
const cache=fileURLToPath(new URL('node_modules/.cache/',root)),profile=path.join(cache,'migration-'+randomUUID());fs.mkdirSync(cache,{recursive:true});
let context,page,externalRequests=0,dbRequests=0;
const server=http.createServer((req,res)=>{if(req.url==='/browser.mjs'){res.setHeader('content-type','text/javascript');res.end(fs.readFileSync(new URL('browser.mjs',root)));}
 else if(req.url==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>隔離移行試験</title><script type="module" src="/browser.mjs"></script>');}else{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
async function launch(){context=await chromium.launchPersistentContext(profile,{channel:'msedge',headless:true});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin){externalRequests++;return route.abort();}if(['9000','9191','9100','9291'].includes(u.port))dbRequests++;return route.continue();});
 page=await context.newPage();await page.goto(origin);await page.waitForFunction(()=>window.migration);}
const call=(name,value)=>page.evaluate(({name,value})=>window.migration[name](value),{name,value});
const report=(id,facts)=>reports.push({id,...facts});
try{
 await launch();const seeded=await call('seed'),initial=await call('inspect');assert(initial.exportDenied&&!initial.oldKeyExtractable&&!initial.plaintextStored);
 await context.close();await launch();assert.equal((await call('inspect')).oldHash,seeded.oldHash);
 report('I01-persistent-encrypted-source',{browserRestartPreserved:true,keyNonextractable:true,originalBaseVersionPreserved:true});
 const result={...seeded.pending,status:'committed'},options={format:2,targetVerified:true,newIdentityPrepared:true,result,unsentEvents:0};
 const invalid=[{result:{...result,status:'unknown'}},{result:{...result,status:'notFound'}},{result:{...result,contentHash:'mismatch'}},
  {result:{...result,id:randomUUID()}},{format:99},{targetVerified:false},{newIdentityPrepared:false},{unsentEvents:1}];
 for(const patch of invalid){await assert.rejects(()=>call('migrate',{...options,...patch}));assert.deepEqual(await call('inspect'),initial);}
 report('I02-rejected-inputs',{cases:invalid.length,noChanges:true,notFoundDoesNotResolveUnknown:true});
 await assert.rejects(()=>call('migrate',{...options,abort:true}));assert.deepEqual(await call('inspect'),initial);
 await context.close();await launch();assert.deepEqual(await call('inspect'),initial);
 report('I03-transaction-abort',{configDraftKeyAndPendingRolledBack:true,browserRestartCompared:true});
 await assert.rejects(()=>call('migrate',{...options,corrupt:true}));assert.deepEqual(await call('inspect'),initial);
 report('I04-conversion-failure',{originalUnchanged:true,corruptedCiphertextRejected:true});
 const next=await call('migrate',options);assert.equal(next.oldHash,seeded.oldHash);assert.equal(next.config.adapter,'rtdb');assert(!next.config.writesAllowed);
 assert(next.newDraft.needsReview&&!next.newDraft.automaticallyCommitted&&next.newIdentityUsesSeparateKey&&!next.newKeyExtractable);
 assert.deepEqual(next.newDraft.sourceBaseVersions,initial.oldBaseVersions);assert.equal(next.pending.status,'committed');
 await context.close();await launch();assert.deepEqual(await call('inspect'),next);
 await assert.rejects(()=>call('migrate',options));
 report('I05-atomic-switch',{originalPreserved:true,newDraftNeedsReview:true,separateNewIdentityKey:true,noAutomaticSend:true,restartAndRepeatedSwitchChecked:true});
 const stopped=await call('stopAfterNewFact');assert(stopped.config.recoveryDecisionRequired&&!stopped.config.legacyResumeAllowed&&stopped.newFactPreserved);
 assert.equal(stopped.oldHash,seeded.oldHash);assert.deepEqual(stopped.newDraft,next.newDraft);
 report('I06-rollback-after-new-fact',{stoppedSelectionPersisted:true,oldDraftNewDraftAndNewFactPreserved:true,legacyNotAutomaticallyResumed:true,newFactPreconditionSeeded:true});
 assert.equal(externalRequests,0);assert.equal(dbRequests,0);
}finally{
 if(context)await context.close();await new Promise(r=>server.close(r));
 const realCache=fs.realpathSync(cache),realProfile=fs.realpathSync(profile);
 assert(path.dirname(realProfile)===realCache&&path.basename(realProfile).startsWith('migration-'));
 fs.rmSync(realProfile,{recursive:true});
}
const after=sourceHashes(root,files);assert.deepEqual(before,after);fs.mkdirSync(new URL('artifacts/',root),{recursive:true});
fs.writeFileSync(new URL('artifacts/local-summary.json',root),JSON.stringify({sourceHashes:before,endSourceHashes:after,reports,
 realBrowserIndexedDb:true,browser:'installed headless Microsoft Edge',externalRequests,dbRequests,isolatedProfileRemoved:true,
 actualSdkAdapterSwitchVerified:false,formalBackupFormatVerified:false,productionImplementation:false,credentialValuesPersisted:false},null,2)+'\n');
console.log(JSON.stringify({groups:reports.length,externalRequests,dbRequests,isolatedProfileRemoved:true}));
