import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
const legacy=new URL('../GD91-88/model.mjs',import.meta.url).href,replacement=new URL('./qr-model.mjs',import.meta.url).href;
export const executionLog=[];
const digest=s=>createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex');
// 元PoCを変更せず、QR既定値と隔離ポートだけを差し替える。Rules・認可条件は変えない。
registerHooks({resolve(specifier,context,next){const result=next(specifier,context);if(result.url===legacy&&context.parentURL!==replacement)return{...result,url:replacement};return result;},
 load(url,context,next){const result=next(url,context);if(result.format==='module'&&(url.startsWith('data:')||url.startsWith('file:')&&url.includes('/poc/'))&&!url.includes('/node_modules/')&&!url.endsWith('/runtime-hook.mjs')&&result.source){
  const source=typeof result.source==='string'?result.source:Buffer.from(result.source).toString();
  const ports=source.replace(/\b9000\b/g,'9100').replace(/\b9191\b/g,'9291');
  const transformed=url.endsWith('/GD91-97/common-cases.mjs')?ports.replace("code:'10000000'","code:'ABCD2345'").replace("code:'10000001'","code:'ABCD2346'"):ports;
  executionLog.push({source:url.startsWith('file:')?url.slice(url.indexOf('/poc/')+5):'inline:'+digest(source),originalHash:digest(source),executedHash:digest(transformed),portsAdapted:source!==ports,positiveCodeFixturesAdapted:ports!==transformed});
  return{...result,source:transformed};
 }return result;}});
