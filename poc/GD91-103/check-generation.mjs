import fs from 'node:fs';import assert from 'node:assert/strict';import {addGroups} from './group-rules.mjs';
assert.deepEqual(JSON.parse(fs.readFileSync(new URL('database.rules.json',import.meta.url))),addGroups(JSON.parse(fs.readFileSync(new URL('../GD91-102/database.rules.json',import.meta.url)))));console.log(JSON.stringify({generatedRulesMatchSource:true}));
