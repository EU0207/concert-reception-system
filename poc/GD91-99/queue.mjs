import assert from 'node:assert/strict';
import {createQueue as original} from '../GD91-96/queue.mjs';
export function createQueue(options){
 const queue=original(options);
 return{...queue,acquire:async(subject,lease)=>{
  if(!await options.loadState()){
   const r=await options.user(subject,'receiptClocks/'+subject.device.uid);assert.equal(r.status,200,'receipt-clock-read-denied');
   await options.saveState({lease,queue:[],received:[],nextSequence:(r.body?.sequence??0)+1});
  }
  return queue.acquire(subject,lease);
 }};
}
