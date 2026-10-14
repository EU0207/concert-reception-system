import {base,authorized,manager} from '../GD91-84/auth-rules.mjs';

export const eventFields=['schemaVersion','performanceId','eventId','deviceUid','humanUid','sequence','sourceControlRevision','attendeeId','credentialVersion','kind','reason','observedAt','receivedAt','currentCycle','credentialRef','layoutReferenceId','sourceLayoutGeneration','sourceLayoutRevision'];
const v=(n,k)=>`${n}.child('${k}').val()`;
const shape=fields=>Object.fromEntries([...fields.map(k=>[k,{'.validate':true}]),['$other',{'.validate':false}]]);
const device=`${base}.child('devices').child(auth.uid)`,session=`${base}.child('sessions').child(auth.uid)`;
const registered=`auth != null && auth.token.firebase.sign_in_provider === 'anonymous' && auth.uid === $device && ${v(device,'schemaVersion')} === 2 && ${v(device,'performanceId')} === $run && ${v(device,'deviceUid')} === auth.uid && ${v(session,'schemaVersion')} === 2 && ${v(session,'performanceId')} === $run && ${v(session,'deviceUid')} === auth.uid && ${v(session,'humanUid')} === ${v(device,'humanUid')} && ${v(session,'emailVerified')} === true`;

export function addQuarantine(rules){
 const run=rules.rules.checks.$run;
 const current="newData.child('counter')",eventRoot='newData.parent().parent()',item='newData';
 const sequence=v(current,'sequence'),eventKey=v(current,'eventKey'),eventId=v(current,'eventId');
 const lease=`${base}.child('references').child(${v(item,'layoutReferenceId')})`;
 const checks=[
  `${item}.hasChildren(${JSON.stringify(eventFields)})`,`${v(item,'schemaVersion')} === 3`,`${v(item,'performanceId')} === $run`,
  `${v(item,'eventId')} === ${v(eventRoot,'counter/eventId')}`,`${item}.child('eventId').isString() && ${v(item,'eventId')}.matches(/^[a-f0-9-]{36}$/)`,
  `${v(item,'deviceUid')} === auth.uid`,`${v(item,'humanUid')} === ${v(device,'humanUid')}`,
  `${item}.child('sequence').isNumber() && ${v(item,'sequence')} > 0 && ${v(item,'sequence')} <= 10000 && ${v(item,'sequence')} % 1 === 0`,
  `${v(item,'sequence')} === ${v(eventRoot,'counter/lastSourceSequence')}`,
  `${v(lease,'schemaVersion')} === 5 && ${v(lease,'active')} === true && ${v(lease,'deviceUid')} === auth.uid`,
  `${v(lease,'generation')} === ${v(item,'sourceLayoutGeneration')}`,`${v(lease,'baseLayoutRevision')} === ${v(item,'sourceLayoutRevision')}`,`${v(lease,'sourceControlRevision')} === ${v(item,'sourceControlRevision')}`,
  `${v(item,'sourceControlRevision')} <= ${v(base,'control/revision')}`,
  `!(${authorized}) || ${v(base,'control/state')} !== 'operating' || ${v(item,'sourceControlRevision')} !== ${v(base,'control/revision')}`,
  `${item}.child('attendeeId').isString() && ${v(item,'attendeeId')}.matches(/^[a-zA-Z0-9_-]{1,64}$/)`,
  ...['credentialVersion','currentCycle'].map(k=>`${item}.child('${k}').isNumber() && ${v(item,k)} > 0 && ${v(item,k)} % 1 === 0`),
  `${item}.child('credentialRef').isString() && ${v(item,'credentialRef')}.matches(/^[a-zA-Z0-9_-]{1,64}$/)`,
  `${v(item,'kind')} === 'firstReception' || ${v(item,'kind')} === 'reread'`,
  `${item}.child('reason').isString() && ${v(item,'reason')}.length <= 500`,
  `${item}.child('observedAt').isNumber() && ${v(item,'observedAt')} >= 0 && ${v(item,'observedAt')} <= now`,`${v(item,'receivedAt')} === now`,
 ];
 const counterFields=['sequence','eventKey','eventId','lastSourceSequence'];
 const transition=[
  `newData.hasChildren(['counter','events','ids'])`,`${current}.hasChildren(${JSON.stringify(counterFields)})`,
  `${sequence} === (data.child('counter/sequence').exists() ? data.child('counter/sequence').val()+1 : 1)`,`${sequence} <= 10000`,
  `${eventKey} === (1000000000+${sequence})+''`,
  `${v(current,'lastSourceSequence')} > (data.child('counter/lastSourceSequence').exists() ? data.child('counter/lastSourceSequence').val() : 0)`,
  `newData.child('events').child(${eventKey}).child('eventId').val() === ${eventId}`,
  `newData.child('ids').child(${eventId}).val() === ${eventKey}`,
  `!data.child('events').child(${eventKey}).exists()`,`!data.child('ids').child(${eventId}).exists()`,
 ];
 const write=`${registered} && newData.exists()`;
 run.quarantine={$device:{'.validate':transition.map(x=>`(${x})`).join(' && '),
  counter:{'.read':`(${registered}) || (${manager})`,'.write':write,...shape(counterFields)},
  events:{'.read':`${manager} && query.orderByKey && query.startAt >= '1000000000' && query.limitToFirst <= 32`,
   $key:{'.read':`(${registered}) || (${manager})`,'.write':`${write} && !data.exists() && $key === ${v(eventRoot,'counter/eventKey')}`,'.validate':checks.map(x=>`(${x})`).join(' && '),...shape(eventFields)}},
  ids:{$id:{'.read':`(${registered}) || (${manager})`,'.write':`${write} && !data.exists() && $id === newData.parent().parent().child('counter/eventId').val()`,'.validate':"newData.isString() && newData.val() === newData.parent().parent().child('counter/eventKey').val()"}},
  '$other':{'.validate':false}
 }};
 // 停止端末には自身の受領結果だけを照会させ、受付用の公開行は再公開しない。
 run.receipts.$device.ids.$id['.read']+=` || (${registered})`;
 run.receipts.$device.events.$key['.read']+=` || (${registered})`;
 return rules;
}
