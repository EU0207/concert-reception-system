import fs from 'node:fs';import assert from 'node:assert/strict';
const root=new URL('./',import.meta.url),cache=new URL('node_modules/.cache/',root);fs.mkdirSync(cache,{recursive:true});
function imports(code,original){return code.replace(/^import[^\r\n]*$/gm,line=>line.replace(/from (['"])(\.\.?\/[^'"]+)\1/g,(_,q,p)=>'from '+JSON.stringify(new URL(p,original).href)));}
const baseUrl=new URL('../GD91-146/rules.mjs',root);let base=fs.readFileSync(baseUrl,'utf8');
assert(base.includes("from '../GD91-145/bundle.mjs'"));base=base.replace("from '../GD91-145/bundle.mjs'",'from '+JSON.stringify(new URL('bundle.mjs',root).href));
assert(base.includes('const r=previous(),run=r.rules.checks.$run;'));base=base.replace('const r=previous(),run=r.rules.checks.$run;',`const r=previous(),run=r.rules.checks.$run;run.migrationOrigins={'.read':manager,'.write':false};
run.references.$ref['.read']='(('+manager+" && data.child('active').val() === false) || ("+run.references.$ref['.read']+'))';
const sourceRead=run.quarantine.$device.events.$key['.read'];
if(sourceRead.includes('$key') || /\\bdata\\b/.test(sourceRead))throw Error('recovery-read-context-changed');
const refRead=sourceRead.replaceAll('$device',base+".child('references').child($ref).child('deviceUid').val()");
for(const name of ['quarantineReviewState','referenceClosures','reviewReleases'])run[name].$ref['.read']='(('+run[name].$ref['.read']+') && ('+refRead+'))';
`);
base=base.replaceAll('gd91-native-rtdb-closed-v1','gd91-native-rtdb-closed-v2');
const ruleAnchor="&& (${v('newData','path')} !== 'control/state' || ${v('newData','value')} === 'closed')";assert(base.includes(ruleAnchor));base=base.replace(ruleAnchor,ruleAnchor+" && (!${v('newData','path')}.matches(/^references\\/[^\\/]+\\/active$/) || ${v('newData','value')} === false)");
const baseFile=new URL('native-reference-rules.mjs',cache);fs.writeFileSync(baseFile,imports(base,baseUrl));
const scopedUrl=new URL('../GD91-147/rules.mjs',root);let scoped=fs.readFileSync(scopedUrl,'utf8');assert(scoped.includes("from '../GD91-146/rules.mjs'"));scoped=scoped.replace("from '../GD91-146/rules.mjs'",'from '+JSON.stringify(baseFile.href)).replaceAll('demo-concert-seat-gd91-84-import-formal-path','demo-concert-seat-gd91-84-import-lineage').replaceAll('gd91-147-local','gd91-148-local');
const scopedFile=new URL('scoped-reference-rules.mjs',cache);fs.writeFileSync(scopedFile,imports(scoped,scopedUrl));const module=await import(scopedFile.href);export const generated=module.generated,namespace=module.namespace,environment=module.environment,wirePath=module.wirePath;
