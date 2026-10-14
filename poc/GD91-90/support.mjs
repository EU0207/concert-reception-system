import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {request,ok} from '../GD91-84/transport.mjs';import {command as lifecycle,proposal as seat} from './model.mjs';
export {cleanup,setup,trial,owner,user,request,ok,issue} from '../GD91-89/support.mjs';
const head={generation:'layout',revision:1};
export const command=(f,state,kind,id,options)=>lifecycle(f,state,head,kind,id,options);
export const proposal=(f,state,kind,...args)=>seat(f,state,head,kind,...args);
const files=['support.mjs','model.mjs','bulk-rules.mjs','generate.mjs','database.rules.json','../GD91-89/projection.mjs','../GD91-89/projection-rules.mjs','../GD91-89/sdk-client.mjs','../GD91-89/support.mjs','../GD91-88/model.mjs','../GD91-88/lifecycle-rules.mjs','../GD91-88/receipt-client.mjs','../GD91-88/receipt-rules.mjs','../GD91-87/receipt-client.mjs','../GD91-87/receipt-rules.mjs','../GD91-86/model.mjs','../GD91-84/transport.mjs','../GD91-84/generation-tests.mjs','../GD91-84/auth-rules.mjs'];
export const hashes=extra=>Object.fromEntries([...new Set([...files,...extra])].map(f=>[f,createHash('sha256').update(fs.readFileSync(new URL(f,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
export async function rules(){ok(await request('.settings/rules',{token:'owner',method:'PUT',body:JSON.parse(fs.readFileSync(new URL('database.rules.json',import.meta.url),'utf8'))}));}
export function finish(name,before,reports,cleanup,other={}){const end=hashes(Object.keys(before));assert.deepEqual(before,end);fs.writeFileSync(new URL('artifacts/'+name+'-summary.json',import.meta.url),JSON.stringify({sourceHashes:before,endSourceHashes:end,reports,cleanup,...other,externalFirebaseConnected:false,productionFreeTierVerified:false,tested3000:false},null,2)+'\n');console.log(JSON.stringify({suite:name,groups:reports.length,cleanup}));}
