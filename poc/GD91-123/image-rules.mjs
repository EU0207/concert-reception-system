import {generated as seatRules} from '../GD91-116/generate.mjs';
import {base, authorized, manager, editing} from '../GD91-84/auth-rules.mjs';

const val = (node, path) => `${node}.child('${path}').val()`;
const fields = names => Object.fromEntries(names.map(name => [name, {'.validate':true}]));
const slotAllowed = "($slot === '0' || $slot === '1' || $slot === '2' || $slot === '3' || $slot === '4')";
const bankAllowed = "($bank === 'a' || $bank === 'b')";
const imageRoot = `${base}.child('images').child($slot)`;
const reading = `(${authorized} && (${manager} || ${val(base, 'control/state')} === 'preparing' || ${val(base, 'control/state')} === 'operating' || ${val(base, 'control/state')} === 'stopped'))`;
const nextSlot = 'newData', oldSlot = 'data';
const nextHead = `${nextSlot}.child('head')`, oldHead = `${oldSlot}.child('head')`;
const unchanged = ['revision','active','bank','operationId','sha256'].map(k => `${val(nextHead,k)} === ${val(oldHead,k)}`).join(' && ');
const op = `${nextSlot}.child('operations').child(${val(nextHead,'operationId')})`;
const payload = `${nextSlot}.child('banks').child(${val(nextHead,'bank')})`;
const oldRevision = `(${oldHead}.exists() ? ${val(oldHead,'revision')} : 0)`;
const shape = (node,names) => `${node}.hasChildren(${JSON.stringify(names)})`;
const headFields = ['schemaVersion','revision','active','bank','operationId','sha256'];
const bankFields = ['schemaVersion','expectedRevision','revision','operationId','mime','rawBytes','base64','sha256'];
const operationFields = ['schemaVersion','kind','slot','revision','bank','sha256','committedAt'];

export function generated() {
  const rules = seatRules();
  const encoded = "newData.child('base64')", text = `${encoded}.val()`;
  const decodedLength = `(${text}.length / 4 * 3 - (${text}.matches(/.*==$/) ? 2 : (${text}.matches(/.*=$/) ? 1 : 0)))`;
  const transition = [
    `${val(nextHead,'revision')} === ${oldRevision} + 1`,
    `${val(nextHead,'schemaVersion')} === 1`,
    `${op}.exists()`,
    `!${oldSlot}.child('operations').child(${val(nextHead,'operationId')}).exists()`,
    `${val(op,'revision')} === ${val(nextHead,'revision')}`,
    `${val(op,'bank')} === ${val(nextHead,'bank')}`,
    `${val(op,'sha256')} === ${val(nextHead,'sha256')}`,
    `(${val(nextHead,'active')} === true ? (` + [
      `${val(op,'kind')} === 'publish'`,
      `${payload}.exists()`,
      `${val(payload,'operationId')} === ${val(nextHead,'operationId')}`,
      `${val(payload,'expectedRevision')} === ${oldRevision}`,
      `${val(payload,'revision')} === ${val(nextHead,'revision')}`,
      `${val(payload,'sha256')} === ${val(nextHead,'sha256')}`,
      `(${val(oldHead,'active')} !== true || ${val(nextHead,'bank')} !== ${val(oldHead,'bank')})`
    ].join(' && ') + `) : (${val(op,'kind')} === 'remove' && ${val(oldHead,'active')} === true && ${val(nextHead,'bank')} === '' && ${val(nextHead,'sha256')} === ''))`
  ].join(' && ');
  rules.rules.checks.$run.images = {$slot:{
    '.validate':`(${unchanged}) || (${transition})`,
    head:{'.read':`${slotAllowed} && ${reading}`,'.write':`${slotAllowed} && ${editing} && newData.exists()`,
      '.validate':`${shape('newData',headFields)} && newData.child('active').isBoolean() && newData.child('revision').isNumber() && ${val('newData','operationId')}.matches(/^[a-f0-9-]{36}$/)`,
      ...fields(headFields),'$other':{'.validate':false}},
    banks:{$bank:{
      '.read':`${slotAllowed} && ${bankAllowed} && ${reading} && ((${val(imageRoot,'head/active')} === true && ${val(imageRoot,'head/bank')} === $bank) || (${manager} && ${val('data','expectedRevision')} === (${imageRoot}.child('head').exists() ? ${val(imageRoot,'head/revision')} : 0)))`,
      '.write':`${slotAllowed} && ${bankAllowed} && ${editing} && !(${val(imageRoot,'head/active')} === true && ${val(imageRoot,'head/bank')} === $bank) && (!newData.exists() || (` +
        `${val('newData','expectedRevision')} === (${imageRoot}.child('head').exists() ? ${val(imageRoot,'head/revision')} : 0) && ${val('newData','revision')} === ${val('newData','expectedRevision')} + 1 && !${imageRoot}.child('operations').child(${val('newData','operationId')}).exists()))`,
      '.validate':[shape('newData',bankFields),`${val('newData','schemaVersion')} === 1`,
        `(${val('newData','mime')} === 'image/png' || ${val('newData','mime')} === 'image/jpeg')`,
        `newData.child('rawBytes').isNumber() && ${val('newData','rawBytes')} >= 1 && ${val('newData','rawBytes')} <= 1000000 && ${val('newData','rawBytes')} % 1 === 0`,
        `${encoded}.isString() && ${text}.length <= 1333336 && ${text}.length % 4 === 0 && ${text}.matches(/^[A-Za-z0-9+\/]*={0,2}$/)`,
        `${decodedLength} === ${val('newData','rawBytes')}`,
        `${val('newData','sha256')}.matches(/^[a-f0-9]{64}$/)`,
        `${val('newData','operationId')}.matches(/^[a-f0-9-]{36}$/)`].join(' && '),
      ...fields(bankFields),'$other':{'.validate':false}}},
    operations:{$operation:{'.read':`${slotAllowed} && ${manager}`,
      '.write':`${slotAllowed} && ${editing} && !data.exists() && newData.exists() && newData.parent().parent().child('head/operationId').val() === $operation && ${val(imageRoot,'head/operationId')} !== $operation`,
      '.validate':`${shape('newData',operationFields)} && ${val('newData','schemaVersion')} === 1 && ${val('newData','slot')} === $slot && ${val('newData','committedAt')} === now`,
      ...fields(operationFields),'$other':{'.validate':false}}},
    '$other':{'.validate':false}
  }};
  return rules;
}
