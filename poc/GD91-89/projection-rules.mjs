import {base,editing,activeRead} from '../GD91-84/auth-rules.mjs';
const value=(n,k)=>`${n}.child('${k}').val()`;
const fields=['personId','active','seatId','displayName','credentialRef','currentCycle','credentialVersion','eligible','revision'];
const shape=()=>Object.fromEntries([...fields.map(k=>[k,{'.validate':true}]),['$other',{'.validate':false}]]);
const projection=(event,id)=>`${event}.child('reception').child('i-'+${id})`;
function matches(event,id){
  const p=`${event}.child('people').child(${id})`,t=`${event}.child('tickets').child(${id})`,r=projection(event,id);
  return [value(r,'personId')+' === '+id,...['active','seatId','displayName'].map(k=>`${value(r,k)} === ${value(p,k)}`),
    `${value(r,'credentialRef')} === (${t}.exists() ? ${value(t,'credentialRef')} : '')`,
    ...['currentCycle','credentialVersion'].map(k=>`${value(r,k)} === (${t}.exists() ? ${value(t,k)} : 0)`),
    `${value(r,'eligible')} === (${value(p,'active')} === true && ${value(p,'seatId')} !== 'none' && ${t}.child('credentialRef').isString() && ${value(t,'credentialRef')} !== '' && ${value(t,'cycleClosed')} === false)`,
    `${value(r,'revision')} === ${value(event,'commit/revision')}`].map(x=>'('+x+')').join(' && ');
}
export function addProjection(rules){
  const event=rules.rules.checks.$run.event,root='newData.parent().parent()',op=`${root}.child('operations').child(${value(root,'commit/operationId')})`,old=`${base}.child('event')`;
  event['.validate']=`(${event['.validate']}) && (${value('newData','reception/0000000000')} === ${value('newData','commit/revision')})`;
  event.people.$person['.validate']=`(${event.people.$person['.validate']}) && (${matches(root,'$person')})`;
  event.tickets.$person['.validate']=`(${event.tickets.$person['.validate']}) && (${matches(root,'$person')})`;
  const target=['target','beforeA','beforeB','afterA','afterB'].map(k=>`(${op}.child('${k}').isString() && $row === 'i-'+${value(op,k)})`).join(' || ');
  const rowRoot='newData.parent().parent()',id=value('newData','personId');
  event.reception={'.read':`${activeRead} && query.orderByKey && query.startAt >= 'i-' && query.limitToFirst > 0 && query.limitToFirst <= 32 && (data.child('0000000000').val() === null || data.child('0000000000').val() > 0)`,
    '0000000000':{'.read':`${activeRead} && (data.val() === null || data.val() > 0)`,'.write':`${editing} && newData.exists()`,'.validate':`newData.isNumber() && newData.val() === ${value(root,'commit/revision')}`},
    $row:{'.read':`${activeRead} && (data.child('revision').val() === null || data.child('revision').val() > 0)`,
      '.write':`${editing} && newData.exists() && ${value(root,'commit/revision')} === ${value(old,'commit/revision')}+1 && (${target})`,
      '.validate':`newData.hasChildren(${JSON.stringify(fields)}) && $row === 'i-'+${id} && (${matches(rowRoot,id)})`,...shape()}};
  return rules;
}
