// 会場の席構成を計算する。入力を複製して変更案を返し、DBへの保存や画面更新は行わない。

import type {
  CalculationOptions,
  CellKind,
  CellSelections,
  ExtensionInput,
  Id,
  LayoutCell,
  LineInput,
  LineSetting,
  ReconfigurationInput,
  Scope,
  Seat,
  SeatChangePlan,
  SeatLayout,
  SectionInput,
  SectionModel,
  SlideSeatMapCommand,
  StagePosition,
} from './types.ts';
import {
  allIds,
  checkScope,
  displayNumber,
  idFactory,
  isId,
  nonnegative,
  positive,
  requireValue,
  SEAT_LIMITS,
  text,
  validateLayout,
} from './validation.ts';

/** 環境IDと公演IDだけを取り出し、新しい要素へ同じ所属を引き継ぐ。 */
const scopeOf = (s: Scope): Scope => ({
  environmentId: s.environmentId,
  performanceId: s.performanceId,
});

/** 行・列の組合せを、セル位置の比較に使う文字列へ変換する。 */
const key = (c: { row: number; column: number }) => `${c.row},${c.column}`;

/** 指定された区画を取得する。存在しない区画への操作は拒否する。 */
function section(layout: SeatLayout, id: Id): SectionModel {
  const model = layout.sections.find((m) => m.section.sectionId === id);

  requireValue(model, 'SECTION_NOT_FOUND');

  return model;
}

/** 採番方向に応じて、セルが属する列設定を取得する。 */
function lineFor(model: SectionModel, c: LayoutCell): LineSetting {
  return model.section.lineSettings[model.section.axis === 'horizontal' ? c.row : c.column]!;
}

/** 区画数・セル数と列数が、承認済みの上限内か確認する。 */
function guardCapacity(layout: SeatLayout) {
  requireValue(layout.sections.length <= SEAT_LIMITS.sections, 'SECTION_LIMIT');

  let total = 0;

  for (const { section: s } of layout.sections) {
    requireValue(positive(s.rows) && positive(s.columns), 'INVALID_DIMENSIONS');
    total += s.rows * s.columns;
    requireValue(Number.isSafeInteger(total) && total <= SEAT_LIMITS.cells, 'CELL_LIMIT');
    requireValue(
      (s.axis === 'horizontal' ? s.rows : s.columns) <= SEAT_LIMITS.linesPerSection,
      'LINE_LIMIT',
    );
  }
}

/** 列設定を作る。既存列の更新時はIDを引き継ぐ。 */
function newLine(
  input: LineInput,
  index: number,
  scope: Scope,
  newId: () => Id,
  old?: LineSetting,
): LineSetting {
  const start = input.startNumber ?? 1;

  return {
    ...scopeOf(scope),
    lineId: old?.lineId ?? newId(),
    index,
    name: input.name,
    prefix: input.prefix ?? `${input.name}-`,
    startNumber: start,
    nextAutomaticNumber: start,
  };
}

/** オブジェクトのキー順に左右されない文字列を作り、変更前後の比較に使う。 */
function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + stable(v))
        .join(',') +
      '}'
    );

  return JSON.stringify(value) ?? 'undefined';
}

/** 席IDから席情報と配置位置を引ける表を作る。 */
function seatLocations(layout: SeatLayout) {
  const result = new Map<Id, { seat: Seat; cellId: Id; row: number; column: number }>();

  for (const model of layout.sections)
    for (const seat of model.seats) {
      const c = model.section.cells.find((c) => c.seatId === seat.seatId);

      if (c) result.set(seat.seatId, { seat, cellId: c.cellId, row: c.row, column: c.column });
    }

  return result;
}

