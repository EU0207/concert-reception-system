import fs from 'node:fs';import assert from 'node:assert/strict';
const root=new URL('./',import.meta.url);let source=fs.readFileSync(new URL('regression.mjs',root),'utf8');
const old='of scopes){';assert(source.includes(old));source=source.replace(old,'of scopes.slice(15)){')
 .replace("'regression.mjs','run-local.mjs'","'resume-regression.mjs','prepare-resume.mjs','resume-bootstrap.mjs','run-resume.mjs','regression.mjs','run-local.mjs'")
 .replace("existingGroups:216,readBudgetComparisons:4","remainingGroups:33,readBudgetComparisons:4");
fs.writeFileSync(new URL('resume-regression.mjs',root),source);
