import assert from 'node:assert/strict';
export function sdkObserver(db,path,onValue,ref){const state={seen:[],error:null},close=onValue(ref(db,path),snapshot=>state.seen.push(JSON.stringify(snapshot.val())),e=>{state.error=e.code;});return{state,close};}
export async function streamObserver(response,controller){assert.equal(response.status,200,'stream-not-authorized');const reader=response.body.getReader(),decoder=new TextDecoder(),state={seen:[],error:null};let buffer='';
  const task=(async()=>{try{for(;;){const v=await reader.read();if(v.done)break;buffer+=decoder.decode(v.value,{stream:true}).replace(/\r\n/g,'\n');let end;while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);const event=block.split('\n').find(x=>x.startsWith('event:'))?.slice(6).trim(),data=block.split('\n').find(x=>x.startsWith('data:'))?.slice(5).trim();if(['cancel','auth_revoked'].includes(event))state.error=event;else if(['put','patch'].includes(event)&&data)state.seen.push(data);}}}catch{if(!controller.signal.aborted)state.error='stream-failed';}})();
  return{state,close:async()=>{controller.abort();await task;}};
}