/** 変更前後を比較し、割当済み・発券済みの席を保護した変更案を返す。 */
function plan(
  before: SeatLayout,
  after: SeatLayout,
  translation?: { sectionId: Id; row: number; column: number },
): SeatChangePlan {
  validateLayout(before);
  checkScope(after, before);

  /** 来場者ID順に並べたコピーを作り、参照の比較に使う。 */
  const sorted = <T extends { attendeeId: Id }>(values: T[]) =>
    [...values].sort((a, b) => a.attendeeId.localeCompare(b.attendeeId));

  requireValue(
    stable(sorted(before.assignments)) === stable(sorted(after.assignments)) &&
      stable(sorted(before.ticketProtections)) === stable(sorted(after.ticketProtections)),
    'BUSINESS_REFERENCES_CHANGED',
  );

  const old = seatLocations(before),
    next = seatLocations(after),
    changed = new Set<Id>();

  for (const id of new Set([...old.keys(), ...next.keys()]))
    if (stable(old.get(id)) !== stable(next.get(id))) changed.add(id);

  const affected: Id[] = [];

  for (const assignment of before.assignments) {
    if (!changed.has(assignment.seatId)) continue;

    affected.push(assignment.attendeeId);

    const a = old.get(assignment.seatId),
      b = next.get(assignment.seatId);

    // 呼出元は全体平行移動を作る内部関数だけ。席単体の移動へ流用しない。
    if (
      translation &&
      a &&
      b &&
      a.seat.sectionId === translation.sectionId &&
      stable(a.seat) === stable(b.seat) &&
      a.cellId === b.cellId &&
      b.row === a.row + translation.row &&
      b.column === a.column + translation.column
    )
      continue;

    const t = before.ticketProtections.find((t) => t.attendeeId === assignment.attendeeId)!;

    requireValue(
      false,
      t.issued || t.sent || t.hasIssuedHistory || t.activeCredentialId !== null
        ? 'ISSUED_SEAT_PROTECTED'
        : 'ASSIGNED_SEAT_REQUIRES_RELEASE',
    );
  }

  validateLayout(after);

  /** 区画・列・セルと席のIDから、各IDの用途を引ける表を作る。 */
  const typedIds = (layout: SeatLayout) =>
    new Map(
      layout.sections.flatMap((m) => [
        [m.section.sectionId, 'section'] as const,
        ...m.section.lineSettings.map((l) => [l.lineId, 'line'] as const),
        ...m.section.cells.map((c) => [c.cellId, 'cell'] as const),
        ...m.seats.map((s) => [s.seatId, 'seat'] as const),
      ]),
    );

  const oldTypes = typedIds(before),
    newTypes = typedIds(after);

  for (const [id, type] of oldTypes)
    requireValue(!newTypes.has(id) || newTypes.get(id) === type, 'ID_REUSED');

  const nextIds = new Set(allIds(after));

  return {
    after,
    impact: {
      changed: stable(before) !== stable(after),
      changedSeatIds: [...changed],
      affectedAttendeeIds: affected,
      retiredIds: allIds(before).filter((id) => !nextIds.has(id)),
      confirmationRequired: changed.size > 0,
    },
  };
}

/** 指定された環境・公演に属する、空の会場構成を作る。 */
export function createLayout(scope: Scope): SeatLayout {
  return validateLayout({
    ...scopeOf(scope),
    sections: [],
    assignments: [],
    ticketProtections: [],
  });
}

/** 未採番の区画とセルを追加し、上限と所属を検証した変更案を返す。 */
export function createSection(
  before: SeatLayout,
  input: SectionInput,
  options: CalculationOptions = {},
): SeatChangePlan {
  validateLayout(before);
  requireValue(!options.duringPerformance, 'FULL_RECONFIGURATION_DURING_PERFORMANCE');

  const after = structuredClone(before),
    newId = idFactory(before, options);
  const model: SectionModel = {
    section: {
      ...scopeOf(before),
      sectionId: newId(),
      name: input.name,
      ...(input.floorId === undefined ? {} : { floorId: input.floorId }),
      displayOrder: input.displayOrder ?? before.sections.length,
      rows: input.rows,
      columns: input.columns,
      axis: input.axis,
      seatOrder: input.seatOrder,
      stagePosition: input.stagePosition ?? 'left',
      lineSettings: [],
      cells: [],
    },
    seats: [],
    initialNumbered: false,
  };

  after.sections.push(model);
  guardCapacity(after);

  const s = model.section;

  requireValue(
    input.lines.length === (s.axis === 'horizontal' ? s.rows : s.columns),
    'LINE_COUNT_MISMATCH',
  );
  s.lineSettings = input.lines.map((l, i) => newLine(l, i, before, newId));

  for (let row = 0; row < s.rows; row++)
    for (let column = 0; column < s.columns; column++)
      s.cells.push({ ...scopeOf(before), cellId: newId(), row, column, kind: 'unset' });

  return plan(before, after);
}

