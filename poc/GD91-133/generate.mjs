import fs from 'node:fs';import assert from 'node:assert/strict';
await import('../GD91-130/generate.mjs');
const root=new URL('./',import.meta.url),cache=new URL('node_modules/.cache/',root);fs.mkdirSync(cache,{recursive:true});
for(const file of ['firestore.rules','deny.rules.json','storage.mjs'])fs.copyFileSync(new URL('../GD91-130/node_modules/.cache/'+file,root),new URL(file,cache));
let storage=fs.readFileSync(new URL('storage.mjs',cache),'utf8');const pending="pending={id:draft.operationId,contentHash:hash,status:'unknown'}";
assert(storage.includes(pending));storage=storage.replace(pending,"pending=input.pending??{id:draft.operationId,contentHash:hash,status:'unknown'}");fs.writeFileSync(new URL('storage.mjs',cache),storage);
const ports=s=>s.replace(/\b9100\b/g,'9200').replace(/\b9291\b/g,'9391').replace(/\b8181\b/g,'8281').replace(/\b4183\b/g,'4184');
for(const file of ['browser.mjs','browser.html','bootstrap.mjs','firebase.json','run-local.mjs']){
 let text=ports(fs.readFileSync(new URL('../GD91-130/'+file,root),'utf8').replaceAll('GD91-130','GD91-133'));
 if(file==='bootstrap.mjs')text=text.replace("const original=globalThis.fetch;","assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8281');process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8181';\nconst original=globalThis.fetch;")
  .replace("url.port='9391';","url.port='9391';if(url.hostname==='127.0.0.1'&&url.port==='8181')url.port='8281';");
 fs.writeFileSync(new URL(file,root),text);
}
let source=fs.readFileSync(new URL('../GD91-130/local.mjs',root),'utf8');
const replace=(a,b)=>{assert.equal(source.split(a).length,2,a);source=source.replace(a,b);};
replace('{randomUUID,createHash}', '{randomUUID,createHash,webcrypto}');
replace("const root=new URL('./',import.meta.url)","import {create as createBackup,restoreCheck} from '../GD91-132/format.mjs';\nconst root=new URL('./',import.meta.url)");
replace("'../GD91-129/browser.mjs'","'../GD91-129/browser.mjs','../GD91-130/local.mjs','../GD91-130/generate.mjs','../GD91-132/format.mjs'");
replace(' // 下書き・応答不明記録は、実際に旧正本で確定した同じ操作を指す。',`
 const shared=await t.draftPlan(f,{formatVersion:1,models:[f.next.model],sourceBaseVersions:version.values});await t.apply(f,shared);
 const decryptedShared=await t.decryptDraft(shared);
 assert.equal(shared.key.extractable,false);await assert.rejects(()=>webcrypto.subtle.exportKey('raw',shared.key));
 const corrupt=structuredClone(shared.draft),bytes=Buffer.from(corrupt.payload.ciphertext,'base64');bytes[0]^=1;corrupt.payload.ciphertext=bytes.toString('base64');
 await assert.rejects(()=>t.decryptDraft(shared,corrupt));
 // 実際の旧共有暗号文を、旧鍵を抽出せず復号し、新本人用の再確認待ち案へ変換する。`);
