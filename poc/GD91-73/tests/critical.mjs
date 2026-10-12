import './transport-hook.mjs';
import * as t from '../../GD91-72/tests/support.mjs';
import fs from 'node:fs';import {createHash} from 'node:crypto';
const sources=['../generate.mjs','../index.rules','../node_modules/.cache/firestore.rules','transport-hook.mjs','critical.mjs'];
const hashes=()=>Object.fromEntries(sources.map(p=>[p,createHash('sha256').update(fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
const sourceHashes=hashes();
try {
const f=await t.fixture(),p=await t.register(f),q=await t.register(f);
await t.apply(f,await t.assignment(f,'assign',{attendeeId:p.attendeeId}));
await t.apply(f,await t.assignment(f,'assign',{seat1:f.seats[1],attendeeId:q.attendeeId}));
await t.apply(f,await t.ticketPlan(f,p.attendeeId));
await t.apply(f,await t.assignment(f,'move',{seat2:f.seats[2],reason:'架空：席の調整'}));
await t.apply(f,await t.assignment(f,'swap',{seat1:f.seats[2],seat2:f.seats[1]}));
console.log(JSON.stringify({protectedMove:true,protectedSwap:true}));
fs.mkdirSync(new URL('../artifacts/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../artifacts/critical.json',import.meta.url),JSON.stringify({sourceHashes,endSourceHashes:hashes(),protectedMove:true,protectedSwap:true},null,2)+'\n');
}catch(error){fs.mkdirSync(new URL('../artifacts/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../artifacts/failed-critical-'+Date.now()+'.json',import.meta.url),JSON.stringify({sourceHashes,endSourceHashes:hashes(),error:{message:String(error),stack:error.stack}},null,2)+'\n');throw error;}