/** 当日の緊急変更に、操作ID・日時と理由を記録する。 */
function mark(
  seat: Seat,
  kind: 'add' | 'number' | 'position',
  reason: string,
  options: CalculationOptions,
) {
  if (options.duringPerformance) requireValue(options.emergency, 'EMERGENCY_CONTEXT_REQUIRED');
  if (options.emergency) {
    requireValue(options.emergency.reason.trim() === reason.trim(), 'REASON_MISMATCH');
    seat.emergencyChange = { ...options.emergency, kind, reason: reason.trim() };
  }
}

/** 列ごとの採番順に従って、席と欠番へ番号を割り当てる。 */
function numberCells(
  model: SectionModel,
  selected: Set<Id>,
  options: CalculationOptions,
  newId: () => Id,
) {
  const s = model.section;

  for (const line of s.lineSettings) {
    // 手入力席へ変えた欠番の消費番号は予約したままにする。
    const reserved = new Set(
      s.cells
        .filter(
          (c) =>
            c.consumedNumber !== undefined &&
            lineFor(model, c).lineId === line.lineId &&
            model.seats.some((seat) => seat.seatId === c.seatId && seat.numberingMode === 'manual'),
        )
        .map((c) => c.consumedNumber!),
    );
    const cells = s.cells
      .filter((c) => selected.has(c.cellId) && lineFor(model, c).lineId === line.lineId)
      .sort(
        (a, b) =>
          (s.seatOrder === 'reverse' ? -1 : 1) *
          (s.axis === 'horizontal' ? a.column - b.column : a.row - b.row),
      );

    for (const c of cells) {
      if (c.kind !== 'seat' && c.kind !== 'gap') continue;

      const previous = model.seats.find((s) => s.seatId === c.seatId);

      if (previous?.numberingMode === 'manual' && c.kind === 'seat') {
        previous.lineId = line.lineId;

        continue;
      }

      while (reserved.has(line.nextAutomaticNumber)) {
        requireValue(positive(line.nextAutomaticNumber + 1), 'NUMBER_OVERFLOW');
        line.nextAutomaticNumber++;
      }

      requireValue(
        positive(line.nextAutomaticNumber) && positive(line.nextAutomaticNumber + 1),
        'NUMBER_OVERFLOW',
      );

      const number = line.nextAutomaticNumber++;

      if (c.kind === 'gap') {
        c.consumedNumber = number;
        delete c.seatId;

        continue;
      }

      delete c.consumedNumber;

      if (previous) {
        requireValue(previous.numberingMode === 'automatic', 'INVALID_NUMBERING_MODE');
        previous.lineId = line.lineId;
        previous.prefix = line.prefix;
        previous.number = number;
      } else {
        const seat: Seat = {
          ...scopeOf(s),
          seatId: newId(),
          sectionId: s.sectionId,
          lineId: line.lineId,
          numberingMode: 'automatic',
          prefix: line.prefix,
          number,
          displayOrder: model.seats.reduce((n, s) => Math.max(n, s.displayOrder + 1), 0),
          category: 'general',
          usable: true,
        };

        if (options.duringPerformance || options.emergency)
          mark(seat, 'add', options.emergency?.reason ?? '', options);

        model.seats.push(seat);
        c.seatId = seat.seatId;
      }
    }
    for (const number of reserved) {
      requireValue(positive(number + 1), 'NUMBER_OVERFLOW');
      line.nextAutomaticNumber = Math.max(line.nextAutomaticNumber, number + 1);
    }
  }
}

/** 対象セルの種類を変更し、席でなくなったセルの参照を片付ける。 */
function selectKinds(model: SectionModel, selections: CellSelections, allowed: Set<Id>) {
  for (const [id, kind] of Object.entries(selections)) {
    const c = model.section.cells.find((c) => c.cellId === id);

    requireValue(
      c && allowed.has(id) && ['unset', 'seat', 'gap', 'space', 'aisle'].includes(kind),
      'INVALID_SELECTION',
    );
    c.kind = kind;

    if (kind !== 'seat') {
      model.seats = model.seats.filter((s) => s.seatId !== c.seatId);
      delete c.seatId;
    }
    if (kind !== 'gap' && kind !== 'seat') delete c.consumedNumber;
  }
}

