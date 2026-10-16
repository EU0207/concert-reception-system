import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {capacityPolicy,maxSections,checkCapacity} from '../GD91-110/capacity-policy.mjs';
import {generated} from '../GD91-113/generate.mjs';
const beyondMeasuredSections=checkCapacity(Array.from({length:17},()=>({rows:1,columns:1})));
const beyondMeasuredLines=checkCapacity([{rows:257,columns:1}]);
assert.equal(beyondMeasuredSections.sections,17);assert.equal(beyondMeasuredLines.cells,257);
const rules=generated().rules.checks.$run.generations.$generation['.validate'];
assert(rules.includes("child('meta/expectedSections').val() <= "+maxSections));
const paths=['input-review.mjs','../GD91-110/capacity-policy.mjs','../GD91-110/generate.mjs','../GD91-102/layout-rules.mjs','../GD91-109/artifacts/shape-summary.json'];
const sourceHashes=Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(fs.readFileSync(new URL(p,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
const report={sourceHashes,endSourceHashes:sourceHashes,sharedCellLimit:capacityPolicy.maxCells,currentReadAndDeclaredSectionBudget:maxSections,
 measuredSectionCandidate:16,measuredLinesInOneSectionCandidate:256,plannerAllows17Sections:true,plannerAllows257LinesShape:true,
 interpretation:'Planner and declared Rules budget inspection only; not a normal server acceptance test.',
 proposedInitialProductLimits:{sections:16,numberingLinesPerSection:256},proposalApproved:false,limitsApplied:false,
 collectionRequestModel:{formula:'6 + 2 * expectedParts + 4 * expectedSections',fullyPopulatedParts:256,at16Sections:582,atCurrent4096SectionBudget:16902,actualBillingMeasurement:false},
 externalFirebaseConnected:false,productionImplementation:false,tested3000:false};
fs.writeFileSync(new URL('artifacts/input-review-summary.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({currentSectionBudget:maxSections,measuredSectionCandidate:16,measuredLinesCandidate:256,productLimitsDecisionRequired:true,limitsApplied:false}));
