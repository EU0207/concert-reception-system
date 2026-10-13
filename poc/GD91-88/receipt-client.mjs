import {plan as previousPlan} from '../GD91-87/receipt-client.mjs';
export {key,sameEvent,journal,accept} from '../GD91-87/receipt-client.mjs';

export function plan(performanceId,subject,sequence,attendeeId,scanned,changes={}) {
  if(!scanned?.credentialRef || !Number.isInteger(scanned.currentCycle) || !Number.isInteger(scanned.credentialVersion))throw new Error('scanned-credential-required');
  return previousPlan(performanceId,subject,sequence,attendeeId,{
    schemaVersion:2,currentCycle:scanned.currentCycle,
    credentialRef:scanned.credentialRef,credentialVersion:scanned.credentialVersion,...changes,
  });
}