replace('content:operation,operationId:version.operationId}})',"content:decryptedShared,operationId:shared.id},pending:{id:version.operationId,contentHash:digest(operation),status:'unknown'}})");
replace('realOldSdkResultLookupMatched:true','realOldSdkResultLookupMatched:true,realLegacySharedCiphertextSaved:true,legacyKeyNotExported:true,tamperedLegacyDraftRejected:true');
replace("page=await context.newPage();await page.goto", "phase='browser-module';page=await context.newPage();await page.goto");
replace("const oldDevice=await call('sdkSwitch','old')", "phase='old-sdk-actor';const oldDevice=await call('sdkSwitch','old')");
replace("const oldPath=t.path(f,'versions/current')", "phase='old-sdk-read';const oldPath=t.path(f,'versions/current')");
replace("const device=await call('sdkSwitch','prepareNext')", "phase='new-sdk-actor';const device=await call('sdkSwitch','prepareNext')");
replace("const shared=await t.draftPlan", "phase='shared-plan';const shared=await t.draftPlan");
replace("await t.apply(f,shared);", "phase='shared-save';await t.apply(f,shared);");
replace("const decryptedShared=await t.decryptDraft", "phase='shared-decrypt';const decryptedShared=await t.decryptDraft");
replace("const seeded=await call('migration','seed'", "phase='indexeddb-seed';const seeded=await call('migration','seed'");
replace('const source=await readSnapshot(f),snapshot=await convert(source,randomUUID());compare(source,snapshot);',`
 const source=await readSnapshot(f),backupContext={role:'owner',online:true,now:Date.now(),reauthAt:Date.now()-1000},ledger={sourceEnvironment:source.versions.environmentId,targetEmpty:true,deletedPeople:source.deletions};
 const backup=await createBackup(source,backupContext),restored=await restoreCheck(backup.wrapper,backup.recoveryKey,backupContext,ledger);
 const recovered={format:1,...restored.eventsAndSettings,pendingOperations:[],unsentEvents:0,reconciliation:source.reconciliation};assert.deepEqual(recovered,source);
 const closed=structuredClone(source);closed.control.state='closed';const closedBackup=await createBackup(closed,backupContext);
 const preserved=await restoreCheck(closedBackup.wrapper,closedBackup.recoveryKey,backupContext,{...ledger,closed:true,closeOperationId:closed.control.operationId});
 assert.equal(preserved.eventsAndSettings.control.state,'closed');assert.equal(await owner(target),null);
 await assert.rejects(()=>convert(closed,randomUUID()),/unsupported-source-state/);assert.equal(await owner(target),null);
 const snapshot=await convert(recovered,randomUUID());compare(source,snapshot);
 assert.deepEqual(source.sharedDrafts[shared.id].payload,shared.draft.payload);
`);
replace('allSourceDevicesReconciled:true','allSourceDevicesReconciled:true,bd08FormatCandidateRoundtrip:true,dedicatedBackupKey:true,allBusinessAreasCompared:true,closedOpaqueSourcePreservedAndActivationRejected:true,closedStatePreconditionSeeded:true,legacySharedCiphertextPreserved:true');
replace('oldDraftPreserved:true','oldDraftPreserved:true,convertedSharedDraftNeedsReview:true');
replace("await call('migration','migrate',options);assert.equal((await call('migration','inspect')).oldHash,seeded.oldHash);",`
 await call('migration','migrate',options);const migrated=await call('migration','inspect');assert.equal(migrated.oldHash,seeded.oldHash);
 assert(migrated.newDraft.needsReview&&!migrated.newDraft.automaticallyCommitted);assert.deepEqual(migrated.newDraft.content,decryptedShared);
 assert.equal(migrated.newDraft.sourceOperationId,shared.id);assert.deepEqual(migrated.newDraft.sourceBaseVersions,version.values);
`);
replace('formalBackupFormatVerified:false','formalBackupFormatCandidateVerified:true,formalBackupImplementationAccepted:false,closedBusinessSchemaConverted:false');
replace('}catch(e){failure={phase,code:e.code??e.name,...failureDiagnostic(e)};process.exitCode=1;}',"}catch(e){failure={phase,code:e.code??e.name,...failureDiagnostic(e),...(String(e.message).match(/(?:auth|database|firestore)\\/[a-z-]+/)?{firebaseCode:String(e.message).match(/(?:auth|database|firestore)\\/[a-z-]+/)[0]}:{})};console.log(JSON.stringify({failure}));process.exitCode=1;}");
replace('fs.rmSync(b,{recursive:true});isolatedProfileRemoved=true;',"try{fs.rmSync(b,{recursive:true,maxRetries:10,retryDelay:200});isolatedProfileRemoved=true;}catch(e){console.log(JSON.stringify({profileCleanupCode:e.code}));}");
assert.equal(source.split('/poc/GD91-130/browser.html').length,3);
fs.writeFileSync(new URL('local.mjs',root),ports(source).replaceAll('/poc/GD91-130/browser.html','/poc/GD91-133/browser.html'));
