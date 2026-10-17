import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {generated} from '../GD91-123/image-rules.mjs';
import {sourceHashes} from '../GD91-105/source-audit.mjs';
const root=new URL('./',import.meta.url);
const files=['compatibility.mjs','../GD91-123/image-rules.mjs','../GD91-64/tests/support.mjs',
  '../../docs/development/basic-design/file-output-report-design.md'];
const before=sourceHashes(root,files),rules=generated().rules.checks.$run.event;
const credentialRule=rules.credentials.$credential['.validate'],codeRule=rules.codes.$code['.validate'];
const credentialPattern=credentialRule.match(/\$credential\.matches\(\/(.*?)\/\)/)?.[1];
const codePattern=codeRule.match(/\$code\.matches\(\/(.*?)\/\)/)?.[1];assert(credentialPattern&&codePattern);
const old=fs.readFileSync(new URL('../GD91-64/tests/support.mjs',root),'utf8');
assert(old.includes("randomBytes(16).toString('base64url')"));
assert(old.includes("const alphabet='23456789ABCDEFGHJKMNPQRSTVWXYZ'"));
const credential=randomBytes(16).toString('base64url'),code='ABCD2345';
assert.equal(credential.length,22);assert(!new RegExp(credentialPattern).test(credential));
assert(!new RegExp(codePattern).test(code));
const after=sourceHashes(root,files);assert.deepEqual(before,after);
const result={sourceHashes:before,endSourceHashes:after,
  approvedContract:'BD-07-04; 128-bit-or-more random credential as Base64url; independent unambiguous 8-character code',
  counterexamples:[{field:'credential',oldRandomBytes:16,oldEncodedLength:22,currentRuleAccepts:false},
    {field:'confirmationCode',oldCharacters:8,containsAlphabeticCharacters:true,currentRuleAccepts:false}],
  currentRulesCompatibleWithApprovedContract:false,actualDatabaseScenarioExecuted:false,
  externalRequestsExecuted:0,methodAdoptionApproved:false,credentialValuesPersisted:false};
fs.mkdirSync(new URL('artifacts/',root),{recursive:true});
fs.writeFileSync(new URL('artifacts/compatibility-summary.json',root),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({incompatibleFields:2,externalRequestsExecuted:0,methodAdoptionApproved:false}));
