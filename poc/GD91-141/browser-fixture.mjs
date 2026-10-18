import {initializeApp,deleteApp} from 'firebase/app';
import {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInAnonymously} from 'firebase/auth';
const app=initializeApp({projectId:'demo-concert-center-gd91-141',apiKey:'demo-api-key',appId:'demo-sdk'});
const auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,'http://127.0.0.1:9495',{disableWarnings:true});
let token;
window.probe={ready:async()=>{const user=(await signInAnonymously(auth)).user;token=await user.getIdToken();return{uid:user.uid,token};},
 send:async({url,method,value})=>{const parsed=new URL(url);if(parsed.hostname!=='127.0.0.1'||parsed.port!=='8385')throw Error('external-request-blocked');
 const text=value===undefined?undefined:JSON.stringify(value),r=await fetch(url,{method,headers:{'content-type':'application/json',authorization:'Bearer '+token},...(text?{body:text}:{}),signal:AbortSignal.timeout(30000)}),response=await r.text();
 return{status:r.status,body:response?JSON.parse(response):null,requestBytes:text?new TextEncoder().encode(text).length:0,responseBytes:new TextEncoder().encode(response).length};},
 close:()=>deleteApp(app)};
