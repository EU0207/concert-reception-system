import assert from 'node:assert/strict';

// 固定の相対パスに限り child('a').child('b') と child('a/b') を同値正規化する。
function literalCall(source, index) {
  const match = source.slice(index).match(/^\.child\((['"])([A-Za-z0-9_/-]+)\1\)/);
  if (!match || match[2].split('/').some(part => !part)) return null;
  return {length: match[0].length, parts: match[2].split('/')};
}
export function pathExpression(source, expand = false) {
  let result = '', quote = null, regex = false, escape = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (escape) {result += c; escape = false; continue;}
    if (c === '\\' && (quote || regex)) {result += c; escape = true; continue;}
    if (quote) {result += c; if (c === quote) quote = null; continue;}
    if (regex) {result += c; if (c === '/') regex = false; continue;}
    if (c === "'" || c === '"') {quote = c; result += c; continue;}
    if (c === '/' && source.slice(Math.max(0, i - 9), i) === '.matches(') {regex = true; result += c; continue;}
    const first = c === '.' ? literalCall(source, i) : null;
    if (!first) {result += c; continue;}
    const parts = [...first.parts]; let length = first.length;
    if (!expand) for (;;) {const next = literalCall(source, i + length); if (!next) break; parts.push(...next.parts); length += next.length;}
    result += expand ? parts.map(part => ".child('" + part + "')").join('') : ".child('" + parts.join('/') + "')";
    i += length - 1;
  }
  assert(!quote && !regex && !escape, 'unterminated-rule-literal');
  return result;
}
export function pathTree(node, expand = false) {
  return Object.fromEntries(Object.entries(node).map(([key, value]) => [key,
    value && typeof value === 'object' ? pathTree(value, expand) : typeof value === 'string' ? pathExpression(value, expand) : value]));
}
export function compactPaths(rules) {
  const result = pathTree(rules);
  assert.deepEqual(pathTree(result, true), pathTree(rules, true), 'constant-child-path-normalization-mismatch');
  return {rules: result, stats: {constantChildPathNormalizationMatched: true,
    beforePathBytes: Buffer.byteLength(JSON.stringify(rules)), afterPathBytes: Buffer.byteLength(JSON.stringify(result))}};
}
