import {command as lifecycle,proposal as seat,bulk as assignAll} from '../GD91-90/model.mjs';
export {applyModel} from '../GD91-90/model.mjs';
export function seal(body){
 const rows=Object.entries(body).filter(([path])=>path.startsWith('reception/i-'));
 body['operations/'+body.commit.operationId].qrSnapshot=rows.length?Object.fromEntries(rows.map(([,r])=>[r.personId,{credentialRef:r.credentialRef,currentCycle:r.currentCycle,credentialVersion:r.credentialVersion}])):'none';return body;
}
export const command=(...args)=>seal(lifecycle(...args));
export function proposal(f,state,head,kind,seatA,seatB='none',person='none',options={}){const body=seat(f,state,head,kind,seatA,seatB,person,options.id);body['operations/'+body.commit.operationId].sourceControlRevision=options.controlRevision??1;return seal(body);}
export const bulk=(...args)=>seal(assignAll(...args));
