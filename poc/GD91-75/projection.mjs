import {ReadError} from './read-client.mjs';

// 公開索引を前後で照合し、同じ世代の片をまとめて取得・再利用する。
export async function assemble(client, {afterIndex = async () => {}} = {}) {
  return client.session(async many => {
    const pub = (path, options = {}) => ({kind: 'publication', path, ...options});
    const [head] = await many([pub('publicIndex/current')]);
    await afterIndex(head);
    const entries = Object.entries(head.sections);
    // 表示情報はmanager判定の不成立後に一般取得を検査するため、2件までとする。
    const displays = [];
    for (let i = 0; i < entries.length; i += 2)
      displays.push(...await many(entries.slice(i, i + 2).map(([, generation]) => pub('sectionDisplay/' + generation, {cacheTag: generation}))));
    // sectionViewsが未作成のとき、旧Rulesはgetを403にするため単独で照会する。
    const views = [];
    for (const [sectionId, generation] of entries) {
      try {
        const [view] = await many([pub('sectionViews/' + sectionId, {optional: true})]);
        views.push(view?.generation === generation ? view : {rowOffset: 0, columnOffset: 0});
      } catch (error) {
        if (error.code !== 'permission-denied') throw error;
        views.push({rowOffset: 0, columnOffset: 0});
      }
    }
    const refs = [], positions = [];
    for (let section = 0; section < entries.length; section++) {
      const [sectionId, generation] = entries[section], display = displays[section];
      for (let row = 0; row < display.rows; row++) for (let col = 0; col < display.columns; col += 2) {
        const root = sectionId + '/generations/' + generation + '/';
        positions.push({section, offset: refs.length, root, generation});
        for (const type of ['chunks', 'attributes']) refs.push({kind: 'source', path: root + type + '/' + row + '-' + col, cacheTag: generation});
      }
    }
    const parts = await many(refs), cells = [];
    for (const position of positions) {
      const part = parts[position.offset], attrs = parts[position.offset + 1];
      for (let slot = 0; slot < part.content.length; slot++)
        cells.push({...position, cell: part.content[slot].cell, attrs: attrs.values[slot]});
    }
    const seats = cells.filter(x => x.cell.kind === 'seat');
    const facts = await many(seats.map(x => ({kind: 'source', path: x.root + 'seatFacts/' + x.cell.seatId, cacheTag: x.generation})));
    const people = [...new Set(seats.map(x => head.assignments[x.cell.seatId]).filter(Boolean))];
    const labels = await many(people.map(id => pub('attendeeLabels/' + id, {cacheTag: 'attendee-' + head.versions.attendee})));
    // 受付状態はこのPoCでは再取得する。差分同期の本番契約へ自動拡張しない。
    const arrivals = await many(people.map(id => pub('receptionRecords/' + id, {optional: true})));
    const names = new Map(people.map((id, i) => [id, labels[i].seatDisplayName]));
    const statuses = new Map(people.map((id, i) => [id, arrivals[i]?.status ?? 'notReceived']));
    const factMap = new Map(seats.map((x, i) => [x.cell.seatId, facts[i].fact]));
    const sections = entries.map(([sectionId], i) => ({sectionId, name: displays[i].name,
      stagePosition: displays[i].stagePosition, rows: displays[i].rows, columns: displays[i].columns, cells: []}));
    for (const x of cells) {
      const section = sections[x.section], view = views[x.section], c = x.cell;
      const cell = {row: (c.row + view.rowOffset + section.rows) % section.rows,
        column: (c.column + view.columnOffset + section.columns) % section.columns, kind: c.kind};
      if (c.kind === 'seat') {
        const fact = factMap.get(c.seatId), n = fact.item.numbering, a = x.attrs, person = head.assignments[c.seatId];
        Object.assign(cell, {seatId: c.seatId, seatNumber: n.mode === 'manual' ? n.manualNumber.trim() : (fact.prefix + n.number).trim(),
          category: a.category, usable: a.usable, reservedLabel: a.reservedLabel ?? null,
          seatDisplayName: names.get(person) ?? '', receptionStatus: statuses.get(person) ?? 'notReceived', emergencyChange: a.emergencyChange ?? null});
      }
      section.cells.push(cell);
    }
    for (const section of sections) section.cells.sort((a, b) => a.row - b.row || a.column - b.column);
    const [next] = await many([pub('publicIndex/current')]);
    if (JSON.stringify(next) !== JSON.stringify(head)) throw new ReadError('stale-projection');
    const all = sections.flatMap(s => s.cells.filter(c => c.kind === 'seat'));
    return {schemaVersion: 1, layoutRevision: head.versions.layout, assignmentRevision: head.versions.assignment,
      attendeeRevision: head.versions.attendee, ticketRevision: head.versions.ticket, sections,
      counts: {seats: all.length, assigned: all.filter(s => s.seatDisplayName !== '').length, received: all.filter(s => s.receptionStatus === 'received').length}};
  });
}
