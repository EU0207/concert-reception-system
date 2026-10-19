import assert from 'node:assert/strict';

// 引用文字列・正規表現・保存パスを変えず、Rulesの束縛変数だけを置換する。
export function expression(source, names) {
  let result = '', quote = null, regex = false, escape = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (escape) {result += c; escape = false; continue;}
    if (c === '\\' && (quote || regex)) {result += c; escape = true; continue;}
    if (quote) {result += c; if (c === quote) quote = null; continue;}
    if (regex) {result += c; if (c === '/') regex = false; continue;}
    if (c === "'" || c === '"') {quote = c; result += c; continue;}
    if (c === '/' && source.slice(Math.max(0, i - 9), i) === '.matches(') {regex = true; result += c; continue;}
    if (c === '$') {
      const token = source.slice(i).match(/^\$[A-Za-z_][A-Za-z_0-9]*/)?.[0];
      if (token) {result += names[token] ?? token; i += token.length - 1; continue;}
    }
    result += c;
  }
  assert(!quote && !regex && !escape, 'unterminated-rule-literal');
  return result;
}

export function variableNames(input) {
  const variables = new Set();
  function visit(node) {for (const [key, value] of Object.entries(node)) {if (key.startsWith('$')) variables.add(key); if (value && typeof value === 'object') visit(value);}}
  visit(input);
  return Object.fromEntries([...variables].sort().map((key, i) => [key, '$' + String.fromCharCode(97 + i % 26) + (i < 26 ? '' : Math.floor(i / 26))]));
}

export function renameVariables(input, names = variableNames(input)) {
  const reverse = Object.fromEntries(Object.entries(names).map(([from, to]) => [to, from]));
  assert.equal(Object.keys(reverse).length, Object.keys(names).length, 'duplicate-variable-target');
  let expressions = 0, bindings = 0;
  function walk(node) {
    const result = {};
    for (const [key, value] of Object.entries(node)) {
      const newKey = names[key] ?? key;
      assert(!Object.hasOwn(result, newKey), 'variable-key-collision');
      if (newKey !== key) bindings++;
      if (value && typeof value === 'object') result[newKey] = walk(value);
      else if (typeof value === 'string') {
        result[newKey] = expression(value, names);
        assert.equal(expression(result[newKey], reverse), value, 'variable-expression-roundtrip');
        expressions++;
      } else result[newKey] = value;
    }
    return result;
  }
  const rules = walk(input);
  function inverse(node) {
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [reverse[key] ?? key,
      value && typeof value === 'object' ? inverse(value) : typeof value === 'string' ? expression(value, reverse) : value]));
  }
  assert.deepEqual(inverse(rules), input, 'whole-rule-variable-roundtrip');
  return {rules, stats: {expressions, bindings, variableNames: names, exactInverseMatched: true,
    beforeBytes: Buffer.byteLength(JSON.stringify(input)), afterBytes: Buffer.byteLength(JSON.stringify(rules))}};
}
