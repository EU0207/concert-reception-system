import {base, editing, manager} from '../GD91-84/auth-rules.mjs';

const shape = fields => Object.fromEntries([...fields.map(k => [k, {'.validate': true}]), ['$other', {'.validate': false}]]);
const v = (node, key) => `${node}.child('${key}').val()`;
const lifeKinds = ['register', 'payment', 'qrCreate', 'qrReissue', 'ticketCheck', 'cancelAttendance', 'returnAttendance'];
const isLife = op => lifeKinds.map(k => `${v(op, 'kind')} === '${k}'`).join(' || ');
const opAt = node => `${node}.child('operations').child(${v(node, 'commit/operationId')})`;
const oldRoot = "root.child('checks').child($run).child('event')";
const oldOp = opAt(oldRoot);
const op = opAt('newData');
const person = node => `${node}.child('people').child(${v(op, 'target')})`;
const profile = node => `${node}.child('profiles').child(${v(op, 'target')})`;
const ticket = node => `${node}.child('tickets').child(${v(op, 'target')})`;
const before = ticket('data'), after = ticket('newData');
const currentPerson = person('data'), nextPerson = person('newData');
const kind = k => `${v(op, 'kind')} === '${k}'`;
const freshCycle = `!${before}.exists() || ${v(before, 'cycleClosed')} === true`;
const oldQr = `${before}.exists() && ${v(before, 'credentialRef')} !== ''`;
const closing = kind('cancelAttendance');
const returning = kind('returnAttendance');
const registering = kind('register');
const payment = kind('payment');
const qr = `(${kind('qrCreate')} || ${kind('qrReissue')})`;
const ticketEdit = `(${qr} || ${kind('ticketCheck')})`;
const transitionBase = [
  `(${isLife(op)})`,
  `!data.child('operations').child(${v('newData', 'commit/operationId')}).exists()`,
  `${v('newData', 'commit/revision')} === ${v('data', 'commit/revision')} + 1`,
  `${v(op, 'expectedRevision')} === ${v('data', 'commit/revision')}`,
  `${v(op, 'resultRevision')} === ${v('newData', 'commit/revision')}`,
  `${v(op, 'sourceControlRevision')} === ${base}.child('control/revision').val()`,
  `${v(op, 'humanUid')} === ${base}.child('devices').child(auth.uid).child('humanUid').val()`,
  `${v(op, 'target')}.matches(/^[A-Za-z0-9_-]{1,64}$/)`,
  `${v(op,'committedAt')} === now`,
  `${v(op,'previousSeat')} === (${currentPerson}.exists() ? ${v(currentPerson,'seatId')} : 'none')`,
  `${v(op,'previousCredential')} === (${before}.exists() ? ${v(before,'credentialRef')} : '')`,
  `${v(op,'previousCode')} === (${before}.exists() ? ${v(before,'code')} : '')`,
  `(${registering} || ${closing} || ${returning}) ? ${v(nextPerson,'revision')} === ${v('newData','commit/revision')} : true`,
];
const seat = `${currentPerson}.child('seatId').val()`;
const cancelling = [
  closing, `${v(currentPerson, 'active')} === true`, `${v(nextPerson, 'active')} === false`,
  `${v(nextPerson, 'seatId')} === 'none'`, `${v(op, 'confirmedPrimary')} === true`,
  `!${before}.exists() || ((${v(before, 'everIssued')} !== true && ${v(before, 'everSent')} !== true && ${v(before, 'credentialRef')} === '') || ${v(op, 'confirmedTicketWarning')} === true)`,
  `!(${oldQr}) || (${base}.child('control/state').val() === 'stopped' && ${v(op, 'stopConfirmed')} === true)`,
  `${seat} === 'none' || (newData.child('seats').child(${seat}).child('personId').val() === 'none' && newData.child('seats').child(${seat}).child('revision').val() === ${v('newData', 'commit/revision')} && newData.child('view').child(${seat}).child('personId').val() === 'none' && newData.child('view').child(${seat}).child('displayName').val() === '' && newData.child('view').child(${seat}).child('revision').val() === ${v('newData', 'commit/revision')})`,
  `!${before}.exists() ? !${after}.exists() : (${v(after,'revision')} === ${v('newData','commit/revision')} && ${v(after, 'cycleClosed')} === true && ${v(after, 'credentialRef')} === '' && ${v(after, 'code')} === '' && ${v(after, 'issued')} === false && ${v(after, 'sent')} === false && ${v(after, 'issuedAt')} === 0 && ${v(after, 'sentAt')} === 0 && ${v(after, 'currentCycle')} === ${v(before, 'currentCycle')} && ${v(after, 'credentialVersion')} === ${v(before, 'credentialVersion')} && ${v(after, 'everIssued')} === ${v(before, 'everIssued')} && ${v(after, 'everSent')} === ${v(before, 'everSent')})`,
];
const ticketChange = [
  ticketEdit, `${v(currentPerson, 'active')} === true`, `${seat} !== 'none'`,
  `${v(after,'revision')} === ${v('newData','commit/revision')}`,
  `newData.child('seats').child(${seat}).child('personId').val() === ${v(op, 'target')}`,
  `${v(after, 'cycleClosed')} === false`,
  `${v(after, 'currentCycle')} === ((${freshCycle}) ? (!${before}.exists() ? 1 : ${v(before, 'currentCycle')}+1) : ${v(before, 'currentCycle')})`,
  `${v(after, 'everIssued')} === (((${freshCycle}) ? false : ${v(before, 'everIssued')} === true) || ${v(after, 'issued')} === true)`,
  `${v(after, 'everSent')} === (((${freshCycle}) ? false : ${v(before, 'everSent')} === true) || ${v(after, 'sent')} === true)`,
  `(${qr}) ? (${v(after, 'credentialRef')} === ${v(op, 'newCredential')} && ${v(after, 'code')} === ${v(op, 'newCode')} && ${v(after, 'credentialVersion')} === (${kind('qrReissue')} ? ${v(before, 'credentialVersion')}+1 : 1) && (${kind('qrCreate')} ? ((${freshCycle}) || ${v(before, 'credentialRef')} === '') : (!(${freshCycle}) && (${oldQr}) && ${base}.child('control/state').val() === 'stopped' && ${v(op, 'stopConfirmed')} === true && ${v(op, 'confirmedPrimary')} === true))) : (${v(after, 'credentialRef')} === ((${freshCycle}) ? '' : ${v(before, 'credentialRef')}) && ${v(after, 'code')} === ((${freshCycle}) ? '' : ${v(before, 'code')}) && ${v(after, 'credentialVersion')} === ((${freshCycle}) ? 0 : ${v(before, 'credentialVersion')}))`,
  `!(${qr}) || (${v(after, 'issued')} === ((${freshCycle}) ? false : ${v(before, 'issued')}) && ${v(after, 'sent')} === ((${freshCycle}) ? false : ${v(before, 'sent')}))`,
  `${kind('ticketCheck')} ? (${v(after,'issued')} === ${v(op,'issued')} && ${v(after,'sent')} === ${v(op,'sent')}) : true`,
];
const branches = [
  `(${registering} && !${currentPerson}.exists() && !${profile('data')}.exists() && ${v(nextPerson, 'active')} === true && ${v(nextPerson, 'seatId')} === 'none' && ${v(profile('newData'), 'paid')} === false && ${profile('newData')}.exists())`,
  `(${payment} && ${currentPerson}.exists() && ${v(profile('newData'),'revision')} === ${v('newData','commit/revision')} && ${v(profile('newData'), 'paid')} === ${v(op, 'paid')})`,
  `(${returning} && ${v(currentPerson, 'active')} === false && ${v(nextPerson, 'active')} === true && ${v(currentPerson, 'seatId')} === 'none' && ${v(nextPerson, 'seatId')} === 'none')`,
  `(${cancelling.map(x => '(' + x + ')').join(' && ')})`,
  `(${ticketChange.map(x => '(' + x + ')').join(' && ')})`,
];

