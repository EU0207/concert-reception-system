import fs from 'node:fs';import assert from 'node:assert/strict';import {buildRules} from '../GD91-139/generate.mjs';
export function rules(mode){assert(['center','archive'].includes(mode));return mode==='center'?buildRules():fs.readFileSync(new URL('../GD91-136/firestore.rules',import.meta.url),'utf8').replace(/\r\n/g,'\n');}
