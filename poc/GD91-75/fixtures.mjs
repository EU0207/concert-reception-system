// 読取経路専用の架空前提投入。600人・1000人の通常登録・確定の合格証拠ではない。
import {randomUUID} from 'node:crypto';
import {base, fields, data, request, ok} from '../GD91-60/tests/transport.mjs';
import {reader} from '../GD91-73/tests/support.mjs';
const root = base.slice(base.indexOf('/projects/') + 1);
export const pub = (f, path) => 'publicationShows/' + f.show + '/' + path;
export async function seedMany(docs) {
  for (let i = 0; i < docs.length; i += 100) {
    const r = await request(base + ':commit', 'owner', 'POST', {writes: docs.slice(i, i + 100).map(([path, value]) =>
      ({update: {name: root + '/' + path, fields: fields(value)}}))});
    ok(r);
  }
}
export async function getOwner(path) { const r = await request(base + '/' + path, 'owner'); ok(r); return data(r); }
export async function fixture(people) {
  const f = {show: randomUUID(), people, sections: [randomUUID(), randomUUID()], generations: [randomUUID(), randomUUID()], attendees: [], seats: []};
  const index = {schemaVersion: 1, environmentId: 'FAKE-environment', performanceId: f.show,
    versions: {commit: 1, source: 1, layout: 1, assignment: 1, attendee: 1, ticket: 1, reception: 1, control: 1},
    sections: Object.fromEntries(f.sections.map((id, i) => [id, f.generations[i]])), seatIds: [], assignments: {}};
  const docs = [[pub(f, 'control/current'), {schemaVersion: 1, environmentId: 'FAKE-environment', performanceId: f.show, state: 'operating', revision: 1}]];
  for (let i = 0; i < 2; i++) {
    const section = f.sections[i], generation = f.generations[i], rows = 5, columns = people / 10;
    docs.push([pub(f, 'sectionDisplay/' + generation), {sectionId: section, generation, rows, columns, name: i ? '桟敷' : '客席', stagePosition: i ? 'left' : 'top'}]);
    docs.push([pub(f, 'sectionViews/' + section), {generation, rowOffset: 0, columnOffset: 0}]);
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col += 2) {
      const content = [], attributes = [];
      for (let slot = 0; slot < Math.min(2, columns - col); slot++) {
        const seatId = randomUUID(), id = randomUUID(), n = f.attendees.length;
        f.attendees.push(id); f.seats.push(seatId); index.seatIds.push(seatId); index.assignments[seatId] = id;
        const cell = {cellId: randomUUID(), seatId, row, column: col + slot, kind: 'seat'};
        const item = {cell, numbering: {mode: 'automatic', number: col + slot + 1}};
        const attrs = {category: 'general', usable: true}; content.push(item); attributes.push(attrs);
        const source = 'sourceProofShows/' + f.show + '/sections/' + section + '/generations/' + generation + '/';
        docs.push([source + 'seatFacts/' + seatId, {fact: {item, prefix: String.fromCharCode(65 + row) + '-', attributes: attrs}}]);
        docs.push([pub(f, 'attendeeLabels/' + id), {seatDisplayName: '架空来場者' + String(n + 1)}]);
        if (n % 2 === 0) docs.push([pub(f, 'receptionRecords/' + id), {status: 'received'}]);
      }
      const source = 'sourceProofShows/' + f.show + '/sections/' + section + '/generations/' + generation + '/';
      docs.push([source + 'chunks/' + row + '-' + col, {formatVersion: 2, row, startColumn: col, content}]);
      docs.push([source + 'attributes/' + row + '-' + col, {formatVersion: 2, row, startColumn: col, values: attributes}]);
    }
  }
  docs.push([pub(f, 'publicIndex/current'), index]);
  await seedMany(docs);
  f.seededDocuments = docs.length;
  f.reader = await reader(f);
  f.index = index;
  return f;
}
