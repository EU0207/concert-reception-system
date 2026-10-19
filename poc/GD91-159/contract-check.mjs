import fs from 'node:fs';
import assert from 'node:assert/strict';
import {generated as previous} from '../GD91-155/rules.mjs';
import {generated} from './rules.mjs';
import {expression, renameVariables} from './variables.mjs';
import {pathExpression, pathTree} from './paths.mjs';
import {sourceHashes} from '../GD91-105/source-audit.mjs';

const root = new URL('./', import.meta.url), before = sourceHashes(root, ['contract-check.mjs']);
const old = previous(), fresh = generated();
const expanded = renameVariables(fresh, Object.fromEntries(Object.entries(fresh.__protectionCounts.variableNames).map(([from, to]) => [to, from]))).rules;
const oldRun = pathTree(old, true).rules.environments.$env.performances.$run, newRun = pathTree(expanded, true).rules.environments.$env.performances.$run;
const excluded = new Set(['roles', 'devices', 'sessions']);
let protectedReads = 0, protectedWrites = 0, unchangedDenials = 0;
function compare(oldNode, newNode) {
  for (const [key, value] of Object.entries(oldNode)) {
    assert(Object.hasOwn(newNode, key), 'old-rule-path-missing');
    if (value && typeof value === 'object') compare(value, newNode[key]);
    else if (['.read', '.write'].includes(key)) {
      if (value === false || value === 'false') {assert.equal(newNode[key], value); unchangedDenials++;}
      else {
        assert.equal(typeof value, 'string');
        assert(newNode[key].endsWith('&&(' + value + ')'), 'old-permission-not-preserved-as-conjunct');
        if (key === '.read') protectedReads++; else protectedWrites++;
      }
    }
  }
}
for (const [key, value] of Object.entries(oldRun)) {
  if (excluded.has(key)) assert.deepEqual(newRun[key], value, 'identity-rules-changed:' + key);
  else if (value && typeof value === 'object') compare(value, newRun[key]);
}
assert.equal(protectedReads, fresh.__protectionCounts.readCount);
assert.equal(protectedWrites, fresh.__protectionCounts.writeCount);
assert.equal(newRun.restoreBinding['.write'], false);
assert.equal(newRun['.write'], oldRun['.write']);
assert(!Object.hasOwn(expanded.rules.restoreAuthorities.$run, '$other') || expanded.rules.restoreAuthorities.$run.$other['.validate'] === false);

const names = {'$env': '$e', '$run': '$r'};
const examples = [
  ["root.child('$env').child($env).child($environment).val() === '$run'", "root.child('$env').child($e).child($environment).val() === '$run'"],
  ["$run.matches(/^[a-z$run]+$/) && $env === 'literal'", "$r.matches(/^[a-z$run]+$/) && $e === 'literal'"],
  [String.raw`$run === 'escaped\' $env' && $env === "$run"`, String.raw`$r === 'escaped\' $env' && $e === "$run"`],
  ["$runId === $run && $env2 === $env", "$runId === $r && $env2 === $e"]
];
for (const [source, wanted] of examples) assert.equal(expression(source, names), wanted);
assert.throws(() => renameVariables({$env: {'.read': '$env === $e'}}, names), /roundtrip/);
assert.throws(() => renameVariables({$env: {}, $e: {}}, names), /collision/);
assert.throws(() => expression("'unterminated", names), /unterminated/);
const pathExamples = [
  ["root.child('a').child('b')", "root.child('a/b')"],
  ["root.child('a/b').child('c').child('d/e')", "root.child('a/b/c/d/e')"],
  ["root.child('a').child($key).child('b')", "root.child('a').child($key).child('b')"],
  ["root.child('/a').child('b')", "root.child('/a').child('b')"],
  ["root.child('a//b').child('c')", "root.child('a//b').child('c')"],
  ["data.val() === '.child(\"a\").child(\"b\")'", "data.val() === '.child(\"a\").child(\"b\")'"],
  ["$key.matches(/.child('a').child('b')/)", "$key.matches(/.child('a').child('b')/)"]
];
for (const [source, wanted] of pathExamples) assert.equal(pathExpression(source), wanted);
assert.deepEqual(before, sourceHashes(root, ['contract-check.mjs']));
fs.mkdirSync(new URL('artifacts/', root), {recursive: true});
fs.writeFileSync(new URL('artifacts/contract-summary.json', root), JSON.stringify({sourceHashes: before, endSourceHashes: before,
  protectedReads, protectedWrites, unchangedDenials, identityRulesUnchanged: true, oldPermissionsPreservedAsConjuncts: true,
  variableLiteralChecks: examples.length, variableRejectedInputs: 3, exactVariableInverseMatched: true,
  constantPathChecks: pathExamples.length, constantChildPathNormalizationMatched: true,
  physicalNamespaceHierarchyUnchanged: true, generatedBytes: Buffer.byteLength(JSON.stringify(fresh)),
  externalFirebaseConnected: false, productionImplementation: false}, null, 2) + '\n');
console.log(JSON.stringify({protectedReads, protectedWrites, unchangedDenials, variableChecks: 7}));