export function addLifecycle(rules) {
  const event = rules.rules.checks.$run.event;
  // 既存席操作の条件は残し、閉じた券の復帰後とQR生成済みの保護を補う。
  const seatA=v(op,'seatA'), oldPerson=`(${seatA} === 'none' ? 'none' : data.child('seats').child(${seatA}).child('personId').val())`, oldTicket=`data.child('tickets').child(${oldPerson})`;
  const unissued=`${oldTicket}.child('everIssued').val() === false`;
  if(!event['.validate'].includes(unissued))throw new Error('legacy-protection-expression-changed');
  event['.validate'] = event['.validate'].replace(unissued,`(!${oldTicket}.exists() || ${oldTicket}.child('cycleClosed').val() === true || ${unissued})`);
  for(const side of ['A','B']){
    const id=v(op,'seat'+side),value=`(${id} === 'none' ? 'none' : data.child('seats').child(${id}).child('personId').val())`;
    const sparse=`(${id} === 'none' || !data.child('seats').child(${id}).exists() ? 'none' : data.child('seats').child(${id}).child('personId').val())`;
    if(!event['.validate'].includes(value))throw new Error('legacy-seat-expression-changed');
    event['.validate']=event['.validate'].replaceAll(value,sparse);
  }
  const legacy = event['.validate'];
  const protection = `(${v(op, 'kind')} !== 'unassign' || !data.child('tickets').child(${v(op, 'beforeA')}).exists() || data.child('tickets').child(${v(op, 'beforeA')}).child('cycleClosed').val() === true || data.child('tickets').child(${v(op, 'beforeA')}).child('credentialRef').val() === '')`;
  const lifeRoot = transitionBase.map(x => '(' + x + ')').join(' && ') + ' && (' + branches.join(' || ') + ')';
  event['.validate'] = `((${legacy}) && (${protection})) || (${lifeRoot})`;
  const childRoot = 'newData.parent().parent()', childOp = opAt(childRoot);
  const life = `(${isLife(childOp)})`;
  const selected = `${v(childOp, 'target')} === $person`;
  const changed = `${v(childRoot, 'commit/revision')} === ${v(oldRoot, 'commit/revision')}+1`;
  const commonWrite = `${editing} && newData.exists() && ${changed} && ${life} && ${selected}`;
  const ppl = event.people.$person;
  const oldPeopleWrite = ppl['.write'], oldPeopleValidate = ppl['.validate'];
  ppl['.write'] = `(${oldPeopleWrite}) || (${commonWrite} && (${['register','cancelAttendance','returnAttendance'].map(k => `${v(childOp,'kind')} === '${k}'`).join(' || ')}))`;
  ppl['.validate'] = `(${oldPeopleValidate}) || (${life} && ${selected} && newData.hasChildren(['seatId','revision','active','displayName']) && ${v('newData','revision')} === ${v(childRoot,'commit/revision')} && (${v(childOp,'kind')} === 'register' ? newData.child('displayName').isString() && ${v('newData','displayName')}.length <= 6 : ${v('newData','displayName')} === ${v('data','displayName')}))`;
  const profileFields = ['name','displayName','paid','extra','revision'];
  const profileShape = shape(profileFields);
  profileShape.extra = shape(Array.from({length:10},(_,i)=>'f'+i));
  const profileValid = ["newData.hasChildren(['name','displayName','paid','extra','revision'])", "newData.child('name').isString()", `${v('newData','name')}.length > 0 && ${v('newData','name')}.length <= 50`, "newData.child('displayName').isString()", `${v('newData','displayName')}.length <= 6`, "newData.child('paid').isBoolean()", `${v('newData','revision')} === ${v(childRoot,'commit/revision')}`,
    ...Array.from({length:10},(_,i)=>`newData.child('extra/f${i}').isString() && ${v('newData','extra/f'+i)}.length <= 200`),
    `${v(childOp,'kind')} === 'register' ? ${v('newData','displayName')} === ${v(childRoot+".child('people').child($person)",'displayName')} : (${['name','displayName',...Array.from({length:10},(_,i)=>'extra/f'+i)].map(k=>`${v('newData',k)} === ${v('data',k)}`).join(' && ')})`,
  ];
  event.profiles = {$person:{'.read':manager, '.write':`${commonWrite} && (${v(childOp,'kind')} === 'register' || (${v(childOp,'kind')} === 'payment' && data.exists()))`, '.validate':profileValid.map(x=>'('+x+')').join(' && '), ...profileShape}};
  const ticketFields = ['credentialRef','code','currentCycle','credentialVersion','cycleClosed','everIssued','everSent','issued','sent','issuedAt','sentAt','revision'];
  event.tickets.$person = {'.read': event.tickets.$person['.read'], '.write':`${commonWrite} && (${['qrCreate','qrReissue','ticketCheck','cancelAttendance'].map(k=>`${v(childOp,'kind')} === '${k}'`).join(' || ')})`,
    '.validate': ["newData.hasChildren("+JSON.stringify(ticketFields)+")", ...['credentialRef','code'].map(k=>`newData.child('${k}').isString()`), ...['currentCycle','credentialVersion','issuedAt','sentAt','revision'].map(k=>`newData.child('${k}').isNumber() && ${v('newData',k)} >= 0 && ${v('newData',k)} % 1 === 0`), ...['cycleClosed','everIssued','everSent','issued','sent'].map(k=>`newData.child('${k}').isBoolean()`), `${v('newData','revision')} === ${v(childRoot,'commit/revision')}`, ...['issued','sent'].map(k=>`${v('newData',k+'At')} === (${v('newData',k)} === false ? 0 : (${v('data',k)} === true && ${v('data','cycleClosed')} === false ? ${v('data',k+'At')} : now))`)].map(x=>'('+x+')').join(' && '), ...shape(ticketFields)};
  const operationFields = ['kind','target','expectedRevision','resultRevision','sourceControlRevision','humanUid','confirmedPrimary','confirmedTicketWarning','stopConfirmed','paid','issued','sent','newCredential','newCode','previousCredential','previousCode','previousSeat','ticketSnapshot','committedAt'];
  const legacyOp = event.operations.$operation;
  const opRoot = 'newData.parent().parent()';
  const writeOp = `${editing} && !data.exists() && newData.exists() && $operation === ${v(opRoot,'commit/operationId')}`;
  event.operations.$operation = {'.read':legacyOp['.read'], '.write':writeOp, '.validate':`(${isLife('newData')}) ? (newData.hasChildren(${JSON.stringify(operationFields)}) && ${['confirmedPrimary','confirmedTicketWarning','stopConfirmed','paid','issued','sent'].map(k=>`newData.child('${k}').isBoolean()`).join(' && ')} && newData.child('newCredential').isString() && newData.child('newCode').isString()) : newData.hasChildren(['kind','seatA','seatB','beforeA','beforeB','afterA','afterB','expectedRevision','resultRevision','humanUid'])`, ...shape([...operationFields,'seatA','seatB','beforeA','beforeB','afterA','afterB'])};
  for(const field of ['seatA','seatB','beforeA','beforeB','afterA','afterB'])event.operations.$operation[field]={'.validate':`!(${isLife('newData.parent()')})`};
  for(const field of operationFields.filter(k=>!['kind','expectedRevision','resultRevision','humanUid'].includes(k)))event.operations.$operation[field]={'.validate':`(${isLife('newData.parent()')})`};
  event.operations.$operation.ticketSnapshot={'.validate':`newData.val() === 'none' || newData.hasChildren(${JSON.stringify(ticketFields)})`,...shape(ticketFields)};
  for(const field of ['newCredential','previousCredential'])event.operations.$operation[field]={'.validate':`newData.isString() && newData.val().length <= 36 && (${isLife('newData.parent()')})`};
  for(const field of ['newCode','previousCode'])event.operations.$operation[field]={'.validate':`newData.isString() && newData.val().length <= 8 && (${isLife('newData.parent()')})`};
  const ticketOperation=`(${v(op,'kind')} === 'qrCreate' || ${v(op,'kind')} === 'qrReissue' || ${v(op,'kind')} === 'ticketCheck' || (${closing} && ${before}.exists()))`;
  event['.validate']+=` && ((${isLife(op)}) ? (${ticketOperation} ? (${ticketFields.map(k=>`${v(after,k)} === ${v(op,'ticketSnapshot/'+k)}`).join(' && ')}) : ${v(op,'ticketSnapshot')} === 'none') : true)`;
  // 取消しが触れるのは対象者の旧席だけ。ほかの席・投影への便乗を拒否する。
  for (const collection of ['seats','view']) {
    const node = event[collection].$seat;
    node['.write'] = `(${node['.write']}) || (${editing} && newData.exists() && ${changed} && ${v(childOp,'kind')} === 'cancelAttendance' && $seat === ${oldRoot}.child('people').child(${v(childOp,'target')}).child('seatId').val())`;
  }
  addCredentialRules(event);
  const initialize=`!data.exists() && ${base}.child('control/state').val() === 'preparing' && newData.child('commit/revision').val() === 1 && newData.child('commit/operationId').val() === 'initialize' && !newData.child('operations').exists()`;
  event['.validate']=`(${initialize}) || (${event['.validate']})`;
  return rules;
}

