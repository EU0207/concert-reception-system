import {randomBytes,randomInt} from 'node:crypto';
import {command as prior} from '../GD91-103/model.mjs';
const alphabet='23456789ABCDEFGHJKMNPQRSTVWXYZ';
export function command(actor,state,head,kind,target,options={}){
  return prior(actor,state,head,kind,target,{...(['qrCreate','qrReissue'].includes(kind)?{
    credential:randomBytes(16).toString('base64url'),code:Array.from({length:8},()=>alphabet[randomInt(alphabet.length)]).join('')
  }:{}),...options});
}
