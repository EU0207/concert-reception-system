import assert from 'node:assert/strict';

// TECH-DD91-101。公演の構成全体で使う検証用の共通予算。
export const capacityPolicy=Object.freeze({maxCells:4096,slotsPerPart:16});
export const maxParts=Math.ceil(capacityPolicy.maxCells/capacityPolicy.slotsPerPart);
// 各区画は最低1セルなので、区画数も総セル数を越えない。
export const maxSections=capacityPolicy.maxCells;
export function checkCapacity(sections){
 assert(Array.isArray(sections)&&sections.length>0,'layout-sections-required');let total=0;
 for(const value of sections){const s=value.section??value;assert(Number.isSafeInteger(s.rows)&&s.rows>0&&Number.isSafeInteger(s.columns)&&s.columns>0,'layout-invalid-dimensions');const cells=s.rows*s.columns;assert(Number.isSafeInteger(cells),'layout-invalid-cell-count');total+=cells;assert(Number.isSafeInteger(total)&&total<=capacityPolicy.maxCells,'layout-total-cell-limit');}
 return{cells:total,parts:Math.ceil(total/capacityPolicy.slotsPerPart),sections:sections.length};
}
