export * from '../GD91-89/support.mjs';
import {request as original,trial} from '../GD91-84/transport.mjs';
import {clockPatch} from './clock-transport.mjs';
export async function request(path,options={}){
 if(options.method==='PATCH'&&options.token!=='owner'){const p=clockPatch(path,options.body);return original(p.path,{...options,body:p.body});}
 return original(path,options);
}
export const user=(path,actor,method='GET',body)=>request(trial+'/'+path,{token:actor.token,method,body});