/** 未採番の区画にセル種別を適用し、初回の席番号を確定する案を作る。 */
export function numberInitial(
  before: SeatLayout,
  sectionId: Id,
  selections: CellSelections,
  options: CalculationOptions = {},
): SeatChangePlan {
  validateLayout(before);
  requireValue(!options.duringPerformance, 'FULL_RECONFIGURATION_DURING_PERFORMANCE');

  const after = structuredClone(before),
    model = section(after, sectionId);

  requireValue(
    !model.initialNumbered && model.section.cells.every((c) => c.kind === 'unset'),
    'ALREADY_NUMBERED',
  );

  const selected = new Set(model.section.cells.map((c) => c.cellId));

  selectKinds(model, selections, selected);
  numberCells(model, selected, options, idFactory(before, options));
  model.initialNumbered = true;

  return plan(before, after);
}

/** 区画の縮小・採番方向などを再設定する。拡張は既存席を保つ専用処理へ分ける。 */
export function reconfigureSection(
  before: SeatLayout,
  sectionId: Id,
  input: ReconfigurationInput,
  options: CalculationOptions = {},
): SeatChangePlan {
  validateLayout(before);
  requireValue(!options.duringPerformance, 'FULL_RECONFIGURATION_DURING_PERFORMANCE');

  const after = structuredClone(before),
    model = section(after, sectionId),
    s = model.section;

  requireValue(model.initialNumbered, 'INITIAL_NUMBERING_REQUIRED');

  const rows = input.rows ?? s.rows,
    columns = input.columns ?? s.columns;

  requireValue(rows <= s.rows && columns <= s.columns, 'USE_PRESERVING_EXTENSION');
  s.rows = rows;
  s.columns = columns;
  s.axis = input.axis ?? s.axis;
  s.seatOrder = input.seatOrder ?? s.seatOrder;
  guardCapacity(after);

  const oldLines = s.lineSettings,
    lineCount = s.axis === 'horizontal' ? s.rows : s.columns;
  const inputs = input.lines ?? oldLines.slice(0, lineCount);

  requireValue(inputs.length === lineCount, 'LINE_COUNT_MISMATCH');

  const newId = idFactory(before, options);

  s.lineSettings = inputs.map((l, i) => newLine(l, i, before, newId, oldLines[i]));
  s.cells = s.cells.filter((c) => c.row < rows && c.column < columns);

  const ids = new Set(s.cells.filter((c) => c.seatId).map((c) => c.seatId));

  model.seats = model.seats.filter((s) => ids.has(s.seatId));

  const selected = new Set(s.cells.map((c) => c.cellId));

  selectKinds(model, input.selections ?? {}, selected);

  for (const seatId of input.automaticSeatIds ?? []) {
    const seat = model.seats.find((candidate) => candidate.seatId === seatId);

    requireValue(seat?.numberingMode === 'manual', 'MANUAL_SEAT_REQUIRED');

    const { manualNumber: _manualNumber, numberingMode: _mode, ...base } = seat;
    const cell = s.cells.find((candidate) => candidate.seatId === seatId)!;
    const line = lineFor(model, cell);

    // 仮の番号は公開せず、直後の区画再採番で位置と方向から決定する。
    model.seats = model.seats.map((candidate) => candidate.seatId === seatId
      ? { ...base, numberingMode: 'automatic', prefix: line.prefix, number: line.startNumber }
      : candidate);
  }

  numberCells(model, selected, options, newId);

  return plan(before, after);
}

