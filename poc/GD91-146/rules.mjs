import {generated as previous} from '../GD91-126/contract-rules.mjs';
import {base,manager,recentManager} from '../GD91-84/auth-rules.mjs';
import {business} from '../GD91-145/bundle.mjs';
const R=base,v=(n,p)=>`${n}.child('${p}').val()`,up=d=>'newData'+'.parent()'.repeat(d);
const active=`${R}.child('imports').child(${v(R,'importHead')})`,meta=`${active}.child('meta')`,manifest=`${active}.child('manifest')`;
const owner=`(${recentManager} && ${R}.child('roles').child(${R}.child('devices').child(auth.uid).child('humanUid').val()).child('role').val() === 'owner')`;
const sameHuman=`(${owner} && ${v(manifest,'ownerHuman')} === ${R}.child('devices').child(auth.uid).child('humanUid').val())`;
const fixedOwner=`(${sameHuman} && ${v(active,'lease/ownerDevice')} === auth.uid && ${v(active,'lease/ownerHuman')} === ${v(manifest,'ownerHuman')})`;
const lease=`(${fixedOwner} && ${v(active,'lease/expiresAt')} > now)`;
const running=`(${R}.child('importHead').exists() && ${v(meta,'phase')} !== 'published' && ${v(meta,'phase')} !== 'cleaned')`;
const copying=`(${lease} && ${v(meta,'phase')} === 'copying')`,chunk=`${active}.child('chunks').child('c'+${v(meta,'copied')})`;
const fieldNames=['password','token','idToken','refreshToken','privateKey','cryptoKey','deviceCryptoKey','qrPayload','invitationLink','serviceAccount','authenticationUsers','roles','devices','sessions'];
const shape=(names)=>Object.fromEntries(names.map(x=>[x,{'.validate':true}]));
const primitive=n=>`(${n}.isString() || ${n}.isBoolean() || ${n}.isNumber())`;
function leafWrite(path,depth,index=false){
 const N=up(depth),nm=`${N}.child('imports').child(${v(R,'importHead')}).child('meta')`;
 const position=index?'newData.val()':`${N}.child('imports').child(${v(R,'importHead')}).child('copiedPaths').child(${path}).val()`;
 const offset=`((${position}) % 16)`,e=`${chunk}.child('entries').child('e'+${offset})`;
 const ancestors=Array.from({length:depth-(index?3:0)-1},(_,i)=>{const p='data'+'.parent()'.repeat(i+1);return index?`!${p}.isNumber()`:`(!${p}.exists() || ${p}.hasChildren())`;}).join(' && ');
 return`(${copying} && ${primitive('newData')} && (!data.exists()${index?'':` || (${path}).beginsWith('control/')`})${ancestors?' && '+ancestors:''} && ${v(nm,'copied')} === ${v(meta,'copied')} + 1 && ${v(nm,'phase')} === 'copying' && (${position}) >= ${v(meta,'copied')} * 16 && (${position}) < ${v(meta,'copied')} * 16 + ${v(chunk,'count')} && ${v(e,'path')} === (${path})${index?'':` && newData.val() === ${v(e,'value')}`})`;
}
function native(node,parts,depthLeft=0){
 const realChildren=Object.keys(node).filter(k=>!k.startsWith('.')),isTerminal=realChildren.length===0;
 if(isTerminal&&node['.validate']===undefined)depthLeft=4;
 const path=parts.map(k=>k.startsWith('$')?k:JSON.stringify(k)).join(" + '/' + "),importWrite=leafWrite(path,parts.length);
 node['.write']=`((!${running} && (${node['.write']??false})) || ${isTerminal||parts.at(-1)==='ticketSnapshot'?importWrite:false})`;
 if(node['.read']!==undefined)node['.read']=`(!${running} && (${node['.read']}))`;
 if(node['.validate']!==undefined&&node['.validate']!==false)node['.validate']=`(${running} || (${node['.validate']}))`;
 for(const k of realChildren){if(k==='$other'&&node[k]['.validate']===false)continue;native(node[k],[...parts,k],depthLeft);}
 if(isTerminal&&depthLeft>0){
  const variable='$m'+parts.length,child={'.validate':fieldNames.map(x=>`${variable} !== '${x}'`).join(' && ')};
  node[variable]=child;native(child,[...parts,variable],depthLeft-1);
 }
}
function indexTree(parts,remaining){
 const path=parts.map(k=>k.startsWith('$')?k:JSON.stringify(k)).join(" + '/' + "),depth=parts.length+3;
 const node={'.write':leafWrite(path,depth,true),'.validate':'newData.hasChildren() || (newData.isNumber() && newData.val() >= 0 && newData.val() % 1 === 0)'};
 if(remaining>0)node['$x'+parts.length]=indexTree([...parts,'$x'+parts.length],remaining-1);return node;
}
export function generated(){
 const r=previous(),run=r.rules.checks.$run;
 for(const area of business)if(run[area]){
  if(area==='control')for(const name of ['state','revision','layoutSchemaVersion','businessSchemaVersion','layoutAuditVersion','layoutEditVersion','closingSchemaVersion','endedAt','startedAt','firstStartedAt'])run.control[name]={'.validate':true};
  native(run[area],[area]);run[area]['.read']=`((!${running} && (${run[area]['.read']??false})) || (${lease} && ${running}))`;
 }
 if(run['.validate'])run['.validate']=`(${running} || (${run['.validate']}))`;
 const N=up(3),J=`${N}.child('imports').child($job)`,M=`${J}.child('meta')`,F=`${J}.child('manifest')`,oldJ=`${R}.child('imports').child($job)`;
 const fresh=business.filter(k=>k!=='control').map(k=>`!${R}.child('${k}').exists()`).join(' && ');
 const creating=`(${owner} && !${R}.child('importHead').exists() && !${R}.child('activeImport').exists() && ${fresh} && ${v(N,'importHead')} === $job)`;
 const sameOwner=`${v(F,'ownerDevice')} === auth.uid && ${v(F,'ownerHuman')} === ${R}.child('devices').child(auth.uid).child('humanUid').val()`;
 const sameMeta=fields=>fields.map(k=>`${v('newData',k)} === ${v('data',k)}`).join(' && ');
 const newLease=`${J}.child('lease')`;
 const createMeta=`(!data.exists() && ${creating} && ${v('newData','phase')} === 'uploading' && ${v('newData','uploaded')} === 0 && ${v('newData','copied')} === 0 && ${v('newData','cleaned')} === 0 && ${v('newData','verifiedSourceHash')} === '')`;
 const uploading=`(${lease} && $job === ${v(R,'importHead')} && ${v('data','phase')} === 'uploading' && ${v('newData','phase')} === 'uploading' && ${v('newData','uploaded')} === ${v('data','uploaded')} + 1 && ${v('newData','uploaded')} <= ${v(manifest,'totalChunks')} && ${J}.child('chunks').child('c'+${v('data','uploaded')}).exists() && ${sameMeta(['copied','cleaned','verifiedSourceHash'])})`;
 const sealed=`(${lease} && ${v('data','phase')} === 'uploading' && ${v('data','uploaded')} === ${v(manifest,'totalChunks')} && ${v('newData','phase')} === 'copying' && ${sameMeta(['uploaded','copied','cleaned','verifiedSourceHash'])})`;
 const checks=Array.from({length:16},(_,i)=>{const E=`${chunk}.child('entries/e${i}')`;return`(${v(chunk,'count')} <= ${i} || (${N}.child(${v(E,'path')}).val() === ${v(E,'value')} && ${J}.child('copiedPaths').child(${v(E,'path')}).val() === ${v('data','copied')} * 16 + ${i}))`;}).join(' && ');
 const copyingStep=`(${copying} && $job === ${v(R,'importHead')} && ${v('newData','phase')} === 'copying' && ${v('newData','copied')} === ${v('data','copied')} + 1 && ${v('newData','copied')} <= ${v(manifest,'totalChunks')} && ${sameMeta(['uploaded','cleaned','verifiedSourceHash'])} && ${checks})`;
 const ready=`(${lease} && ${v('data','phase')} === 'copying' && ${v('data','copied')} === ${v(manifest,'totalChunks')} && ${v('newData','phase')} === 'ready' && ${sameMeta(['uploaded','copied','cleaned'])} && ${v('newData','verifiedSourceHash')} === ${v(manifest,'sourceHash')} && ${v(R,'control/state')} === 'closed')`;
 const publication=`(${lease} && ${v('data','phase')} === 'ready' && ${v('newData','phase')} === 'published' && ${sameMeta(['uploaded','copied','cleaned','verifiedSourceHash'])} && ${v(N,'activeImport')} === $job && ${J}.child('receipt').exists())`;
 const cleanup=`(${lease} && ${v('data','phase')} === 'published' && ${v('newData','phase')} === 'published' && ${sameMeta(['uploaded','copied','verifiedSourceHash'])} && ${v('newData','cleaned')} === ${v('data','cleaned')} + 1 && ${v('newData','cleaned')} <= ${v(manifest,'totalChunks')} && !${J}.child('chunks').child('c'+${v('data','cleaned')}).exists())`;
 const cleaned=`(${lease} && ${v('data','phase')} === 'published' && ${v('newData','phase')} === 'cleaned' && ${sameMeta(['uploaded','copied','cleaned','verifiedSourceHash'])} && ${v('data','cleaned')} === ${v(manifest,'totalChunks')} && !${J}.child('copiedPaths').exists())`;
 const manifestFields=['format','sourceHash','sourceEnvironment','performanceId','sourceState','totalChunks','ownerDevice','ownerHuman'];
 const metaFields=['phase','uploaded','copied','cleaned','verifiedSourceHash'];
 const leaseFields=['revision','issuedAt','expiresAt','ownerDevice','ownerHuman'];
 run.importHead={'.read':manager,'.write':`${owner} && !data.exists() && newData.isString() && newData.val().matches(/^[a-f0-9-]{36}$/) && newData.parent().child('imports').child(newData.val()).child('manifest').exists() && newData.parent().child('imports').child(newData.val()).child('meta/phase').val() === 'uploading'`};
 run.activeImport={'.read':manager,'.write':`${lease} && !data.exists() && newData.val() === ${v(R,'importHead')} && ${v(meta,'phase')} === 'ready' && newData.parent().child('imports').child(newData.val()).child('meta/phase').val() === 'published' && newData.parent().child('imports').child(newData.val()).child('receipt').exists()`};
 run.imports={$job:{'.read':`(${lease} && $job === ${v(R,'importHead')}) || (${manager} && $job === ${v(R,'activeImport')})`,
  manifest:{'.read':`${sameHuman} && $job === ${v(R,'importHead')}`,'.write':`newData.exists() && !data.exists() && ${creating} && ${sameOwner}`,
   '.validate':`newData.hasChildren(${JSON.stringify(manifestFields)}) && ${v('newData','format')} === 'gd91-native-rtdb-closed-v1' && ${v('newData','sourceHash')}.matches(/^[a-f0-9]{64}$/) && newData.child('sourceEnvironment').isString() && ${v('newData','sourceEnvironment')}.length <= 100 && ${v('newData','performanceId')} === $run && ${v('newData','sourceState')} === 'closed' && newData.child('totalChunks').isNumber() && ${v('newData','totalChunks')} > 0 && ${v('newData','totalChunks')} <= 20000 && ${v('newData','totalChunks')} % 1 === 0`,...shape(manifestFields),'$other':{'.validate':false}},
  lease:{'.read':`${sameHuman} && $job === ${v(R,'importHead')}`,'.write':`newData.exists() && ${owner} && ${v(F,'ownerHuman')} === ${R}.child('devices').child(auth.uid).child('humanUid').val() && (${creating} || $job === ${v(R,'importHead')}) && ${J}.child('leaseEvents').child('r'+${v('newData','revision')}).exists()`,
   '.validate':`newData.hasChildren(${JSON.stringify(leaseFields)}) && ${v('newData','ownerDevice')} === auth.uid && ${v('newData','ownerHuman')} === ${v(F,'ownerHuman')} && ${v('newData','revision')} === (data.exists() ? ${v('data','revision')} + 1 : 1) && ${v('newData','issuedAt')} === now && ${v('newData','expiresAt')} > now && ${v('newData','expiresAt')} <= now + 900000`,...shape(leaseFields),'$other':{'.validate':false}},
  leaseEvents:{$entry:{'.write':`${owner} && !data.exists() && newData.exists() && $entry === 'r'+${v('newData','revision')} && ${v('newData','ownerDevice')} === auth.uid && ${v('newData','issuedAt')} === now && ${leaseFields.map(k=>`${v('newData',k)} === ${v(up(4)+".child('imports').child($job).child('lease')",k)}`).join(' && ')}`,'.validate':`newData.hasChildren(${JSON.stringify(leaseFields)})`,...shape(leaseFields),'$other':{'.validate':false}}},
  meta:{'.write':`newData.exists() && (${createMeta} || ($job === ${v(R,'importHead')} && (${uploading} || ${sealed} || ${copyingStep} || ${ready} || ${publication} || ${cleanup} || ${cleaned})))`,'.validate':`newData.hasChildren(${JSON.stringify(metaFields)})`,...shape(metaFields),'$other':{'.validate':false}},
  chunks:{$chunk:{'.write':`($job === ${v(R,'importHead')} && ${lease} && ((!data.exists() && newData.exists() && ${v(meta,'phase')} === 'uploading' && $chunk === 'c'+${v(meta,'uploaded')} && ${v(up(4)+".child('imports').child($job)",'meta/uploaded')} === ${v(meta,'uploaded')} + 1) || (data.exists() && !newData.exists() && ${v(meta,'phase')} === 'published' && $chunk === 'c'+${v(meta,'cleaned')} && ${v(up(4)+".child('imports').child($job)",'meta/cleaned')} === ${v(meta,'cleaned')} + 1)))`,
   '.validate':`newData.hasChildren(['index','count','entries']) && $chunk === 'c'+${v('newData','index')} && ${v('newData','index')} === ${v(meta,'uploaded')} && newData.child('count').isNumber() && ${v('newData','count')} >= 1 && ${v('newData','count')} <= 16 && ${v('newData','count')} % 1 === 0 && ${Array.from({length:16},(_,i)=>`(${v('newData','count')} > ${i} ? newData.child('entries').hasChild('e${i}') : !newData.child('entries').hasChild('e${i}'))`).join(' && ')}`,
   index:{'.validate':true},count:{'.validate':true},entries:{$entry:{'.validate':String.raw`$entry.matches(/^e([0-9]|1[0-5])$/) && newData.hasChildren(['path','value']) && newData.child('path').isString() && ${v('newData','path')}.length <= 512 && ${v('newData','path')}.matches(/^(${business.join('|')})\/[^.#$\[\]\/]+(\/[^.#$\[\]\/]+)*$/) && !${v('newData','path')}.matches(/^.*\/(${fieldNames.join('|')})(\/.*)?$/) && ${primitive("newData.child('value')")} && (!newData.child('value').isString() || ${v('newData','value')}.length <= 1333336) && (${v('newData','path')} !== 'control/state' || ${v('newData','value')} === 'closed')`,...shape(['path','value']),'$other':{'.validate':false}}},'$other':{'.validate':false}}},
  copiedPaths:{'$p0':indexTree(['$p0'],13),'.write':`${lease} && $job === ${v(R,'importHead')} && !newData.exists() && ${v(meta,'phase')} === 'published' && ${v(meta,'cleaned')} === ${v(manifest,'totalChunks')} && ${v(up(3)+".child('imports').child($job)",'meta/phase')} === 'cleaned'`},
  receipt:{'.write':`${lease} && $job === ${v(R,'importHead')} && !data.exists() && newData.exists() && ${v(meta,'phase')} === 'ready' && ${v(N,'activeImport')} === $job && ${v(M,'phase')} === 'published'`,
   '.validate':`newData.hasChildren(['exportId','sourceHash','ownerDevice','ownerHuman','committedAt']) && ${v('newData','exportId')} === $job && ${v('newData','sourceHash')} === ${v(manifest,'sourceHash')} && ${v('newData','ownerDevice')} === auth.uid && ${v('newData','ownerHuman')} === ${v(manifest,'ownerHuman')} && ${v('newData','committedAt')} === now`,...shape(['exportId','sourceHash','ownerDevice','ownerHuman','committedAt']),'$other':{'.validate':false}},'$other':{'.validate':false}}};
 return r;
}