function addCredentialRules(event) {
  const root = 'newData.parent().parent()', operation = opAt(root), target = v(operation,'target');
  const current = `${root}.child('tickets').child(${target})`, old = `${oldRoot}.child('tickets').child(${target})`;
  const qrKind = `(${v(operation,'kind')} === 'qrCreate' || ${v(operation,'kind')} === 'qrReissue')`;
  const revoke = `(${v(operation,'kind')} === 'qrReissue' || ${v(operation,'kind')} === 'cancelAttendance')`;
  const newId = `${v(operation,'newCredential')}`, oldId = `${v(old,'credentialRef')}`;
  const newCode = `${v(operation,'newCode')}`, oldCode = `${v(old,'code')}`;
  const credential = `${root}.child('credentials').child(${newId})`, reservation = `${root}.child('codes').child(${newCode})`;
  const oldCredential = `${root}.child('credentials').child(${oldId})`, oldReservation = `${root}.child('codes').child(${oldCode})`;
  const rootOp = opAt('newData'), newTicket = ticket('newData'), oldTicket = ticket('data');
  const newProof = `!data.child('credentials').child(${v(rootOp,'newCredential')}).exists() && !data.child('codes').child(${v(rootOp,'newCode')}).exists() && newData.child('credentials').child(${v(rootOp,'newCredential')}).child('active').val() === true && newData.child('credentials').child(${v(rootOp,'newCredential')}).child('revision').val() === ${v('newData','commit/revision')} && newData.child('codes').child(${v(rootOp,'newCode')}).child('credentialRef').val() === ${v(newTicket,'credentialRef')} && newData.child('codes').child(${v(rootOp,'newCode')}).child('active').val() === true && newData.child('codes').child(${v(rootOp,'newCode')}).child('revision').val() === ${v('newData','commit/revision')}`;
  const oldProof = `newData.child('credentials').child(${v(oldTicket,'credentialRef')}).child('active').val() === false && newData.child('credentials').child(${v(oldTicket,'credentialRef')}).child('revision').val() === ${v('newData','commit/revision')} && newData.child('codes').child(${v(oldTicket,'code')}).child('active').val() === false && newData.child('codes').child(${v(oldTicket,'code')}).child('revision').val() === ${v('newData','commit/revision')}`;
  event['.validate'] = `(${event['.validate']}) && ((${isLife(rootOp)}) ? ((${v(rootOp,'kind')} === 'qrCreate' || ${v(rootOp,'kind')} === 'qrReissue') ? (${newProof}) : true) && ((${v(rootOp,'kind')} === 'qrReissue' || ${v(rootOp,'kind')} === 'cancelAttendance') && ${oldTicket}.exists() && ${v(oldTicket,'credentialRef')} !== '' ? (${oldProof}) : true) : true)`;
  event.credentials = {$credential:{'.read':manager,
    '.write':`${editing} && newData.exists() && (${v(root,'commit/revision')} === ${v(oldRoot,'commit/revision')}+1) && ((!data.exists() && ${qrKind} && $credential === ${newId}) || (data.exists() && ${revoke} && $credential === ${oldId} && ${v('data','active')} === true))`,
    '.validate':`newData.hasChildren(['personId','currentCycle','credentialVersion','code','active','revision']) && ${v('newData','revision')} === ${v(root,'commit/revision')} && (!data.exists() ? ($credential.matches(/^[a-f0-9-]{36}$/) && ${v('newData','personId')} === ${target} && ${v('newData','currentCycle')} === ${v(current,'currentCycle')} && ${v('newData','credentialVersion')} === ${v(current,'credentialVersion')} && ${v('newData','code')} === ${newCode} && ${v('newData','active')} === true) : (${['personId','currentCycle','credentialVersion','code'].map(k=>`${v('newData',k)} === ${v('data',k)}`).join(' && ')} && ${v('newData','active')} === false))`, ...shape(['personId','currentCycle','credentialVersion','code','active','revision'])}};
  event.codes = {$code:{'.read':manager,
    '.write':`${editing} && newData.exists() && (${v(root,'commit/revision')} === ${v(oldRoot,'commit/revision')}+1) && ((!data.exists() && ${qrKind} && $code === ${newCode}) || (data.exists() && ${revoke} && $code === ${oldCode} && ${v('data','active')} === true))`,
    '.validate':`$code.matches(/^[0-9]{8}$/) && newData.hasChildren(['credentialRef','active','revision']) && ${v('newData','revision')} === ${v(root,'commit/revision')} && (!data.exists() ? (${v('newData','credentialRef')} === ${newId} && ${v('newData','active')} === true && ${v(credential,'code')} === $code) : (${v('newData','credentialRef')} === ${v('data','credentialRef')} && ${v('newData','active')} === false))`, ...shape(['credentialRef','active','revision'])}};
}
