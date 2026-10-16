import {base} from '../GD91-84/auth-rules.mjs';
const v=(n,p)=>`${n}.child('${p}').val()`,and=xs=>xs.map(x=>'('+x+')').join(' && ');
export function addEvidence(rules){
 const run=rules.rules.checks.$run,M=`${base}.child('closing/meta')`;
 for(const[kind,key,date]of [['losses','$uid','decidedAt'],['confirmations','$person','confirmedAt']]){
  const node=run.closingRuns.$operation[kind][key];for(const field of ['humanUid','managerDeviceUid','controlRevision',date])node[field]={'.validate':true};
  node['.validate']+=' && '+and([`${v('newData','humanUid')} === ${base}.child('devices').child(auth.uid).child('humanUid').val()`,`${v('newData','managerDeviceUid')} === auth.uid`,`${v('newData','controlRevision')} === ${v(M,'sourceControlRevision')}`,`${v('newData',date)} === now`]);
 }
 const loss=run.closingRuns.$operation.losses.$uid,clock=`${base}.child('receiptClocks').child($uid)`,seq=`(${clock}.exists() ? ${v(clock,'sequence')} : 0)`,source=`${base}.child('receiptSources').child($uid).child((1000000000+${seq})+'')`,event=`${base}.child(${v(source,'destination')} === 'normal' ? 'receipts' : 'quarantine').child($uid).child('events').child(${v(source,'key')})`;
 for(const field of ['deviceUid','fromSequence','lastReceivedAt'])loss[field]={'.validate':true};loss['.validate']+=` && ${v('newData','deviceUid')} === $uid && ${v('newData','fromSequence')} === ${seq}+1 && ${v('newData','lastReceivedAt')} === (${clock}.exists() ? ${v(event,'receivedAt')} : 0)`;
 run.closing.meta['.validate']+=` && (data.exists() && ${v('newData','operationId')} === ${v('data','operationId')} || (${base}.child('deviceRoster/meta').exists() && ${v(base,'deviceRoster/meta/count')} > 0 && ${v(base,'control/businessSchemaVersion')} === 3 && ${v(base,'control/layoutSchemaVersion')} === 2 && ${base}.child('generations').child(${v(base,'head/generation')}).child('meta/schemaVersion').val() === 2))`;
 const result=run.closingResults.$operation;for(const field of ['confirmedConflicts','confirmedPaper','confirmedAbsences','confirmedDevices']){result[field]={'.validate':true};result['.validate']+=` && ${v('newData',field)} === true`;}
 return rules;
}
