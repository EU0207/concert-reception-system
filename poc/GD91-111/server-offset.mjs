// .infoは通常のGETではなく、SDKの接続情報の通知から読む。
export async function serverOffset(db,{ref,onValue,onSubscribe=()=>{}}){
 async function observe(path,accept){
  return new Promise((resolve,reject)=>{
   let stop=()=>{};
   const timer=setTimeout(()=>{stop();reject(new Error('server-info-timeout'));},15000);
   onSubscribe();stop=onValue(ref(db,path),snapshot=>{
    const value=snapshot.val();if(!accept(value))return;
    clearTimeout(timer);stop();resolve(value);
   },error=>{clearTimeout(timer);stop();reject(error);});
  });
 }
 await observe('.info/connected',value=>value===true);
 return observe('.info/serverTimeOffset',Number.isFinite);
}
