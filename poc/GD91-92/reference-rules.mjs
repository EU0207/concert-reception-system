import {base,manager} from '../GD91-84/auth-rules.mjs';
const v=(n,k)=>`${n}.child('${k}').val()`,fields=['schemaVersion','generation','baseLayoutRevision','deviceUid','active','revision','pendingOperationId','expectedEventRevision'];
export function addReferences(rules){
 const run=rules.rules.checks.$run,reference=run.references.$ref,gen=`${base}.child('generations').child(${v('newData','generation')})`,event=`${base}.child('event')`;
 const pending=`${event}.child('operations').child(${v('data','pendingOperationId')})`;
 const resolved=`(${pending}.exists() && ${v(pending,'referenceId')} === $ref && ${v(pending,'resultRevision')} === ${v('data','expectedEventRevision')}+1)`;
 const fenced=`(${v(event,'commit/revision')} > ${v('data','expectedEventRevision')} || ${base}.child('head/revision').val() > ${v('data','baseLayoutRevision')})`;
 const current=`${base}.child('head/generation').val() === ${v('newData','generation')} && ${base}.child('head/revision').val() === ${v('newData','baseLayoutRevision')}`;
 const blank=n=>`${v(n,'pendingOperationId')} === '' && ${v(n,'expectedEventRevision')} === 0`;
 const initial=`!data.exists() && ${v('newData','active')} === true && ${v('newData','revision')} === 1 && (${blank('newData')}) && (${current})`;
 const preserve=['generation','baseLayoutRevision','deviceUid'].map(k=>`${v('newData',k)} === ${v('data',k)}`).join(' && ');
 const reserve=`(${blank('data')}) && ${v('newData','active')} === true && newData.child('pendingOperationId').isString() && ${v('newData','pendingOperationId')}.matches(/^[a-f0-9-]{36}$/) && !${event}.child('operations').child(${v('newData','pendingOperationId')}).exists() && ${v('newData','expectedEventRevision')} === ${v(event,'commit/revision')} && (${current})`;
 const clear=`${v('data','pendingOperationId')} !== '' && (${blank('newData')}) && (${resolved} || ${fenced})`;
 const release=`(${blank('data')}) && (${blank('newData')}) && ${v('newData','active')} === false`;
 const change=`data.exists() && ${v('data','schemaVersion')} === 3 && ${v('data','active')} === true && ${v('newData','revision')} === ${v('data','revision')}+1 && (${preserve}) && ((${reserve}) || (${clear}) || (${release}))`;
 const isNew=`${manager} && newData.exists() && ${v('newData','schemaVersion')} === 3 && ${v('newData','deviceUid')} === auth.uid && ${v(gen,'meta/phase')} === 'ready' && ((${initial}) || (${change}))`;
 const legacyWrite=reference['.write'],legacyValidate=reference['.validate'];
 reference['.write']=`(!newData.child('schemaVersion').exists() && !data.child('schemaVersion').exists() && (${legacyWrite})) || (${isNew})`;
 const parent='newData.parent().parent()',pin=`${parent}.child('generations').child(${v('newData','generation')}).child('refs').child($ref)`;
 reference['.validate']=`newData.child('schemaVersion').exists() ? (newData.hasChildren(${JSON.stringify(fields)}) && newData.child('pendingOperationId').isString() && newData.child('revision').isNumber() && ${v('newData','revision')} > 0 && ${v('newData','revision')} % 1 === 0 && (${v('newData','active')} === true ? ${pin}.val() === true : !${pin}.exists())) : (${legacyValidate})`;
 reference['.read']=`(${reference['.read']}) && (data.child('revision').val() === null || data.child('revision').val() > 0)`;
 for(const field of fields)reference[field]={'.validate':true};
 const e=run.event,op=`newData.child('operations').child(newData.child('commit/operationId').val())`,ref=`${base}.child('references').child(${v(op,'referenceId')})`;
 const binding=[`${v(ref,'schemaVersion')} === 3`,`${v(ref,'active')} === true`,`${v(ref,'deviceUid')} === auth.uid`,`${v(ref,'generation')} === ${v(op,'sourceLayoutGeneration')}`,`${v(ref,'baseLayoutRevision')} === ${v(op,'sourceLayoutRevision')}`,`${v(ref,'pendingOperationId')} === ${v('newData','commit/operationId')}`,`${v(ref,'expectedEventRevision')} === ${v('data','commit/revision')}`].map(x=>'('+x+')').join(' && ');
 e['.validate']=`(${e['.validate']}) && (!data.exists() || (${binding}))`;
 e.operations.$operation.referenceId={'.validate':"newData.isString() && newData.val().matches(/^[a-f0-9-]{36}$/)"};
 return rules;
}
