import {createRequire} from 'node:module';import {pathToFileURL,fileURLToPath} from 'node:url';import path from 'node:path';import {users} from './client.mjs';
const require=createRequire(new URL('../POC-004/package.json',import.meta.url));
export async function browserPool(){
 const {createServer}=await import(pathToFileURL(require.resolve('vite'))),{chromium}=require('@playwright/test'),contexts=[];
 const server=await createServer({configFile:false,root:fileURLToPath(new URL('./',import.meta.url)),resolve:{alias:{firebase:path.dirname(require.resolve('firebase/package.json'))}},server:{host:'127.0.0.1',port:4892,strictPort:true},logLevel:'error'});let browser;
 try{await server.listen();browser=await chromium.launch({channel:'msedge',headless:true});}catch(e){await server.close();throw e;}
 return{create:async()=>{const context=await browser.newContext();contexts.push(context);await context.route('**/*',route=>{const u=new URL(route.request().url());return u.hostname==='127.0.0.1'&&['4892','8385','9495'].includes(u.port)?route.continue():route.abort();});
  const page=await context.newPage();await page.goto('http://127.0.0.1:4892/browser.html');await page.waitForFunction(()=>!!window.probe);const actor=await page.evaluate(()=>window.probe.ready());users.push(actor);const meter={requests:0,requestBytes:0,responseBytes:0};
  return{actor,meter,send:async(url,method='GET',value)=>{const r=await page.evaluate(args=>window.probe.send(args),{url,method,value});meter.requests++;meter.requestBytes+=r.requestBytes;meter.responseBytes+=r.responseBytes;return r;},close:()=>page.evaluate(()=>window.probe.close())};},
 close:async()=>{for(const c of contexts)await c.close();await browser.close();await server.close();}};
}
