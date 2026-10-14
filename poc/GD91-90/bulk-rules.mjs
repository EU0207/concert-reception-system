import {base,editing} from '../GD91-84/auth-rules.mjs';
const value=(n,k)=>`${n}.child('${k}').val()`,old=`${base}.child('event')`,opAt=n=>`${n}.child('operations').child(${value(n,'commit/operationId')})`;
export function addBulk(rules){
 const e=rules.rules.checks.$run.event,op=opAt('newData'),human=`${base}.child('devices').child(auth.uid).child('humanUid').val()`;
 const bulk=[`${value(op,'kind')} === 'bulkAssign'`,`${base}.child('control/state').val() === 'preparing'`,`${op}.child('targets').hasChildren()`,
   `${value('newData','commit/revision')} === ${value('data','commit/revision')}+1`,`${value(op,'expectedRevision')} === ${value('data','commit/revision')}`,`${value(op,'resultRevision')} === ${value('newData','commit/revision')}`,
   `!data.child('operations').child(${value('newData','commit/operationId')}).exists()`,`${value(op,'humanUid')} === ${human}`,`${value('newData','reception/0000000000')} === ${value('newData','commit/revision')}`].map(x=>'('+x+')').join(' && ');
 const ctx=[`${value(op,'sourceLayoutRevision')} === ${base}.child('head/revision').val()`,`${value(op,'sourceLayoutGeneration')} === ${base}.child('head/generation').val()`,`${value(op,'sourceControlRevision')} === ${base}.child('control/revision').val()`].map(x=>'('+x+')').join(' && ');
 e['.validate']=`(${value(op,'kind')} === 'bulkAssign' ? (${bulk}) : (${e['.validate']})) && (!data.exists() || (${ctx}))`;
 const operation=e.operations.$operation;
 operation['.validate']=`(${value('newData','kind')} === 'bulkAssign' ? newData.hasChildren(['kind','targets','expectedRevision','resultRevision','humanUid','sourceLayoutRevision','sourceLayoutGeneration','sourceControlRevision']) : (${operation['.validate']}))`;
 operation.sourceLayoutRevision={'.validate':`newData.isNumber() && newData.val() === ${base}.child('head/revision').val()`};
 operation.sourceLayoutGeneration={'.validate':`newData.isString() && newData.val() === ${base}.child('head/generation').val()`};
 operation.sourceControlRevision={'.validate':`newData.isNumber() && newData.val() === ${base}.child('control/revision').val()`};
 const er='newData.parent().parent().parent().parent()',p=`${er}.child('people').child($person)`,s=`${er}.child('seats').child(newData.val())`;
 operation.targets={'.validate':`${value('newData.parent()','kind')} === 'bulkAssign'`,$person:{'.validate':[
   "newData.isString() && newData.val().matches(/^[A-Za-z0-9_-]{1,64}$/)",`${old}.child('people').child($person).child('active').val() === true`,`${old}.child('people').child($person).child('seatId').val() === 'none'`,
   `!${old}.child('seats').child(newData.val()).exists() || ${old}.child('seats').child(newData.val()).child('personId').val() === 'none'`,`${value(p,'seatId')} === newData.val()`,`${value(p,'revision')} === ${value(er,'commit/revision')}`,`${value(s,'personId')} === $person`,`${value(s,'revision')} === ${value(er,'commit/revision')}`].map(x=>'('+x+')').join(' && ')}};
 const root='newData.parent().parent()',childOp=opAt(root),isBulk=`${value(childOp,'kind')} === 'bulkAssign'`,changed=`${value(root,'commit/revision')} === ${value(old,'commit/revision')}+1`;
 e.people.$person['.write']=`(${e.people.$person['.write']}) || (${editing} && newData.exists() && ${changed} && ${isBulk} && ${childOp}.child('targets').child($person).exists())`;
 for(const name of['seats','view']){const row=e[name].$seat;e[name].$seat['.write']=`(${row['.write']}) || (${editing} && newData.exists() && ${changed} && ${isBulk} && ${childOp}.child('targets').child(newData.child('personId').val()).val() === $seat)`;}
 e.reception.$row['.write']=`(${e.reception.$row['.write']}) || (${editing} && newData.exists() && ${changed} && ${isBulk} && ${childOp}.child('targets').child(newData.child('personId').val()).exists() && $row === 'i-'+newData.child('personId').val())`;
 return rules;
}
