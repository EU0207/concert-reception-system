import assert from 'node:assert/strict';
import {generated as prior} from '../GD91-123/image-rules.mjs';
export const credentialPattern='^[A-Za-z0-9_-]{21}[AQgw]$';
export const codePattern='^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$';
export function generated(){
  const rules=prior(),event=rules.rules.checks.$run.event;
  const replace=(node,from,to)=>{assert(node['.validate'].includes(from));node['.validate']=node['.validate'].replace(from,to);};
  replace(event.credentials.$credential,'$credential.matches(/^[a-f0-9-]{36}$/)','$credential.matches(/'+credentialPattern+'/)');
  replace(event.codes.$code,'$code.matches(/^[0-9]{8}$/)','$code.matches(/'+codePattern+'/)');
  return rules;
}
