import fs from 'node:fs';import {generated as base} from '../GD91-110/generate.mjs';import {addRegistry} from './registry-rules.mjs';
export const generated=()=>addRegistry(base());
if(process.argv[1]?.replaceAll('\\','/').endsWith('/GD91-111/generate.mjs')){fs.writeFileSync(new URL('database.rules.json',import.meta.url),JSON.stringify(generated(),null,2)+'\n');for(const f of ['deny.rules.json','firebase.json'])fs.copyFileSync(new URL('../GD91-110/'+f,import.meta.url),new URL(f,import.meta.url));}
