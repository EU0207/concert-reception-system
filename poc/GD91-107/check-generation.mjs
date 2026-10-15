import fs from 'node:fs';import assert from 'node:assert/strict';import {generated} from './generate.mjs';
assert.deepEqual(JSON.parse(fs.readFileSync(new URL('database.rules.json',import.meta.url))),generated());console.log(JSON.stringify({generatedRulesMatchSource:true}));
