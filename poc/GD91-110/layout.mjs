import assert from 'node:assert/strict';import {build as originalBuild} from '../GD91-104/geometry.mjs';import {snapshot as originalSnapshot} from '../GD91-105/snapshot.mjs';import {slotsPerPart} from '../GD91-102/layout-model.mjs';
import {capacityPolicy,maxParts,maxSections,checkCapacity} from './capacity-policy.mjs';
assert.equal(slotsPerPart,capacityPolicy.slotsPerPart,'physical-part-policy-mismatch');
export async function build(send,generation,models){checkCapacity(models);return originalBuild(send,generation,models);}
export async function snapshot(read,readReception,options={}){
 for(const[key,limit]of[['maxParts',maxParts],['maxSections',maxSections]])if(options[key]!==undefined)assert(Number.isSafeInteger(options[key])&&options[key]>0&&options[key]<=limit,'layout-read-budget-override');
 const result=await originalSnapshot(read,readReception,{...options,maxParts:options.maxParts??maxParts,maxSections:options.maxSections??maxSections});checkCapacity(result.models);return result;
}
// 下書き保存は共通予算を越えた入力も保持し、外部への送信だけを止める。
export async function saveBeforeRemote(models,{saveLocal,sendRemote}){await saveLocal(models);checkCapacity(models);return sendRemote(models);}
