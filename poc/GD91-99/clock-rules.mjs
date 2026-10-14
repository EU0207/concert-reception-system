import {base,manager} from '../GD91-84/auth-rules.mjs';
const v=(n,k)=>`${n}.child('${k}').val()`;
export function addReceiptClocks(rules){
 const run=rules.rules.checks.$run,normal=run.receipts.$device,quarantine=run.quarantine.$device;
 const old="newData.child('counter').child('sequence').val() === (data.child('counter/sequence').exists() ? data.child('counter/sequence').val()+1 : 1)";
 if(!normal['.validate'].includes(old))throw new Error('normal-counter-contract-changed');
 const previous=`${base}.child('receiptClocks').child($device)`;
 normal['.validate']=normal['.validate'].replace(old,`newData.child('counter').child('sequence').val() === (${previous}.child('sequence').exists() ? ${previous}.child('sequence').val()+1 : 1)`);
 for(const[bucket,destination,sequenceField]of[[normal,'normal','sequence'],[quarantine,'quarantine','lastSourceSequence']]){
  const clock="newData.parent().parent().child('receiptClocks').child($device)";
  bucket['.validate']+=` && ${v(clock,'sequence')} === ${v('newData','counter/'+sequenceField)} && ${v(clock,'eventId')} === ${v('newData','counter/eventId')} && ${v(clock,'destination')} === '${destination}'`;
 }
 const d=`${base}.child('devices').child(auth.uid)`,s=`${base}.child('sessions').child(auth.uid)`;
 const registered=`auth != null && auth.token.firebase.sign_in_provider === 'anonymous' && auth.uid === $device && ${v(d,'schemaVersion')} === 2 && ${v(d,'performanceId')} === $run && ${v(d,'deviceUid')} === auth.uid && ${v(s,'schemaVersion')} === 2 && ${v(s,'deviceUid')} === auth.uid && ${v(s,'performanceId')} === $run && ${v(s,'humanUid')} === ${v(d,'humanUid')} && ${v(s,'emailVerified')} === true`;
 const clockNew="newData.parent().parent().child('receiptClocks').child($device)";
 const bucket="newData.parent().parent().child(newData.child('destination').val() === 'normal' ? 'receipts' : 'quarantine').child($device)";
 const event=`${bucket}.child('events').child(${v(bucket,'counter/eventKey')})`;
 const sources="newData.parent().parent().child('receiptSources').child($device)",ids="newData.parent().parent().child('receiptEventIds').child($device)";
 const fields=['sequence','eventId','destination'];
 run.receiptClocks={$device:{'.read':`(${registered}) || (${manager})`,'.write':`${registered} && newData.exists()`,
  '.validate':`newData.hasChildren(${JSON.stringify(fields)}) && newData.child('sequence').isNumber() && ${v('newData','sequence')} === (data.child('sequence').exists() ? data.child('sequence').val()+1 : 1) && ${v('newData','sequence')} <= 10000 && (${v('newData','destination')} === 'normal' || ${v('newData','destination')} === 'quarantine') && ${v(event,'eventId')} === ${v('newData','eventId')} && ${v(event,'sequence')} === ${v('newData','sequence')} && ${sources}.child((1000000000+${v('newData','sequence')})+'').child('eventId').val() === ${v('newData','eventId')} && ${ids}.child(${v('newData','eventId')}).val() === (1000000000+${v('newData','sequence')})+'' && !${base}.child('receiptEventIds').child($device).child(${v('newData','eventId')}).exists()`,
  ...Object.fromEntries(fields.map(k=>[k,{'.validate':true}])),'$other':{'.validate':false}}};
 const clockForSource="newData.parent().parent().parent().child('receiptClocks').child($device)";
 run.receiptSources={$device:{$sequence:{'.read':`(${registered}) || (${manager})`,'.write':`${registered} && !data.exists() && newData.exists()`,
  '.validate':`newData.hasChildren(['eventId','destination','key']) && $sequence === (1000000000+${v(clockForSource,'sequence')})+'' && ${v('newData','eventId')} === ${v(clockForSource,'eventId')} && ${v('newData','destination')} === ${v(clockForSource,'destination')} && ${v('newData','key')} === newData.parent().parent().parent().child(${v('newData','destination')} === 'normal' ? 'receipts' : 'quarantine').child($device).child('counter/eventKey').val()`,
  eventId:{'.validate':true},destination:{'.validate':true},key:{'.validate':true},'$other':{'.validate':false}}}};
 run.receiptEventIds={$device:{$id:{'.read':`(${registered}) || (${manager})`,'.write':`${registered} && !data.exists() && newData.exists()`,
  '.validate':`newData.isString() && $id === ${v(clockForSource,'eventId')} && newData.val() === (1000000000+${v(clockForSource,'sequence')})+''`}}};
 return rules;
}
