import assert from 'node:assert/strict';
import {failureDiagnostic} from './failure-diagnostic.mjs';
const error={message:'secret-value',actual:{email:'private@example.com'},expected:'private-token',operator:'strictEqual',stack:'Error: secret-value\n at runCases (file:///C:/dev/project/poc/GD91-111/common-cases.mjs:25:90)\n at private@example.com (file:///C:/Users/private/account.mjs:1:1)'};
assert.deepEqual(failureDiagnostic(error),{sourceLocations:[{file:'GD91-111/common-cases.mjs',line:25,column:90}],assertionOperator:'strictEqual'});
assert.deepEqual(failureDiagnostic({}),{sourceLocations:[]});
assert.deepEqual(failureDiagnostic({operator:'private-token',stack:'secret-value'}),{sourceLocations:[]});
console.log(JSON.stringify({diagnosticCases:3,rawErrorsAndValuesExcluded:true,externalRequests:0}));
