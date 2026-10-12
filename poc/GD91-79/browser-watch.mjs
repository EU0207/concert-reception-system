import {initializeApp,deleteApp} from '../POC-001/node_modules/firebase/app/dist/esm/index.esm.js';
import {initializeFirestore,connectFirestoreEmulator,collection,query,orderBy,limit,onSnapshot,terminate,setLogLevel} from '../POC-001/node_modules/firebase/firestore/dist/index.mjs';
setLogLevel('silent');
let sdk,stop,statistics;
window.diagnostic={
  start:async({show,token,forceLongPolling})=>{
    if(location.hostname!=='127.0.0.1')throw new Error('localhost-only');
    const app=initializeApp({projectId:'demo-concert-seat-gd91-60',apiKey:'demo-api-key',appId:'demo-browser'},crypto.randomUUID());
    const db=initializeFirestore(app,forceLongPolling?{experimentalForceLongPolling:true}:{});connectFirestoreEmulator(db,'127.0.0.1',8181,{mockUserToken:token});sdk={app,db};
    statistics={callbacks:0,confirmed:0,cache:0,pending:0,error:null};
    const q=query(collection(db,'publicationShows',show,'receiptEvents'),orderBy('receivedAt'),limit(2048));
    await new Promise((resolve,reject)=>{stop=onSnapshot(q,{includeMetadataChanges:true},s=>{
      statistics.callbacks++;if(s.metadata.fromCache)statistics.cache++;if(s.metadata.hasPendingWrites)statistics.pending++;
      if(!s.metadata.fromCache&&!s.metadata.hasPendingWrites){statistics.confirmed=s.size;resolve();}
    },e=>{statistics.error=e.code;reject(e);});});
  },
  state:()=>statistics,
  close:async()=>{stop?.();await terminate(sdk.db);await deleteApp(sdk.app);},
};
