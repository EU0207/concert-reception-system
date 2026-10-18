import fs from 'node:fs';import assert from 'node:assert/strict';
export function buildRules(){
 const old=fs.readFileSync(new URL('../GD91-136/firestore.rules',import.meta.url),'utf8').replace(/\r\n/g,'\n');
 const boundary=old.indexOf('    match /archiveShows/{p}/state/current');assert(boundary>0);
 const auth=old.slice(0,boundary).replaceAll('archiveShows','centerShows').replaceAll('archiveDevices','centerDevices');
 return auth+fs.readFileSync(new URL('business.rules',import.meta.url),'utf8').replace(/\r\n/g,'\n');
}
if(process.argv[1]?.endsWith('generate.mjs')){fs.mkdirSync(new URL('node_modules/.cache/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('node_modules/.cache/firestore.rules',import.meta.url),buildRules());}
