import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';import {users} from './client.mjs';
const require=createRequire(new URL('../POC-004/package.json',import.meta.url));
const {initializeApp,deleteApp}=require('firebase/app');
const {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInAnonymously}=require('firebase/auth');
const {initializeFirestore,connectFirestoreEmulator,getDocFromServer,doc,terminate,setLogLevel,disableNetwork,enableNetwork}=require('firebase/firestore');
setLogLevel('silent');
export async function client(){
 const app=initializeApp({projectId:'demo-concert-center-gd91-140',apiKey:'demo-api-key',appId:'demo-sdk'},randomUUID());
 const auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,'http://127.0.0.1:9494',{disableWarnings:true});
 const user=(await signInAnonymously(auth)).user,actor={uid:user.uid,token:await user.getIdToken()};users.push(actor);
 const db=initializeFirestore(app,{experimentalForceLongPolling:true});connectFirestoreEmulator(db,'127.0.0.1',8384);
 return{actor,read:async path=>{const s=await getDocFromServer(doc(db,path));return s.exists()?s.data():null;},resetConnection:async()=>{await disableNetwork(db);await enableNetwork(db);},close:async()=>{await terminate(db);await deleteApp(app);}};
}
