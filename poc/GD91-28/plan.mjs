import { isDeepStrictEqual } from 'node:util';
import { validate } from '../GD91-07/planner.mjs';
import { slide } from '../GD91-08/slide.mjs';
import { project } from '../GD91-10/projection.mjs';

// 隔離検証の計算契約。最新状態の取得・認可とサーバーでの再検査は対象外。
const versionKeys = ['commit','layout','source','assignment','attendee','ticket','control'];
const commandKeys = ['operationId','kind','environmentId','performanceId','expectedGeneration','expectedVersions','direction','amount'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export class PlanError extends Error { constructor(code) { super(code); this.code=code; } }
const requireValue=(ok,code)=>{ if(!ok) throw new PlanError(code); };
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const keys=(v,allowed)=>object(v)&&isDeepStrictEqual(Object.keys(v).sort(),[...allowed].sort());
function versions(v) {
  requireValue(keys(v,versionKeys)&&Object.values(v).every(n=>Number.isSafeInteger(n)&&n>0),'INVALID_VERSIONS');
}
function canonical(model) {
  const result=structuredClone(model);
  for(const [list,key] of [[result.section?.cells,'cellId'],[result.section?.lineSettings,'lineId'],[result.seats,'seatId'],[result.assignments,'attendeeId'],[result.ticketRefs,'ticketId'],[result.receptionRefs,'receptionId']]){
    requireValue(Array.isArray(list)&&list.every(v=>object(v)&&typeof v[key]==='string'&&v[key].length>0)&&new Set(list.map(v=>v[key])).size===list.length,'INCOMPLETE_MODEL');
    list.sort((a,b)=>a[key].localeCompare(b[key]));
  }
  return result;
}
export function planSlide(snapshot, command, proposed, context) {
  requireValue(keys(command,commandKeys)&&uuid.test(command.operationId),'INVALID_COMMAND');
  requireValue(command.kind==='slide','UNSUPPORTED_OPERATION');
  requireValue(object(snapshot)&&snapshot.schemaVersion===3,'UNSUPPORTED_SNAPSHOT');
  requireValue(typeof snapshot.environmentId==='string'&&snapshot.environmentId.trim()!==''&&typeof snapshot.performanceId==='string'&&snapshot.performanceId.trim()!==''&&uuid.test(snapshot.generation),'INCOMPLETE_SNAPSHOT');
  versions(snapshot.versions);versions(command.expectedVersions);
  requireValue(command.environmentId===snapshot.environmentId&&command.performanceId===snapshot.performanceId,'WRONG_SCOPE');
  requireValue(command.expectedGeneration===snapshot.generation&&isDeepStrictEqual(command.expectedVersions,snapshot.versions),'STALE_BASE');
  requireValue(object(snapshot.head)&&snapshot.head.revision===snapshot.versions.layout&&snapshot.head.sourceRevision===snapshot.versions.source,'INCONSISTENT_SNAPSHOT');
  canonical(snapshot.source);canonical(proposed);
  let before, expected;
  try {
    validate(snapshot.source,context);before=project(snapshot.source,snapshot.head,context);
    expected=slide(before,{direction:command.direction,amount:command.amount},context);validate(proposed,context);
  } catch { throw new PlanError('INVALID_LAYOUT_OR_SLIDE'); }
  requireValue(isDeepStrictEqual(canonical(proposed),canonical(expected.after)),'UNEXPECTED_CHANGE');
  const changed=expected.change.changed;
  return {
    operationId:command.operationId,kind:'slide',route:changed?'offsetUpdate':'noChange',
    environmentId:snapshot.environmentId,performanceId:snapshot.performanceId,generation:snapshot.generation,
    expectedVersions:structuredClone(snapshot.versions),
    rowOffset:changed?(snapshot.head.rowOffset+expected.change.rowDelta+snapshot.head.rows)%snapshot.head.rows:snapshot.head.rowOffset,
    columnOffset:changed?(snapshot.head.columnOffset+expected.change.columnDelta+snapshot.head.columns)%snapshot.head.columns:snapshot.head.columnOffset
  };
}