/** 既存席のIDと番号を保ちながら、行または列を追加する。 */
export function extendSection(
  before: SeatLayout,
  sectionId: Id,
  input: ExtensionInput,
  options: CalculationOptions = {},
): SeatChangePlan {
  validateLayout(before);
  requireValue(
    ['rows', 'columns'].includes(input.dimension) && positive(input.count),
    'INVALID_EXTENSION',
  );

  if (options.duringPerformance) requireValue(options.emergency, 'EMERGENCY_CONTEXT_REQUIRED');
  if (options.emergency) {
    text(options.emergency.reason, SEAT_LIMITS.reason, 'INVALID_REASON');
    requireValue(
      isId(options.emergency.operationId) && nonnegative(options.emergency.markedAt),
      'INVALID_EMERGENCY_CHANGE',
    );
  }

  const after = structuredClone(before),
    model = section(after, sectionId),
    s = model.section;

  requireValue(model.initialNumbered, 'INITIAL_NUMBERING_REQUIRED');

  const along = input.dimension === (s.axis === 'horizontal' ? 'columns' : 'rows');
  const prepend = along && s.seatOrder === 'reverse',
    oldSize = s[input.dimension];

  s[input.dimension] += input.count;
  guardCapacity(after);

  const newId = idFactory(before, options);

  if (along) requireValue(input.lines === undefined, 'UNEXPECTED_NEW_LINES');
  else {
    requireValue(input.lines && input.lines.length === input.count, 'NEW_LINES_REQUIRED');
    s.lineSettings.push(...input.lines.map((l, i) => newLine(l, oldSize + i, before, newId)));
  }

  const field = input.dimension === 'rows' ? 'row' : 'column';

  if (prepend) for (const c of s.cells) c[field] += input.count;

  const added = new Map<string, LayoutCell>();

  for (let row = 0; row < s.rows; row++)
    for (let column = 0; column < s.columns; column++) {
      const position = field === 'row' ? row : column;

      if (prepend ? position >= input.count : position < oldSize) continue;

      const c: LayoutCell = { ...scopeOf(before), cellId: newId(), row, column, kind: 'unset' };

      s.cells.push(c);
      added.set(key(c), c);
    }

  for (const [coordinate, kind] of Object.entries(input.selections ?? {})) {
    const c = added.get(coordinate);

    requireValue(c, 'EXISTING_CELL_IN_EXTENSION');
    selectKinds(model, { [c.cellId]: kind }, new Set([c.cellId]));
  }

  numberCells(model, new Set([...added.values()].map((c) => c.cellId)), options, newId);

  return plan(before, after, {
    sectionId,
    row: prepend && field === 'row' ? input.count : 0,
    column: prepend && field === 'column' ? input.count : 0,
  });
}

/** 区画名だけを変更し、席や割当への影響を共通の保護判定で確認する。 */
export function renameSection(before: SeatLayout, sectionId: Id, name: string): SeatChangePlan {
  validateLayout(before);

  const after = structuredClone(before);

  section(after, sectionId).section.name = name;

  return plan(before, after);
}

/** 区画の舞台位置を変更する案を作る。 */
export function changeStage(
  before: SeatLayout,
  sectionId: Id,
  position: StagePosition,
): SeatChangePlan {
  validateLayout(before);

  const after = structuredClone(before);

  section(after, sectionId).section.stagePosition = position;

  return plan(before, after);
}

/** 指定セルへ手入力番号の席を追加し、必要な緊急変更情報を記録する。 */
export function addManualSeat(
  before: SeatLayout,
  sectionId: Id,
  cellId: Id,
  label: string,
  reason: string,
  options: CalculationOptions = {},
): SeatChangePlan {
  validateLayout(before);
  text(reason, SEAT_LIMITS.reason, 'INVALID_REASON');

  const after = structuredClone(before),
    model = section(after, sectionId);

  requireValue(model.initialNumbered, 'INITIAL_NUMBERING_REQUIRED');

  const c = model.section.cells.find((c) => c.cellId === cellId);

  requireValue(c && c.kind !== 'seat', 'INVALID_MANUAL_TARGET');

  const line = lineFor(model, c);
  const seat: Seat = {
    ...scopeOf(before),
    seatId: idFactory(before, options)(),
    sectionId,
    lineId: line.lineId,
    numberingMode: 'manual',
    manualNumber: label.trim(),
    displayOrder: model.seats.reduce((n, s) => Math.max(n, s.displayOrder + 1), 0),
    category: 'general',
    usable: true,
  };

  mark(seat, 'add', reason, options);
  c.kind = 'seat';
  c.seatId = seat.seatId;
  model.seats.push(seat);

  return plan(before, after);
}

