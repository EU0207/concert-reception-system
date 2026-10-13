import {initializeApp,deleteApp} from '../POC-004/node_modules/firebase/app/dist/esm/index.esm.js';
import {initializeAuth,inMemoryPersistence,browserPopupRedirectResolver,GoogleAuthProvider,signInWithPopup,signOut} from '../POC-004/node_modules/firebase/auth/dist/esm/index.esm.js';
const button=document.querySelector('#login'),status=document.querySelector('#status');
button.addEventListener('click',async()=>{button.disabled=true;let app,auth;
  try{const start=await fetch('/__gd86/begin',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});if(!start.ok)throw new Error('login-attempt-unavailable');
    const config=await fetch('/__gd86/config').then(r=>{if(!r.ok)throw new Error('configuration-unavailable');return r.json();});
    app=initializeApp(config);auth=initializeAuth(app,{persistence:inMemoryPersistence,popupRedirectResolver:browserPopupRedirectResolver});
    const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});status.textContent='Googleの画面でアカウントを選択してください。';
    const result=await signInWithPopup(auth,provider),token=await result.user.getIdToken();
    const accepted=await fetch('/__gd86/token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token})});if(!accepted.ok)throw new Error('login-receipt-failed');
    status.textContent='ログインを受領しました。検証が終了するまでこの画面を開いておいてください。';
  }catch{status.textContent='ログインを完了できませんでした。この画面のままチャットでお知らせください。';}
  finally{if(auth)await signOut(auth).catch(()=>{});if(app)await deleteApp(app).catch(()=>{});}
});
