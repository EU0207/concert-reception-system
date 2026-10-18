import {initializeApp,deleteApp} from '../POC-004/node_modules/firebase/app/dist/esm/index.esm.js';
import {initializeAuth,inMemoryPersistence,connectAuthEmulator,signInAnonymously} from '../POC-004/node_modules/firebase/auth/dist/esm/index.esm.js';
import {getDatabase,connectDatabaseEmulator,get,ref,update,goOffline} from '../POC-004/node_modules/firebase/database/dist/esm/index.esm.js';
import {getFirestore,connectFirestoreEmulator,getDocFromServer,doc,disableNetwork,terminate} from '../POC-004/node_modules/firebase/firestore/dist/esm/index.esm.js';
import './node_modules/.cache/storage.mjs';
let oldApp,newApp,oldDb,newDb,oldReads=0,newReads=0,writes=0;
const config={projectId:'demo-concert-seat-gd91-60',apiKey:'demo-api-key',databaseURL:'https://demo-concert-seat-gd91-60-default-rtdb.firebaseio.com'};
async function actor(name){const app=initializeApp(config,name),auth=initializeAuth(app,{persistence:inMemoryPersistence});connectAuthEmulator(auth,'http://127.0.0.1:9291',{disableWarnings:true});
 const user=(await signInAnonymously(auth)).user;return{app,device:{uid:user.uid,token:await user.getIdToken()}};}
async function old(){const result=await actor('old');oldApp=result.app;oldDb=getFirestore(oldApp);connectFirestoreEmulator(oldDb,'127.0.0.1',8181);return result.device;}
async function prepareNext(){const result=await actor('next');newApp=result.app;newDb=getDatabase(newApp);connectDatabaseEmulator(newDb,'127.0.0.1',9100);return result.device;}
async function next(){const state=await window.migration.inspect();if(state.config.adapter!=='rtdb'||!state.config.requiresReview||!newDb)throw Error('adapter-not-selected');return{selected:true};}
async function readOld(path){oldReads++;return(await getDocFromServer(doc(oldDb,path))).data();}
async function fenceOld(path){let denied=false;try{await readOld(path);}catch(e){denied=e.code==='permission-denied';}if(!denied)throw Error('old-sdk-not-denied');await disableNetwork(oldDb);return{denied:true};}
async function readNew(path){newReads++;return(await get(ref(newDb,path))).val();}
async function write(path,body){const state=await window.migration.inspect();if(state.config.adapter!=='rtdb'||!state.config.newIdentityPrepared)throw Error('adapter-not-ready');
 writes++;await update(ref(newDb,path),body);return readNew(path+'/operations/'+body.commit.operationId);}
async function close(){if(oldDb)await terminate(oldDb);if(newDb)goOffline(newDb);for(const app of[oldApp,newApp])if(app)await deleteApp(app);}
window.sdkSwitch={old,prepareNext,next,readOld,fenceOld,readNew,write,close,stats:()=>({oldReads,newReads,writes})};
