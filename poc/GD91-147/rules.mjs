import {generated as original} from '../GD91-146/rules.mjs';import {base as R,recentManager} from '../GD91-84/auth-rules.mjs';import {owner} from './principal.mjs';
import assert from 'node:assert/strict';
export const namespace='demo-concert-seat-gd91-84-import-formal-path',environment='gd91-147-local';
const previousOwner=`(${recentManager} && ${R}.child('roles').child(${R}.child('devices').child(auth.uid).child('humanUid').val()).child('role').val() === 'owner')`;
const formalRoot="root.child('environments/'+$environment+'/performances/'+$run)";
function compact(s){let out='',quote=null,regex=false,escape=false;for(let i=0;i<s.length;i++){const c=s[i];if(escape){out+=c;escape=false;continue;}if(c==='\\'&&(quote||regex)){out+=c;escape=true;continue;}if(quote){out+=c;if(c===quote)quote=null;continue;}if(regex){out+=c;if(c==='/')regex=false;continue;}if(c==="'"||c==='"'){quote=c;out+=c;continue;}if(c==='/'&&s.slice(Math.max(0,i-9),i)==='.matches('){regex=true;out+=c;continue;}if(!/\s/.test(c))out+=c;}return out;}
const A=`${R}.child('imports').child(${R}.child('importHead').val())`,M=`${A}.child('manifest')`;
const redundantLeaseHuman=` && ${A}.child('lease/ownerHuman').val() === ${M}.child('ownerHuman').val()`;
function transform(node,specialize){for(const[k,value]of Object.entries(node)){if(value&&typeof value==='object')transform(value,specialize);else if(typeof value==='string')node[k]=compact((specialize?value.replaceAll(previousOwner,owner).replaceAll(redundantLeaseHuman,''):value).replaceAll(R,formalRoot).replaceAll('$environment','$env'));}}
export function fullOriginal(){const r=original(),node=r.rules.checks.$run;function replace(n){for(const[k,v]of Object.entries(n))if(v&&typeof v==='object')replace(v);else if(typeof v==='string')n[k]=v.replaceAll(R,"root.child('environments').child($environment).child('performances').child($run)");}replace(node);return{rules:{'.read':false,'.write':false,environments:{$environment:{performances:{$run:node}}}}};}
export function generated(){const r=original(),node=r.rules.checks.$run;
 // leaseの作成・更新は固定したmanifestの本人と一致させる。manifestは更新不能。
 // この不変条件で保証済みの一致を、各値のコピー式へ重複展開しない。
 assert(node.imports.$job.lease['.validate'].includes("newData.child('ownerHuman').val() === newData.parent().parent().parent().child('imports').child($job).child('manifest').child('ownerHuman').val()"));
 assert(node.imports.$job.manifest['.write'].includes('!data.exists()'));
 delete node.control.startedAt;delete node.control.firstStartedAt;
 transform(node,true);return{rules:{'.read':false,'.write':false,environments:{$env:{performances:{$run:node}}}}};}
export const wirePath=p=>p.startsWith('checks/')?'environments/'+environment+'/performances/'+p.slice('checks/'.length):p;
