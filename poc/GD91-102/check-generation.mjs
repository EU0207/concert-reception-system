import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {addLayoutContracts} from './layout-rules.mjs';
import {addPublicationChecks} from './publication-rules.mjs';
import {addCollection} from './collection-rules.mjs';
const base=JSON.parse(fs.readFileSync(new URL('../GD91-100/database.rules.json',import.meta.url)));
const expected=addCollection(addPublicationChecks(addLayoutContracts(base)));
const actual=JSON.parse(fs.readFileSync(new URL('database.rules.json',import.meta.url)));
assert.deepEqual(actual,expected,'generated-rules-out-of-date');
console.log(JSON.stringify({generatedRulesMatchSource:true,rulesBytes:Buffer.byteLength(JSON.stringify(actual)),sha256:createHash('sha256').update(JSON.stringify(actual)).digest('hex')}));
