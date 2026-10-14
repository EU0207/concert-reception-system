export * from '../GD91-89/support.mjs';
import {request as original,trial} from '../GD91-84/transport.mjs';
import {protocolPatch} from './clock-transport.mjs';
export async function request(path,options={}){
 if(options.method==='PATCH'&&options.token!=='owner'){
  const p=await protocolPatch(path,options.body,async path=>original(path,{token:options.token}));if(p.response)return p.response;
  const r=await original(p.path,{...options,body:p.body});
  if(p.path!==path&&r.status===200){const prefix=path.slice(p.path.length+1),at=key=>r.body[prefix+'/'+key]??(prefix+'/'+key).split('/').reduce((node,k)=>node?.[k],r.body);return{...r,body:Object.fromEntries(Object.keys(options.body).map(k=>[k,at(k)]))};}
  return r;
 }
 return original(path,options);
}
export const user=(path,actor,method='GET',body)=>request(trial+'/'+path,{token:actor.token,method,body});
