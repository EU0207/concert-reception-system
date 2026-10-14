import {base,authorized} from '../GD91-84/auth-rules.mjs';
export function addQueueLeases(rules){
 const run=rules.rules.checks.$run,reference=run.references.$ref,v=(n,k)=>`${n}.child('${k}').val()`,fields=['schemaVersion','generation','baseLayoutRevision','sourceControlRevision','deviceUid','active','revision'];
 const same=fields.filter(k=>!['active','revision'].includes(k)).map(k=>`${v('newData',k)} === ${v('data',k)}`).join(' && '),gen=`${base}.child('generations').child(${v('newData','generation')})`;
 const initial=`!data.exists() && ${v('newData','active')} === true && ${v('newData','revision')} === 1 && ${v('newData','generation')} === ${base}.child('head/generation').val() && ${v('newData','baseLayoutRevision')} === ${base}.child('head/revision').val() && ${v('newData','sourceControlRevision')} === ${base}.child('control/revision').val() && ${base}.child('control/state').val() === 'operating'`;
 const release=`${v('data','schemaVersion')} === 5 && ${v('data','active')} === true && ${v('newData','active')} === false && ${v('newData','revision')} === ${v('data','revision')}+1 && (${same}) && ${base}.child('control/revision').val() > ${v('data','sourceControlRevision')}`;
 reference['.write']=`(${reference['.write']}) || (${authorized} && $ref.matches(/^[a-f0-9-]{36}$/) && ${v('newData','schemaVersion')} === 5 && ${v('newData','deviceUid')} === auth.uid && ${v(gen,'meta/phase')} === 'ready' && ((${initial}) || (${release})))`;
 reference['.read']=`(${reference['.read']}) || (${authorized} && ${v('data','schemaVersion')} === 5 && ${v('data','deviceUid')} === auth.uid)`;
 const pin=`newData.parent().parent().child('generations').child(${v('newData','generation')}).child('refs').child($ref)`;
 reference['.validate']=`${v('newData','schemaVersion')} === 5 ? (newData.hasChildren(${JSON.stringify(fields)}) && (${v('newData','active')} === true ? ${pin}.val() === true : !${pin}.exists())) : (${reference['.validate']})`;
 for(const field of fields)reference[field]={'.validate':true};
 const inverse=run.generations.$generation.refs.$ref,r="newData.parent().parent().parent().parent().child('references').child($ref)";
 inverse['.write']=`(${r}.child('schemaVersion').val() !== 5 && (${inverse['.write']})) || (${authorized} && ${r}.child('schemaVersion').val() === 5 && ${r}.child('deviceUid').val() === auth.uid && ${r}.child('generation').val() === $generation && ${base}.child('generations').child($generation).child('meta/phase').val() === 'ready' && (newData.val() === true ? ${r}.child('active').val() === true : !newData.exists() && ${r}.child('active').val() === false))`;
 const receipt=run.receipts.$device.events.$key,ref=`${base}.child('references').child(${v('newData','layoutReferenceId')})`;
 if(!receipt['.validate'].includes("newData.child('schemaVersion').val() === 2"))throw new Error('receipt-format-changed');
 receipt['.validate']=receipt['.validate'].replace("newData.child('schemaVersion').val() === 2","newData.child('schemaVersion').val() === 3")+` && ${v(ref,'schemaVersion')} === 5 && ${v(ref,'active')} === true && ${v(ref,'deviceUid')} === auth.uid && ${v(ref,'generation')} === ${v('newData','sourceLayoutGeneration')} && ${v(ref,'baseLayoutRevision')} === ${v('newData','sourceLayoutRevision')} && ${v(ref,'sourceControlRevision')} === ${v('newData','sourceControlRevision')}`;
 for(const k of['layoutReferenceId','sourceLayoutGeneration','sourceLayoutRevision'])receipt[k]={'.validate':true};return rules;
}
