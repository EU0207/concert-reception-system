import {initializeApp,deleteApp} from 'firebase/app';
import {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInAnonymously} from 'firebase/auth';
import {initializeFirestore,connectFirestoreEmulator,getDocFromServer,doc,terminate,setLogLevel,disableNetwork,enableNetwork} from 'firebase/firestore';
setLogLevel('silent');
const app=initializeApp({projectId:'demo-concert-center-gd91-140',apiKey:'demo-api-key',appId:'demo-sdk'});
const auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,'http://127.0.0.1:9494',{disableWarnings:true});
const db=initializeFirestore(app,{experimentalForceLongPolling:true});connectFirestoreEmulator(db,'127.0.0.1',8384);
window.probe={ready:async()=>{const user=(await signInAnonymously(auth)).user;return{uid:user.uid,token:await user.getIdToken()};},
 read:async path=>{try{const s=await getDocFromServer(doc(db,path));return{ok:true,value:s.exists()?s.data():null};}catch(e){return{ok:false,code:e.code};}},
 reset:async()=>{await disableNetwork(db);await enableNetwork(db);},close:async()=>{await terminate(db);await deleteApp(app);}};
