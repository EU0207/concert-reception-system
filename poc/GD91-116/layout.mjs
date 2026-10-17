import assert from 'node:assert/strict';
import {build as originalBuild,snapshot as originalSnapshot} from '../GD91-110/layout.mjs';
import {limits,checkCapacity} from './policy.mjs';
export async function build(send,generation,models){checkCapacity(models);return originalBuild(send,generation,models);}
export async function snapshot(read,readReception,options={}){
 if(options.maxSections!==undefined)assert(Number.isSafeInteger(options.maxSections)&&options.maxSections>0&&options.maxSections<=limits.maxSections,'layout-section-read-budget-override');
 const result=await originalSnapshot(read,readReception,{...options,maxSections:options.maxSections??limits.maxSections});
 checkCapacity(result.models);return result;
}
export async function saveBeforeRemote(models,{saveLocal,sendRemote}){await saveLocal(models);checkCapacity(models);return sendRemote(models);}
