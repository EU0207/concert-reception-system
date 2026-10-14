import {command as lifecycle,proposal as seat,bulk as assignAll} from '../GD91-91/model.mjs';
export {applyModel} from '../GD91-91/model.mjs';
const bind=(f,body)=>{if(!f.referenceId)throw new Error('base-reference-required');body['operations/'+body.commit.operationId].referenceId=f.referenceId;return body;};
export const command=(f,...args)=>bind(f,lifecycle(f,...args));
export const proposal=(f,...args)=>bind(f,seat(f,...args));
export const bulk=(f,...args)=>bind(f,assignAll(f,...args));
