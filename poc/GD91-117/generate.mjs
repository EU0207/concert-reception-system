import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../GD91-115/emulator-maintenance.mjs',import.meta.url),'utf8');
const original="JSON.parse(fs.readFileSync(new URL('../GD91-113/database.rules.json',import.meta.url)))";
assert.equal(source.split(original).length,2);
fs.writeFileSync(new URL('emulator-maintenance.mjs',import.meta.url),"import {generated} from '../GD91-116/generate.mjs';\n"+source.replace(original,'generated()'));
