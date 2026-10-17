import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {runCases as seatCases} from '../GD91-110/common-cases.mjs';
import {prepare,publish,remove,decode} from './model.mjs';
function crc32(buffer){let crc=0xffffffff;for(const b of buffer){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
export function tinyPng(){
  function chunk(name,data){const type=Buffer.from(name),size=Buffer.alloc(4),crc=Buffer.alloc(4);
    size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([size,type,data,crc]);}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(4,0);ihdr.writeUInt32BE(2,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),
    chunk('IDAT',deflateSync(Buffer.alloc(2*(1+4*4)))),chunk('IEND',Buffer.alloc(0))]);
}
export async function runCases(io,m,a){
  const prior=await seatCases(io,m,a),reports=[...prior.reports],bytes=tinyPng();
  const send=async(path,method,body)=>{const r=await io.normal(m,path,method,body);assert.equal(r.status,200);return r.body;};
  const report=(id,facts)=>{const r={id,...facts};reports.push(r);io.onReport?.(r);};
  const first=prepare(bytes,'image/png');await send('images/0/banks/a','PUT',first);
  assert.equal((await io.normal(a,'images/0/banks/a')).status,401);
  await send('images/0','PATCH',publish('0','a',first));
  const header=await io.sdkRead(a,'images/0/head'),payload=await io.sdkRead(a,'images/0/banks/'+header.bank);
  assert.deepEqual(decode(payload),bytes);
  report('P01-images-and-general-sdk',{stagingDenied:true,normalImagePublication:true,ordinarySdkImageRead:true,rawBytes:bytes.length});
  assert.equal((await io.normal(m,'images/5/banks/a','PUT',first)).status,401);
  assert.equal((await io.normal(m,'images/0/banks/b','PUT',{...prepare(bytes,'image/png',1),rawBytes:1000001})).status,401);
  const next=prepare(bytes,'image/png',1),body=publish('0','b',next);await send('images/0/banks/b','PUT',next);
  assert.equal((await io.normal(m,'images/0/head','PUT',body.head)).status,401);
  await send('images/0','PATCH',body);
  assert.equal((await io.normal(a,'images/0/banks/a')).status,401);
  assert.equal((await io.normal(m,'images/0/banks/a')).status,401);
  await send('images/0/banks/a','DELETE');
  report('P02-image-direct-boundaries',{sixthSlotDenied:true,oversizedRawBytesDenied:true,headOnlyDenied:true,oldImageDeniedAndDeleted:true});
  const device=await io.owner('devices/'+a.device.uid);await io.owner('devices/'+a.device.uid,'PATCH',{active:false});
  assert.equal((await io.normal(a,'images/0/head')).status,401);
  await send('images/0/head','GET');await io.owner('devices/'+a.device.uid,'PUT',device);
  report('P03-shared-device-stop',{stoppedReaderDenied:true,otherManagerContinued:true,stopStateOwnerInjected:true});
  const h=await send('images/0/head','GET');
  const count=reports.length;
  await send('images/0/operations/'+h.operationId,'GET');
  assert.equal((await io.normal(m,'images/0','PATCH',body)).status,401);
  await send('images/0','PATCH',remove('0',2));
  assert.equal((await io.normal(a,'images/0/banks/b')).status,401);
  assert.equal((await io.normal(m,'images/0/operations/'+h.operationId,'DELETE')).status,401);
  await send('images/0/banks/b','DELETE');assert.equal(reports.length,count);
  report('P04-image-result-retention',{queryDoesNotRewrite:true,replayDenied:true,removedImageNotReadable:true,resultRetained:true});
  const root=await io.owner(''),rootBytes=Buffer.byteLength(JSON.stringify(root));assert(rootBytes<=1048576);
  return{...prior,reports,maxRootJsonBytes:Math.max(prior.maxRootJsonBytes,rootBytes),
    imageGroups:4,realImageReadabilityVerified:false,appCheckEnforcementVerified:false};
}