/** 未割当の席に限り、番号または配置位置の変更案を作る。 */
export function editUnassignedSeat(
  before: SeatLayout,
  sectionId: Id,
  seatId: Id,
  input: { number?: string; targetCellId?: Id; reason: string },
  options: CalculationOptions = {},
): SeatChangePlan {
  validateLayout(before);
  text(input.reason, SEAT_LIMITS.reason, 'INVALID_REASON');
  requireValue(
    !before.assignments.some((a) => a.seatId === seatId),
    'ASSIGNED_SEAT_REQUIRES_RELEASE',
  );
  requireValue(
    (input.number !== undefined) !== (input.targetCellId !== undefined),
    'ONE_EDIT_REQUIRED',
  );

  const after = structuredClone(before),
    model = section(after, sectionId);
  let seat = model.seats.find((s) => s.seatId === seatId);

  requireValue(seat, 'SEAT_NOT_FOUND');

  const source = model.section.cells.find((c) => c.seatId === seatId)!;

  if (input.number !== undefined) {
    const updated = asManual(seat, input.number.trim());

    model.seats = model.seats.map((s) => (s.seatId === seatId ? updated : s));
    seat = updated;
    mark(seat, 'number', input.reason, options);
  } else {
    const target = model.section.cells.find((c) => c.cellId === input.targetCellId);

    requireValue(
      target && (target.kind === 'unset' || target.kind === 'space'),
      'OCCUPIED_MOVE_TARGET',
    );

    const label = displayNumber(seat),
      line = lineFor(model, target);

    source.kind = 'space';
    delete source.seatId;
    delete source.consumedNumber;
    target.kind = 'seat';
    target.seatId = seatId;
    delete target.consumedNumber;

    if (seat.lineId !== line.lineId) {
      const updated = asManual(seat, label);

      model.seats = model.seats.map((s) => (s.seatId === seatId ? updated : s));
      seat = updated;
    }

    seat.lineId = line.lineId;
    mark(seat, 'position', input.reason, options);
  }

  return plan(before, after);
}

/** 自動採番の項目を除き、席IDなどを保ったまま手入力番号へ切り替える。 */
function asManual(seat: Seat, manualNumber: string): Seat {
  const {
    prefix: _prefix,
    number: _number,
    manualNumber: _manualNumber,
    numberingMode: _mode,
    ...base
  } = seat;

  return { ...base, numberingMode: 'manual', manualNumber };
}

/** 端の未設定セルを確認し、区画の席構成を1マスだけ平行移動する。 */
export function slideSection(before: SeatLayout, command: SlideSeatMapCommand): SeatChangePlan {
  validateLayout(before);
  checkScope(command, before);
  requireValue(
    isId(command.operationId) && !Object.hasOwn(command, 'reason'),
    'INVALID_SLIDE_COMMAND',
  );
  requireValue(
    command.expectedVersions &&
      Object.values(command.expectedVersions).length === 4 &&
      ['layoutRevision', 'assignmentRevision', 'ticketRevision', 'controlRevision'].every((k) =>
        nonnegative(command.expectedVersions[k as keyof typeof command.expectedVersions]),
      ),
    'INVALID_EXPECTED_VERSIONS',
  );

  const directions = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] } as const;

  requireValue(
    Object.hasOwn(directions, command.direction) && command.amount === 1,
    'INVALID_SLIDE_DIRECTION',
  );

  const [row, column] = directions[command.direction],
    after = structuredClone(before),
    model = section(after, command.sectionId),
    s = model.section;

  requireValue(model.initialNumbered, 'INITIAL_NUMBERING_REQUIRED');

  const edge = s.cells.filter((c) =>
    row < 0
      ? c.row === 0
      : row > 0
        ? c.row === s.rows - 1
        : column < 0
          ? c.column === 0
          : c.column === s.columns - 1,
  );

  requireValue(
    edge.every(
      (c) => c.kind === 'unset' && c.seatId === undefined && c.consumedNumber === undefined,
    ),
    'SLIDE_BOUNDARY_NOT_UNSET',
  );

  if (s.cells.every((c) => c.kind === 'unset')) return plan(before, after);

  for (const c of s.cells) {
    c.row = (c.row + row + s.rows) % s.rows;
    c.column = (c.column + column + s.columns) % s.columns;
  }

  const delta = s.axis === 'horizontal' ? row : column,
    count = s.lineSettings.length;

  for (const line of s.lineSettings) line.index = (line.index + delta + count) % count;

  s.lineSettings.sort((a, b) => a.index - b.index);

  return plan(before, after, { sectionId: s.sectionId, row, column });
}

// 保存層・画面が作った構成案にも、同じ保護判定を適用する。

/** 呼出元が作った構成案にも、共通の変更検出と席保護を適用する。 */
export function assessSeatChanges(before: SeatLayout, after: SeatLayout): SeatChangePlan {
  return plan(before, structuredClone(after));
}
