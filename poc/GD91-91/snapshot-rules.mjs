const value=(node,key)=>`${node}.child('${key}').val()`;
export function addSnapshot(rules){
 const e=rules.rules.checks.$run.event,opAt=n=>`${n}.child('operations').child(${value(n,'commit/operationId')})`,fields=['credentialRef','currentCycle','credentialVersion'];
 e['.validate']=`(${e['.validate']}) && (!data.exists() || ${opAt('newData')}.child('qrSnapshot').exists())`;
 const parent='newData.parent().parent()',op=opAt(parent),snapshot=`${op}.child('qrSnapshot').child(newData.child('personId').val())`;
 e.reception.$row['.validate']=`(${e.reception.$row['.validate']}) && ${fields.map(k=>`${value('newData',k)} === ${value(snapshot,k)}`).join(' && ')}`;
 const event='newData.parent().parent().parent().parent()',row=`${event}.child('reception').child('i-'+$person)`;
 e.operations.$operation.qrSnapshot={'.validate':"newData.val() === 'none' || newData.hasChildren()",$person:{
  '.validate':`$person.matches(/^[A-Za-z0-9_-]{1,64}$/) && newData.hasChildren(${JSON.stringify(fields)}) && ${value(row,'revision')} === ${value(event,'commit/revision')} && ${fields.map(k=>`${value('newData',k)} === ${value(row,k)}`).join(' && ')}`,
  credentialRef:{'.validate':'newData.isString()'},currentCycle:{'.validate':'newData.isNumber() && newData.val() >= 0'},credentialVersion:{'.validate':'newData.isNumber() && newData.val() >= 0'},'$other':{'.validate':false}}};
 return rules;
}
