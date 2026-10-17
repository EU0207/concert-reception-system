import assert from 'node:assert/strict';
import {capacityPolicy,checkCapacity as cellCapacity} from '../GD91-110/capacity-policy.mjs';
export const limits=Object.freeze({maxCells:capacityPolicy.maxCells,maxSections:16,maxNumberingLines:256});
export function checkCapacity(models){
 const capacity=cellCapacity(models);assert(capacity.sections<=limits.maxSections,'layout-section-limit');
 for(const model of models){
  const s=model.section??model;assert(['horizontal','vertical'].includes(s.axis),'layout-axis-required');
  const lines=s.axis==='horizontal'?s.rows:s.columns;
  assert(lines<=limits.maxNumberingLines,'layout-numbering-line-limit');
 }
 return capacity;
}
