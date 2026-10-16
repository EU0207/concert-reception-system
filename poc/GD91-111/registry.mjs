import assert from 'node:assert/strict';
export function appendDevice(head,device){
 const count=(head?.count??0)+1;assert(Number.isSafeInteger(count));
 return{['devices/'+device.deviceUid]:device,'deviceRoster/meta':{count,revision:(head?.revision??0)+1,lastDeviceUid:device.deviceUid},['deviceRoster/byOrder/n'+(count-1)]:device.deviceUid,['deviceRoster/byId/'+device.deviceUid]:count-1};
}
export async function deviceRoster(read){
 const first=await read('deviceRoster/meta');assert(first&&Number.isSafeInteger(first.count)&&first.count>0,'missing-device-roster');const devices=[];
 for(let i=0;i<first.count;i++){const uid=await read('deviceRoster/byOrder/n'+i);assert(typeof uid==='string'&&uid.length>0,'missing-device-slot');const d=await read('devices/'+uid);assert(d&&d.deviceUid===uid&&await read('deviceRoster/byId/'+uid)===i,'device-roster-mismatch');devices.push(d);}
 const last=await read('deviceRoster/meta');assert.deepEqual(first,last,'device-roster-changed');return{meta:first,devices};
}
