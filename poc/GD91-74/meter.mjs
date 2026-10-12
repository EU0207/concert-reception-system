// 隔離PoCの要求数を記録する。認証ヘッダーと文書本文は出力しない。
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import assert from 'node:assert/strict';
export const digest=p=>createHash('sha256').update(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n')).digest('hex');
export const stringSize=s=>Buffer.byteLength(s,'utf8')+1;
export function valueSize(v){
 if('stringValue'in v)return stringSize(v.stringValue);
 if('integerValue'in v||'doubleValue'in v||'timestampValue'in v)return 8;
 if('booleanValue'in v||'nullValue'in v)return 1;
 if('arrayValue'in v)return(v.arrayValue.values??[]).reduce((s,v)=>s+valueSize(v),0);
 if('mapValue'in v)return fieldSize(v.mapValue.fields??{})+32;
 if('bytesValue'in v)return Buffer.from(v.bytesValue,'base64').length;
 throw new Error('unsupported-size-type:'+Object.keys(v).join(','));
}
export const fieldSize=f=>Object.entries(f).reduce((s,[k,v])=>s+stringSize(k)+valueSize(v),0);
export function documentSize(d){const p=d.name.split('/documents/')[1];assert(p);return p.split('/').reduce((s,x)=>s+stringSize(x),16)+fieldSize(d.fields??{})+32;}
export function install(){
 const original=globalThis.fetch,phases={},documents=new Map();let phase='fixture';
 globalThis.fetch=async(input,init={})=>{
  const url=String(input);assert(url.startsWith('http://127.0.0.1:8181/')||url.startsWith('http://127.0.0.1:9191/'),'local-emulators-only');
  const b=init.body?JSON.parse(init.body):null,owner=init.headers?.authorization==='Bearer owner',method=init.method??'GET';
  let r=await original(input,init);if(!url.includes(':8181/'))return r;
  const c=phases[phase]??={normal:{requests:0,reads:0,writes:0,failed:0,maxRestJsonBytes:0},fixtureOwner:{requests:0,reads:0,writes:0,failed:0,maxRestJsonBytes:0}};
  const m=owner?c.fixtureOwner:c.normal;m.requests++;if(method==='GET')m.reads++;if(!r.ok&&r.status!==404)m.failed++;
  // 計測入口の読取りだけを再試行する。書込みと同一ID復旧の契約は変更しない。
  for(let retry=0;method==='GET'&&r.status===499&&retry<2;retry++){
   await new Promise(resolve=>setTimeout(resolve,100));r=await original(input,init);m.requests++;m.reads++;m.readRetries=(m.readRetries??0)+1;if(!r.ok&&r.status!==404)m.failed++;
  }
  m.maxRestJsonBytes=Math.max(m.maxRestJsonBytes,Buffer.byteLength(init.body??''));
  if(r.ok&&b?.writes){m.writes+=b.writes.length;for(const w of b.writes)if(w.update)documents.set(w.update.name,{document:w.update,partial:Boolean(w.updateMask)});}
  return r;
 };
 return {phase:p=>{phase=p;},result:()=>({phases,largestSentDocuments:[...documents.values()].map(({document:d,partial})=>({path:d.name.split('/documents/')[1],bytes:documentSize(d),partial})).sort((a,b)=>b.bytes-a.bytes).slice(0,8)}),documents};
}
