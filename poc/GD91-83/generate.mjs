import fs from 'node:fs';

// 分割間の更新後状態をRulesが照合できるかを調べる。業務Rules全体ではない。
const current = "root.child('checks').child($run)";
const allowed = `auth != null && ${current}.child('access').child(auth.uid).val() === true`;
const old = 'data', next = 'newData';
const value = (base, path) => `${base}.child('${path}').val()`;
const pathA = 'fragments/f0001/seats/s001', pathB = 'fragments/f0002/seats/s002';
const personA = 'people/a001', personB = 'people/a002';
const operation = "newData.child('operations').child(newData.child('commit/operationId').val())";
const checks = [
  "newData.hasChildren(['commit','fragments','people','view','operations','tickets'])",
  "newData.child('commit').hasChildren(['revision','operationId'])",
  `${value(next,'commit/revision')} === ${value(old,'commit/revision')} + 1`,
  "newData.child('commit/operationId').isString()",
  "!data.child('operations').child(newData.child('commit/operationId').val()).exists()",
  `${operation}.hasChildren(['kind','expectedRevision','resultRevision','beforeA','beforeB','afterA','afterB'])`,
  `${operation}.child('kind').val() === 'swap'`,
  `${operation}.child('expectedRevision').val() === ${value(old,'commit/revision')}`,
  `${operation}.child('resultRevision').val() === ${value(next,'commit/revision')}`,
  `${operation}.child('beforeA').val() === ${value(old,pathA)}`,
  `${operation}.child('beforeB').val() === ${value(old,pathB)}`,
  `${operation}.child('afterA').val() === ${value(old,pathB)}`,
  `${operation}.child('afterB').val() === ${value(old,pathA)}`,
  `${value(next,pathA)} === ${value(old,pathB)}`,
  `${value(next,pathB)} === ${value(old,pathA)}`,
  `${value(next,personA)} === (${value(next,pathA)} === 'a001' ? 's001' : 's002')`,
  `${value(next,personB)} === (${value(next,pathA)} === 'a002' ? 's001' : 's002')`,
  `${value(next,'view/s001')} === ${value(next,pathA)}`,
  `${value(next,'view/s002')} === ${value(next,pathB)}`,
];
const leaf = {'.write': `${allowed} && newData.isString()`};
const branch = {
  '.read': allowed,
  '.validate': checks.join(' && '),
  commit: {
    '.write': `${allowed} && newData.exists()`,
    revision: {'.validate': 'newData.isNumber()'},
    operationId: {'.validate': 'newData.isString()'},
    '$other': {'.validate': false},
  },
  fragments: {f0001:{seats:{s001:leaf}}, f0002:{seats:{s002:leaf}}},
  people: {a001:leaf, a002:leaf},
  view: {s001:leaf, s002:leaf},
  operations: {$operation: {
    '.write': `${allowed} && !data.exists() && newData.exists() && $operation === newData.parent().parent().child('commit/operationId').val()`,
    kind: {'.validate': "newData.val() === 'swap'"},
    expectedRevision: {'.validate': 'newData.isNumber()'},
    resultRevision: {'.validate': 'newData.isNumber()'},
    beforeA: {'.validate': "newData.val() === 'a001' || newData.val() === 'a002'"},
    beforeB: {'.validate': "newData.val() === 'a001' || newData.val() === 'a002'"},
    afterA: {'.validate': "newData.val() === 'a001' || newData.val() === 'a002'"},
    afterB: {'.validate': "newData.val() === 'a001' || newData.val() === 'a002'"},
    '$other': {'.validate': false},
  }},
};
const rules = {rules: {'.read': false, '.write': false, checks: {$run: {event: branch}}}};
fs.writeFileSync(new URL('database.rules.json',import.meta.url),JSON.stringify(rules,null,2)+'\n');
fs.writeFileSync(new URL('deny.rules.json',import.meta.url),JSON.stringify({rules:{'.read':false,'.write':false}},null,2)+'\n');
console.log(JSON.stringify({candidate:'GD91-83',wholeEventWriteGranted:false,clientTicketWrites:false}));
