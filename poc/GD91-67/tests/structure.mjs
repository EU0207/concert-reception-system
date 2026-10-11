import {randomUUID} from 'node:crypto';
import {createSection, numberInitial} from '../../GD91-07/planner.mjs';
import {issueCatalog, doc} from '../../GD91-60/tests/support.mjs';
import {complete, put, binding} from '../../GD91-60/tests/global-support.mjs';
import {finish} from '../../GD91-60/tests/candidate-support.mjs';
import {version, seed, ok} from '../../GD91-65/tests/support.mjs';

export async function prepareFirst(f, {unusable = false} = {}) {
  const raw = createSection({name: '架空初回区画', rows: 1, columns: 4, axis: 'horizontal', seatOrder: 'forward', lines: [{name: 'A'}]}, {maxCells: 10000});
  const model = numberInitial(raw, Object.fromEntries(raw.section.cells.map(c => [c.row + ',' + c.column, 'seat'])), {maxCells: 10000});
  if (unusable) model.seats[3].usable = false;
  f.section = model.section.sectionId; f.old = {environmentId: 'FAKE-environment', performanceId: f.show, generation: '', model};
  f.next = {...f.old, generation: randomUUID()}; f.seats = model.seats.map(s => s.seatId); const s = model.section, v = await version(f);
  f.head = {environmentId: 'FAKE-environment', performanceId: f.show, sectionId: f.section, generation: f.next.generation, baseGeneration: '', status: 'building', controlRevision: v.values.control,
    rows: s.rows, columns: s.columns, axis: s.axis, seatOrder: s.seatOrder, lines: s.lineSettings, comparisonPlan: 'seatId', protectionRevision: v.values.ticket, expectedVersions: v.values};
  // 構成入力head・制御は前提投入。片・証明と完成候補は通常要求で生成する。
  await seed(doc(f, 'head/current'), f.head);
  await seed('sourceProofShows/' + f.show + '/control/current', {revision: v.values.control, activeGeneration: f.next.generation, publishedGeneration: '', phase: 'preparing'});
  await issueCatalog(f); await complete(f);
  ok(await put(f, 'comparisonResult/current', {...binding(f), operationId: f.next.generation, proofPlan: 'GD91-57', changedSeatIds: [], protectionRevision: v.values.ticket, seats: f.seats.length}, false));
  f.candidate = await finish(f); return f;
}
