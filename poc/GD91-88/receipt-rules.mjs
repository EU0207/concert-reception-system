import {receiptRules as previousRules} from '../GD91-87/receipt-rules.mjs';
import {base} from '../GD91-84/auth-rules.mjs';

export function receiptRules() {
  const rules=previousRules(),item=rules.$device.events.$key;
  const ticket=`${base}.child('event/tickets').child(newData.child('attendeeId').val())`;
  const issuedGuard=` && (${ticket}.child('everIssued').val() === true)`;
  if(!item['.validate'].includes(issuedGuard))throw new Error('previous-receipt-expression-changed');
  item['.validate']=item['.validate'].replace(issuedGuard,'').replace("newData.child('schemaVersion').val() === 1","newData.child('schemaVersion').val() === 2")
    + ` && newData.child('currentCycle').val() === ${ticket}.child('currentCycle').val()`
    + ` && newData.child('credentialRef').val() === ${ticket}.child('credentialRef').val()`;
  item.currentCycle={'.validate':'newData.isNumber() && newData.val() > 0 && newData.val() % 1 === 0'};
  item.credentialRef={'.validate':'newData.isString() && newData.val().length > 0'};
  return rules;
}
