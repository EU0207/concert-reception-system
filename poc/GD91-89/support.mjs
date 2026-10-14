import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {trial,owner,user,request,provision,issue,ok,metrics} from '../GD91-84/transport.mjs';
import {build,layoutItem,publish} from '../GD91-84/generation-tests.mjs';
import {initialize,applyModel,command,proposal,download} from './projection.mjs';
export {trial,owner,user,request,provision,issue,ok,metrics,command,proposal,download};
export const files=['support.mjs','projection.mjs','projection-rules.mjs','generate.mjs','database.rules.json','deny.rules.json','../GD91-88/model.mjs','../GD91-88/lifecycle-rules.mjs','../GD91-88/receipt-rules.mjs','../GD91-87/receipt-rules.mjs','../GD91-87/receipt-client.mjs','../GD91-86/model.mjs','../GD91-84/transport.mjs','../GD91-84/generation-tests.mjs','../GD91-84/auth-rules.mjs'];
export const hashes=extra=>Object.fromEntries([...files,...extra].map(f=>[f,createHash('sha256').update(fs.readFileSync(new URL(f,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
export async function rules(file='database.rules.json'){ok(await request('.settings/rules',{method:'PUT',token:'owner',body:JSON.parse(fs.readFileSync(new URL(file,import.meta.url),'utf8'))}));}
export async function cleanup(){await rules('deny.rules.json');const closed=(await request('.settings/rules',{token:'owner'})).body;await owner(trial,'DELETE');return{rulesClosed:JSON.stringify(closed)===JSON.stringify(JSON.parse(fs.readFileSync(new URL('deny.rules.json',import.meta.url),'utf8'))),trialRootEmpty:(await owner(trial))===null};}
export async function setup(people=2,sections=2){
  await owner(trial+'/control','PUT',{state:'preparing',revision:1});const manager=await provision('owner'),staff=await provision('receptionist');ok(await issue(manager));ok(await issue(staff));
  const cells=Array.from({length:people*2},(_,i)=>layoutItem(i,i<people?'seat':['unset','space','aisle','gap'][i%4],'sec'+i%sections));
  const layout=await build(manager,'layout','layout',cells,sections);ok(await user('',manager.device,'PATCH',publish('layout',1,'initial-layout')));
  const state=initialize();ok(await user('event',manager.device,'PATCH',{commit:state.commit,'reception/0000000000':1}));
  async function send(body){const r=await user('event',manager.device,'PATCH',body);ok(r);applyModel(state,body);return r;}
  return{manager,staff,state,send,layout,cells,control:async(state,revision)=>owner(trial+'/control','PUT',{state,revision}),read:f=>async(p,params={})=>{const response=await request(trial+'/'+p,{token:f.device.token,params});ok(response);return response.body;}};
}
export function finish(name,before,reports,clean,other={}){const end=Object.fromEntries(Object.keys(before).map(f=>[f,createHash('sha256').update(fs.readFileSync(new URL(f,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));assert.deepEqual(before,end);const report={sourceHashes:before,endSourceHashes:end,reports,cleanup:clean,...other,externalFirebaseConnected:false,productionFreeTierVerified:false,tested3000:false};fs.writeFileSync(new URL('artifacts/'+name+'-summary.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({suite:name,groups:reports.length,cleanup:clean}));}
