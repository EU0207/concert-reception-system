import {createRequire} from 'node:module';import {pathToFileURL,fileURLToPath} from 'node:url';import path from 'node:path';import {users} from './client.mjs';
const require=createRequire(new URL('../POC-004/package.json',import.meta.url));
export async function client(){
 const {createServer}=await import(pathToFileURL(require.resolve('vite'))),{chromium}=require('@playwright/test');
 const server=await createServer({configFile:false,root:fileURLToPath(new URL('./',import.meta.url)),resolve:{alias:{firebase:path.dirname(require.resolve('firebase/package.json'))}},server:{host:'127.0.0.1',port:4891,strictPort:true},logLevel:'error'});
 let browser,context;
 try{await server.listen();browser=await chromium.launch({channel:'msedge',headless:true});context=await browser.newContext();
 await context.route('**/*',route=>{const url=new URL(route.request().url());return url.hostname==='127.0.0.1'&&['4891','8384','9494'].includes(url.port)?route.continue():route.abort();});
 const page=await context.newPage();await page.goto('http://127.0.0.1:4891/browser.html');await page.waitForFunction(()=>!!window.probe);const actor=await page.evaluate(()=>window.probe.ready());users.push(actor);
 return{actor,read:async p=>{const r=await page.evaluate(p=>window.probe.read(p),p);if(!r.ok)throw Object.assign(new Error(r.code),{code:r.code});return r.value;},
 resetConnection:()=>page.evaluate(()=>window.probe.reset()),close:async()=>{try{await page.evaluate(()=>window.probe.close());}finally{await context.close();await browser.close();await server.close();}}};
 }catch(e){await context?.close();await browser?.close();await server.close();throw e;}
}
