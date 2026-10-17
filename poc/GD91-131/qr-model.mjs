import {randomBytes,randomInt} from 'node:crypto';
import {command as original} from '../GD91-88/model.mjs';
export * from '../GD91-88/model.mjs';
const alphabet='23456789ABCDEFGHJKMNPQRSTVWXYZ';
export function command(actor,state,kind,target,options={}){
 return original(actor,state,kind,target,{...(['qrCreate','qrReissue'].includes(kind)?{credential:randomBytes(16).toString('base64url'),
  code:Array.from({length:8},()=>alphabet[randomInt(alphabet.length)]).join('')}:{}),...options});
}
