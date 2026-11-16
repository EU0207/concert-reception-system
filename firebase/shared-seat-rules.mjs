// 共有用の不変構成・編集情報と保持予約を検査し、受付の確定版から分離する。

import { SEAT_LIMITS } from '../src/domain/seats/validation.ts';

/** 必須項目と未知項目の拒否を組み合わせる。 */
const fields = (names) => ({ ...Object.fromEntries(names.map((name) => [name, { '.validate': true }])), $other: { '.validate': false } });

/** 値を返すRTDB式を作る。 */
const v = (node, path) => `${node}.child('${path}').val()`;

/** 共有候補の準備・分割保存・公開を、同じ公演の現在認可で保護する。 */
export function sharedSeatRules({ root, manager, integer }) {
  /** 固定した枠数を展開し、RTDB Rulesにない子件数APIを使わずに件数を検査する。 */
  const countSlots = (node, names) => names.map((name) => `(${node}.child('${name}').exists() ? 1 : 0)`).join(' + ');
  const imageSlots = ['0', '1', '2', '3', '4'];
  const uuid = '/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/';
  /** 公演の所属がパスと同じことを検査する。 */
  const scope = (n) => `${v(n, 'environmentId')} === $environmentId && ${v(n, 'performanceId')} === $performanceId`;
  const c = `${root}.child('control')`, own = `${root}.child('sessions').child(auth.uid)`;
  const editing = `${manager} && ${v(c, 'businessSchemaVersion')} === 3 && ${v(c, 'layoutSchemaVersion')} === 2
    && (${v(c, 'state')} === 'preparing' || ${v(c, 'state')} === 'operating' || ${v(c, 'state')} === 'stopped')`;
  const head = `${root}.child('head')`, shared = `${root}.child('sharedHead')`;
  /** 共有案が確認した認可・公演と構成の版を検査する。 */
  const base = (n) => `${v(n, 'sourceControlRevision')} === ${v(c, 'controlRevision')}
    && ${v(n, 'roleRevision')} === ${root}.child('roles').child(${v(own, 'humanUid')}).child('revision').val()
    && ${v(n, 'deviceRevision')} === ${root}.child('devices').child(auth.uid).child('preparedRoleRevision').val()
    && ${v(n, 'calendarRevision')} === ${v(c, 'calendar/calendarRevision')}
    && ${v(n, 'expectedSharedRevision')} === (${shared}.exists() ? ${v(shared, 'revision')} : 0)
    && (${head}.exists() ? (${v(n, 'baseLayoutRevision')} === ${v(head, 'revision')}
      && ${v(n, 'baseLayoutGeneration')} === ${v(head, 'generation')}
      && ${root}.child('generations').child(${v(head, 'generation')}).child('meta/phase').val() === 'ready') :
      (${v(n, 'baseLayoutRevision')} === 0 && ${v(n, 'baseLayoutGeneration')} === ''))`;
  const reservation = `${root}.child('references').child($generation)`;
  const g = `${root}.child('generations').child($generation)`;
  const building = `${editing} && ${v(reservation, 'active')} === true && ${v(reservation, 'deviceUid')} === auth.uid
    && (${v(g, 'meta/phase')} === 'building' || !${g}.child('meta').exists()) && (${base(reservation)})`;
  const metaKeys = ['environmentId', 'performanceId', 'schemaVersion', 'kind', 'phase', 'expectedSections', 'sectionCursor',
    'expectedParts', 'cursor', 'totalCells', 'receivedCells', 'sectionCellTotal', 'revision', 'lastSection', 'lastPart'];
  const gm = "newData.child('meta')", old = "data.child('meta')";
  const metaStable = ['environmentId', 'performanceId', 'schemaVersion', 'kind', 'expectedSections', 'expectedParts', 'totalCells']
    .map((key) => `${v(gm, key)} === ${v(old, key)}`).join(' && ');
  const complete = `${v(gm, 'sectionCursor')} === ${v(gm, 'expectedSections')} && ${v(gm, 'cursor')} === ${v(gm, 'expectedParts')}
    && ${v(gm, 'receivedCells')} === ${v(gm, 'totalCells')} && ${v(gm, 'sectionCellTotal')} === ${v(gm, 'totalCells')}`;
  const transitions = `!data.child('meta').exists() ? (${v(gm, 'phase')} === 'building'
    && ${v(gm, 'sectionCursor')} === 0 && ${v(gm, 'cursor')} === 0 && ${v(gm, 'receivedCells')} === 0
    && ${v(gm, 'sectionCellTotal')} === 0 && ${v(gm, 'revision')} === 1) :
    (${metaStable} && ${v(gm, 'revision')} === ${v(old, 'revision')} + 1 && ${v(old, 'phase')} === 'building' && (
      (${v(gm, 'phase')} === 'ready' && ${complete}
        && ${v(gm, 'sectionCursor')} === ${v(old, 'sectionCursor')} && ${v(gm, 'cursor')} === ${v(old, 'cursor')}
        && ${v(gm, 'receivedCells')} === ${v(old, 'receivedCells')} && ${v(gm, 'sectionCellTotal')} === ${v(old, 'sectionCellTotal')}) ||
      (${v(gm, 'phase')} === 'building' && (
        (${v(gm, 'sectionCursor')} === ${v(old, 'sectionCursor')} + 1 && ${v(gm, 'cursor')} === ${v(old, 'cursor')}
          && ${v(gm, 'receivedCells')} === ${v(old, 'receivedCells')}
          && ${v(gm, 'sectionCellTotal')} === ${v(old, 'sectionCellTotal')} + newData.child('sections').child(${v(gm, 'lastSection')}).child('rows').val()*newData.child('sections').child(${v(gm, 'lastSection')}).child('columns').val()
          && newData.child('sections').child(${v(gm, 'lastSection')}).exists()
          && !data.child('sections').child(${v(gm, 'lastSection')}).exists()
          && newData.child('sectionOrder').child('s'+${v(old, 'sectionCursor')}).val() === ${v(gm, 'lastSection')}) ||
        (${v(gm, 'sectionCursor')} === ${v(old, 'sectionCursor')} && ${v(gm, 'sectionCursor')} === ${v(gm, 'expectedSections')}
          && ${v(gm, 'sectionCellTotal')} === ${v(old, 'sectionCellTotal')}
          && ${v(gm, 'cursor')} === ${v(old, 'cursor')} + 1 && ${v(gm, 'lastPart')} === 'p' + ${v(old, 'cursor')}
          && newData.child('parts').child(${v(gm, 'lastPart')}).child('index').val() === ${v(old, 'cursor')}
          && ${v(gm, 'receivedCells')} === ${v(old, 'receivedCells')} + newData.child('parts').child(${v(gm, 'lastPart')}).child('count').val())))))`;
  const sectionKeys = ['environmentId', 'performanceId', 'name', 'displayOrder', 'rows', 'columns', 'axis', 'seatOrder', 'stagePosition', 'lines', 'lineIndices'];
  const lineKeys = ['environmentId', 'performanceId', 'lineId', 'index', 'name', 'prefix', 'startNumber', 'nextAutomaticNumber'];
  const section = 'newData', line = 'newData', sectionPost = 'newData.parent().parent()';
  const pg = 'newData.parent().parent().parent().parent()', item = 'newData';
  const point = `newData.parent().parent().child('index')`, location = `newData.parent().parent().parent().parent()`;
  const label = `${v(item, 'label')}.replace('%','%25').replace('.','%2E').replace('$','%24').replace('#','%23').replace('[','%5B').replace(']','%5D').replace('/','%2F')`;
  /** 現在の候補世代の索引を参照する。 */
  const ix = (path) => `${location}.child('${path}')`;

  /** 索引と本文が同じ片・位置を指すことを確認する。 */
  const matchesPoint = (node) => `${node}.child('part').val() === $part && ${node}.child('slot').val() === $slot`;
  const consumed = `(${v(item, 'numberingMode')} === 'automatic' ? ${v(item, 'number')} : ${v(item, 'consumedNumber')})`;
  const pointFields = fields(['part', 'slot']);
  /** 索引の指すセルが同じ片の完全な本文に存在することを検査する。 */
  function indexRule(parents, condition) {
    const generation = `newData${'.parent()'.repeat(parents)}`;
    const target = `${generation}.child('parts').child(${v('newData', 'part')}).child('slots').child(${v('newData', 'slot')})`;

    return { '.write': `${building} && !data.exists() && newData.exists()`,
      '.validate': `newData.hasChildren(['part','slot']) && ${target}.exists() && (${condition(target)})
        && ${generation}.child('parts').child(${v('newData', 'part')}).child('index').val() === ${v(g, 'meta/cursor')}`,
      ...pointFields };
  }
  const itemKeys = ['environmentId', 'performanceId', 'id', 'cellId', 'row', 'column', 'kind', 'sectionId', 'lineId', 'label'];
  const optionalItem = ['seatId', 'consumedNumber', 'numberingMode', 'prefix', 'number', 'manualNumber', 'displayOrder', 'category', 'usable', 'reservedLabel', 'emergencyChange'];
  const nsection = `${pg}.child('sections').child(${v(item, 'sectionId')})`;
  const itemShape = `${scope(item)} && ${v(item, 'cellId')}.matches(${uuid}) && ${v(item, 'id')}.matches(${uuid})
    && ${integer(v(item, 'row'))} && ${integer(v(item, 'column'))}
    && ${v(item, 'row')} < ${v(nsection, 'rows')} && ${v(item, 'column')} < ${v(nsection, 'columns')}
    && ${nsection}.child('lines').child(${v(item, 'lineId')}).child('index').val() ===
      (${v(nsection, 'axis')} === 'horizontal' ? ${v(item, 'row')} : ${v(item, 'column')})
    && (${matchesPoint(`${ix('indexes/cells')}.child(${v(item, 'cellId')})`)})
    && (${matchesPoint(`${ix('indexes/coordinates')}.child(${v(item, 'sectionId')}).child('r'+${v(item, 'row')}+'c'+${v(item, 'column')})`)})
    && (${matchesPoint(`${ix('ids')}.child(${v(item, 'id')})`)})
    && (${v(item, 'kind')} === 'seat' ? (
      ${v(item, 'seatId')} === ${v(item, 'id')} && ${v(item, 'seatId')} !== ${v(item, 'cellId')}
      && ${integer(v(item, 'displayOrder'))} && newData.child('usable').isBoolean()
      && (${v(item, 'category')} === 'general' || ${v(item, 'category')} === 'reserved' || ${v(item, 'category')} === 'special')
      && newData.child('label').isString() && ${v(item, 'label')}.length > 0 && ${v(item, 'label')}.length <= 128
      && (${matchesPoint(`${ix('labels')}.child(${v(item, 'sectionId')}).child(${v(item, 'lineId')}).child(${label})`)})
      && (${v(item, 'numberingMode')} === 'automatic' ? (
        ${integer(v(item, 'number'), 1)} && newData.child('prefix').isString() && !newData.child('manualNumber').exists()
        && ${v(item, 'label')} === ${v(item, 'prefix')}+${v(item, 'number')}) :
        (${v(item, 'numberingMode')} === 'manual' && ${v(item, 'label')} === ${v(item, 'manualNumber')}
          && !newData.child('prefix').exists() && !newData.child('number').exists()))) :
      ((${v(item, 'kind')} === 'unset' || ${v(item, 'kind')} === 'gap' || ${v(item, 'kind')} === 'space' || ${v(item, 'kind')} === 'aisle')
        && ${v(item, 'id')} === ${v(item, 'cellId')} && ${v(item, 'label')} === '' && !newData.child('seatId').exists()))
    && ((!newData.child('consumedNumber').exists() && ${v(item, 'numberingMode')} !== 'automatic') ||
      (${integer(consumed, 1)} && (${matchesPoint(`${ix('indexes/numbers')}.child(${v(item, 'sectionId')}).child(${v(item, 'lineId')}).child('n'+${consumed})`)})))`;
  const generationRules = {
    '.read': manager,
    '.validate': `!newData.child('meta').exists() || ((${metaKeys.map((key) => `${v(gm, key)} === ${v(old, key)}`).join(' && ')}) || ((${transitions})
      ))`,
    meta: { '.write': `${building} && newData.exists()`, '.validate': `newData.hasChildren(${JSON.stringify(metaKeys)}) && ${scope('newData')}
      && ${v('newData', 'schemaVersion')} === 2 && ${v('newData', 'kind')} === 'layout'
      && ${integer(v('newData', 'expectedSections'), 1)} && ${v('newData', 'expectedSections')} <= ${SEAT_LIMITS.sections}
      && ${integer(v('newData', 'sectionCursor'))} && ${v('newData', 'sectionCursor')} <= ${v('newData', 'expectedSections')}
      && ${integer(v('newData', 'expectedParts'), 1)} && ${v('newData', 'expectedParts')} <= ${Math.ceil(SEAT_LIMITS.cells / 16)}
      && ${integer(v('newData', 'cursor'))} && ${v('newData', 'cursor')} <= ${v('newData', 'expectedParts')}
      && ${integer(v('newData', 'totalCells'), 1)} && ${v('newData', 'totalCells')} <= ${SEAT_LIMITS.cells}
      && ${v('newData', 'expectedParts')}*16 >= ${v('newData', 'totalCells')}
      && (${v('newData', 'expectedParts')}-1)*16 < ${v('newData', 'totalCells')}
      && ${integer(v('newData', 'receivedCells'))} && ${v('newData', 'receivedCells')} <= ${v('newData', 'totalCells')}`, ...fields(metaKeys),
      lastSection: { '.validate': `newData.isString() && (newData.val() === '' || newData.val().matches(${uuid}))` },
      lastPart: { '.validate': "newData.isString() && (newData.val() === '' || (newData.val().length <= 4 && newData.val().matches(/^p[0-9]+$/)))" },
    },
    sections: { $section: { '.write': `${building} && !data.exists() && newData.exists()`,
      '.validate': `newData.hasChildren(${JSON.stringify(sectionKeys)}) && ${scope(section)} && $section.matches(${uuid})
        && ${sectionPost}.child('meta/lastSection').val() === $section
        && ${sectionPost}.child('meta/sectionCursor').val() === ${v(g, 'meta/sectionCursor')} + 1
        && ${integer(v(section, 'rows'), 1)} && ${integer(v(section, 'columns'), 1)} && ${v(section, 'rows')}*${v(section, 'columns')} <= ${SEAT_LIMITS.cells}
        && (${v(section, 'axis')} === 'horizontal' || ${v(section, 'axis')} === 'vertical')
        && (${v(section, 'seatOrder')} === 'forward' || ${v(section, 'seatOrder')} === 'reverse')
        && (${v(section, 'stagePosition')} === 'left' || ${v(section, 'stagePosition')} === 'top')
        && (${v(section, 'axis')} === 'horizontal' ? ${v(section, 'rows')} : ${v(section, 'columns')}) <= ${SEAT_LIMITS.linesPerSection}
        && ${Array.from({ length: SEAT_LIMITS.linesPerSection }, (_, index) => `(newData.child('lineIndices/i${index}').exists() === (${index} < (${v(section, 'axis')} === 'horizontal' ? ${v(section, 'rows')} : ${v(section, 'columns')})))`).join(' && ')}`,
      ...fields([...sectionKeys, 'floorId']),
      name: { '.validate': "newData.isString() && newData.val().length > 0 && newData.val().length <= 200" },
      displayOrder: { '.validate': integer('newData.val()') },
      floorId: { '.validate': `newData.isString() && newData.val().matches(${uuid})` },
      lines: { $line: { '.validate': `newData.hasChildren(${JSON.stringify(lineKeys)}) && ${scope(line)} && $line === ${v(line, 'lineId')}
        && $line.matches(${uuid}) && ${integer(v(line, 'index'))} && ${v(line, 'index')} <
          (newData.parent().parent().child('axis').val() === 'horizontal' ? newData.parent().parent().child('rows').val() : newData.parent().parent().child('columns').val())
        && newData.parent().parent().child('lineIndices').child('i'+${v(line, 'index')}).val() === $line
        && newData.child('name').isString() && ${v(line, 'name')}.length > 0 && ${v(line, 'name')}.length <= 128
        && newData.child('prefix').isString() && ${v(line, 'prefix')}.length <= 128
        && ${integer(v(line, 'startNumber'), 1)} && ${integer(v(line, 'nextAutomaticNumber'), 1)}
        && ${v(line, 'nextAutomaticNumber')} >= ${v(line, 'startNumber')}`, ...fields(lineKeys) } },
      lineIndices: { $index: { '.validate': "newData.isString() && 'i'+newData.parent().parent().child('lines').child(newData.val()).child('index').val() === $index" } },
    } },
    sectionOrder: { $index: { '.write': `${building} && !data.exists() && newData.exists()`,
      '.validate': `$index === 's'+${v(g, 'meta/sectionCursor')} && newData.val() === newData.parent().parent().child('meta/lastSection').val()
        && newData.parent().parent().child('meta/sectionCursor').val() === ${v(g, 'meta/sectionCursor')} + 1` } },
    parts: { $part: { '.write': `${building} && !data.exists() && newData.exists()`,
      '.validate': `newData.hasChildren(['index','count','slots']) && $part === 'p'+${v('newData', 'index')}
        && ${v('newData', 'index')} === ${v(g, 'meta/cursor')} && ${v('newData', 'index')} < ${v(g, 'meta/expectedParts')}
        && newData.parent().parent().child('meta/cursor').val() === ${v(g, 'meta/cursor')}+1
        && newData.parent().parent().child('meta/lastPart').val() === $part
        && ${integer(v('newData', 'count'), 1)} && ${v('newData', 'count')} ===
          (${v('newData', 'index')} < ${v(g, 'meta/expectedParts')}-1 ? 16 : ${v(g, 'meta/totalCells')}-${v('newData', 'index')}*16)
        && ${Array.from({ length: 16 }, (_, index) => `(newData.child('slots/s${String(index).padStart(2, '0')}').exists() === (${index} < ${v('newData', 'count')}))`).join(' && ')}`,
      ...fields(['index', 'count', 'slots']), slots: { $slot: {
        '.validate': `$slot.matches(/^s(0[0-9]|1[0-5])$/) && newData.hasChildren(${JSON.stringify(itemKeys)}) && (${itemShape})`,
        ...fields([...itemKeys, ...optionalItem]),
        seatId: { '.validate': `newData.isString() && newData.val().matches(${uuid})` },
        displayOrder: { '.validate': integer('newData.val()') },
        numberingMode: { '.validate': "newData.val() === 'automatic' || newData.val() === 'manual'" },
        category: { '.validate': "newData.val() === 'general' || newData.val() === 'reserved' || newData.val() === 'special'" },
        usable: { '.validate': 'newData.isBoolean()' },
        consumedNumber: { '.validate': integer('newData.val()', 1) },
        number: { '.validate': integer('newData.val()', 1) },
        prefix: { '.validate': "newData.isString() && newData.val().length <= 128" },
        manualNumber: { '.validate': "newData.isString() && newData.val().length > 0 && newData.val().length <= 128" },
        reservedLabel: { '.validate': "newData.isString() && newData.val().length <= 200" },
        emergencyChange: { '.validate': "newData.hasChildren(['kind','operationId','markedAt','reason'])",
          ...fields(['kind', 'operationId', 'markedAt', 'reason']),
          kind: { '.validate': "newData.val() === 'add' || newData.val() === 'number' || newData.val() === 'position'" },
          operationId: { '.validate': `newData.isString() && newData.val().matches(${uuid})` },
          markedAt: { '.validate': integer('newData.val()', 1) },
          reason: { '.validate': "newData.isString() && newData.val().length > 0 && newData.val().length <= 400" },
        },
      } } } },
    ids: { $id: indexRule(2, (target) => `${v(target, 'id')} === $id`) },
    labels: { $section: { $line: { $label: indexRule(4, (target) => `${v(target, 'kind')} === 'seat' && ${v(target, 'sectionId')} === $section
      && ${v(target, 'lineId')} === $line && ${v(target, 'label')}.replace('%','%25').replace('.','%2E').replace('$','%24').replace('#','%23').replace('[','%5B').replace(']','%5D').replace('/','%2F') === $label`) } } },
    indexes: {
      cells: { $cell: indexRule(3, (target) => `${v(target, 'cellId')} === $cell`) },
      coordinates: { $section: { $coordinate: indexRule(4, (target) => `${v(target, 'sectionId')} === $section && 'r'+${v(target, 'row')}+'c'+${v(target, 'column')} === $coordinate`) } },
      numbers: { $section: { $line: { $number: indexRule(5, (target) => `${v(target, 'sectionId')} === $section && ${v(target, 'lineId')} === $line
        && 'n'+(${v(target, 'numberingMode')} === 'automatic' ? ${v(target, 'number')} : ${v(target, 'consumedNumber')}) === $number`) } } },
    },
    refs: { $reference: { '.write': `${editing} && !data.exists() && newData.val() === true
      && newData.parent().parent().parent().parent().child('references').child($reference).child('active').val() === true
      && (newData.parent().parent().parent().parent().child('references').child($reference).child('generation').val() === $generation
        || newData.parent().parent().parent().parent().child('references').child($reference).child('baseLayoutGeneration').val() === $generation)` } }, $other: { '.validate': false },
  };

  const d = `${root}.child('sharedDrafts').child($operation)`;
  const dm = `${d}.child('meta')`, r = `${root}.child('references').child($operation)`;
  const upload = `${editing} && ${v(dm, 'deviceUid')} === auth.uid && (${base(dm)})
    && !${root}.child('sharedOperations').child($operation).exists()`;
  const editorMetaKeys = ['schemaVersion', 'environmentId', 'performanceId', 'operationId', 'generation', 'humanUid', 'deviceUid',
    'baseLayoutGeneration', 'baseLayoutRevision', 'sourceControlRevision', 'calendarRevision', 'expectedSharedRevision',
    'sectionCount', 'reasonCount', 'imageCount', 'hasEditReasons', 'hasImageBindings', 'inputDigest', 'draftDigest', 'roleRevision', 'deviceRevision'];
  /** 固定した送信本文のSHA-256形式を検査する。 */
  const digest = (n, path) => `${n}.child('${path}').isString() && ${v(n, path)}.matches(/^[a-f0-9]{64}$/)`;
  const slotAllowed = "($slot === '0' || $slot === '1' || $slot === '2' || $slot === '3' || $slot === '4')";
  const imageKeys = ['schemaVersion', 'environmentId', 'performanceId', 'revision', 'active', 'bank', 'operationId', 'sha256'];
  const sharedDrafts = { $operation: {
    '.read': manager,
    '.validate': `!newData.child('progress').exists() ||
      (!data.child('progress').exists() ? (${v("newData.child('progress')", 'sections')} === 0 && ${v("newData.child('progress')", 'reasons')} === 0) :
      ((${v("newData.child('progress')", 'sections')} === ${v("data.child('progress')", 'sections')}
        && ${v("newData.child('progress')", 'reasons')} === ${v("data.child('progress')", 'reasons')}) ||
       (${v("newData.child('progress')", 'sections')} === ${v("data.child('progress')", 'sections')}+1
        && ${v("newData.child('progress')", 'reasons')} === ${v("data.child('progress')", 'reasons')}
        && newData.child('sections').child(${v("newData.child('progress')", 'lastSection')}).exists()
        && !data.child('sections').child(${v("newData.child('progress')", 'lastSection')}).exists()) ||
       (${v("newData.child('progress')", 'reasons')} === ${v("data.child('progress')", 'reasons')}+1
        && ${v("newData.child('progress')", 'sections')} === ${v("data.child('progress')", 'sections')}
        && newData.child('reasons').child(${v("newData.child('progress')", 'lastReason')}).exists()
        && !data.child('reasons').child(${v("newData.child('progress')", 'lastReason')}).exists())))`,
    progress: { '.write': `${upload} && ${v(r, 'active')} === true && newData.exists()`,
      '.validate': `newData.hasChildren(['sections','reasons','lastSection','lastReason'])
        && ${integer(v('newData', 'sections'))} && ${v('newData', 'sections')} <= ${v(dm, 'sectionCount')}
        && ${integer(v('newData', 'reasons'))} && ${v('newData', 'reasons')} <= ${v(dm, 'reasonCount')}`,
      ...fields(['sections', 'reasons', 'lastSection', 'lastReason']),
      lastSection: { '.validate': `newData.isString() && (newData.val() === '' || newData.val().matches(${uuid}))` },
      lastReason: { '.validate': `newData.isString() && (newData.val() === '' || newData.val().matches(${uuid}))` },
    },
    meta: { '.write': `${editing} && $operation.matches(${uuid}) && !data.exists() && newData.exists()`,
      '.validate': `newData.hasChildren(${JSON.stringify(editorMetaKeys)}) && ${scope('newData')} && (${base('newData')})
        && ${v('newData', 'schemaVersion')} === 1 && ${v('newData', 'operationId')} === $operation
        && ${v('newData', 'generation')} === $operation && ${v('newData', 'deviceUid')} === auth.uid
        && ${v('newData', 'humanUid')} === ${v(own, 'humanUid')}
        && ${integer(v('newData', 'sectionCount'), 1)} && ${v('newData', 'sectionCount')} <= 16
        && ${integer(v('newData', 'reasonCount'))} && ${v('newData', 'reasonCount')} <= 4096
        && ${integer(v('newData', 'imageCount'))} && ${v('newData', 'imageCount')} <= 5
        && newData.child('hasEditReasons').isBoolean() && newData.child('hasImageBindings').isBoolean()
        && (${v('newData', 'hasEditReasons')} === true || ${v('newData', 'reasonCount')} === 0)
        && ${digest('newData', 'inputDigest')} && ${digest('newData', 'draftDigest')}`, ...fields(editorMetaKeys) },
    sections: { $section: { '.write': `${upload} && ${v(r, 'active')} === true && !data.exists() && newData.exists()`,
      '.validate': `newData.hasChildren(['initialNumbered']) && newData.child('initialNumbered').isBoolean()
        && newData.parent().parent().child('progress/sections').val() === ${d}.child('progress/sections').val()+1
        && newData.parent().parent().child('progress/lastSection').val() === $section
        && ${root}.child('generations').child($operation).child('sections').child($section).exists()
        && (!newData.child('imageSlot').exists() || (${v(dm, 'hasImageBindings')} === true
          && (${['0', '1', '2', '3', '4'].map((slot) => `newData.child('imageSlot').val() === '${slot}'`).join(' || ')})))`,
      ...fields(['initialNumbered', 'imageSlot']) } },
    reasons: { $seat: { '.write': `${upload} && ${v(r, 'active')} === true && !data.exists() && newData.exists()`,
      '.validate': `newData.isString() && newData.val().length > 0 && newData.val().length <= 400
        && newData.parent().parent().child('progress/reasons').val() === ${d}.child('progress/reasons').val()+1
        && newData.parent().parent().child('progress/lastReason').val() === $seat
        && ${v(dm, 'hasEditReasons')} === true && ${root}.child('generations').child($operation).child('ids').child($seat).exists()` } },
    images: { $slot: { '.write': `${upload} && !data.exists() && newData.exists() && !${r}.exists()`,
      '.validate': `${slotAllowed} && newData.hasChildren(${JSON.stringify(imageKeys)}) && ${scope('newData')}
        && ${imageKeys.map((key) => `${v('newData', key)} === ${root}.child('images').child($slot).child('head/${key}').val()`).join(' && ')}
        && ${v('newData', 'active')} === true`, ...fields(imageKeys) } },
    $other: { '.validate': false },
  } };
  const referenceKeys = ['schemaVersion', 'environmentId', 'performanceId', 'generation', 'baseLayoutGeneration', 'baseLayoutRevision',
    'sourceControlRevision', 'calendarRevision', 'expectedSharedRevision', 'operationId', 'deviceUid', 'active', 'revision', 'roleRevision', 'deviceRevision'];
  const post = 'newData.parent().parent()';
  const oldMetadata = `${root}.child('sharedDrafts').child($reference)`;
  const imagePins = Array.from({ length: 5 }, (_, index) => {
    const image = `${oldMetadata}.child('images/${index}')`;
    const live = `${root}.child('images/${index}/head')`;

    return `(!${image}.exists() || (${imageKeys.map((key) => `${v(image, key)} === ${v(live, key)}`).join(' && ')}
      && ${post}.child('images/${index}/references').child(${v(image, 'bank')}).child($reference).val() === true))`;
  }).join(' && ');
  const references = { $reference: {
    '.read': manager,
    '.write': `${editing} && !data.exists() && newData.exists()`,
    '.validate': `newData.hasChildren(${JSON.stringify(referenceKeys)}) && ${scope('newData')}
      && ${v('newData', 'schemaVersion')} === 4 && ${v('newData', 'revision')} === 1 && ${v('newData', 'active')} === true
      && ${v('newData', 'operationId')} === $reference && ${v('newData', 'generation')} === $reference
      && ${v('newData', 'deviceUid')} === auth.uid && (${base('newData')})
      && ${referenceKeys.filter((key) => !['schemaVersion', 'active', 'revision'].includes(key)).map((key) => `${v('newData', key)} === ${v(`${oldMetadata}.child('meta')`, key)}`).join(' && ')}
      && (${countSlots(`${oldMetadata}.child('images')`, imageSlots)}) === ${v(`${oldMetadata}.child('meta')`, 'imageCount')}
      && ${post}.child('generations').child($reference).child('refs').child($reference).val() === true
      && (${v('newData', 'baseLayoutGeneration')} === '' || ${post}.child('generations').child(${v('newData', 'baseLayoutGeneration')}).child('refs').child($reference).val() === true)
      && ${imagePins}`, ...fields(referenceKeys),
  } };
  const newHead = 'newData';
  const opId = v(newHead, 'operationId');
  const publishedEditor = `${root}.child('sharedDrafts').child(${opId})`;
  const publishedMeta = `${publishedEditor}.child('meta')`;
  const publishedGeneration = `${root}.child('generations').child(${v(newHead, 'generation')})`;
  const result = `newData.parent().child('sharedOperations').child(${opId})`;
  const headKeys = ['schemaVersion', 'environmentId', 'performanceId', 'generation', 'revision', 'operationId', 'baseLayoutGeneration', 'baseLayoutRevision', 'referenceId'];
  const resultKeys = ['schemaVersion', 'environmentId', 'performanceId', 'generation', 'resultRevision', 'operationId',
    'baseLayoutGeneration', 'baseLayoutRevision', 'referenceId', 'inputDigest', 'humanUid', 'deviceUid', 'committedAt'];
  const sharedHead = { '.read': manager, '.write': `${editing} && newData.exists()`,
    '.validate': `newData.hasChildren(${JSON.stringify(headKeys)}) && ${scope(newHead)} && ${v(newHead, 'schemaVersion')} === 1
      && ${v(newHead, 'generation')} === ${opId} && ${v(newHead, 'referenceId')} === ${opId}
      && ${opId}.matches(${uuid}) && ${v(publishedGeneration, 'meta/phase')} === 'ready'
      && ${v(publishedMeta, 'deviceUid')} === auth.uid && (${base(publishedMeta)})
      && ${v(newHead, 'baseLayoutGeneration')} === ${v(publishedMeta, 'baseLayoutGeneration')}
      && ${v(newHead, 'baseLayoutRevision')} === ${v(publishedMeta, 'baseLayoutRevision')}
      && ${v(newHead, 'revision')} === ${v(publishedMeta, 'expectedSharedRevision')} + 1
      && ${v(publishedEditor, 'progress/sections')} === ${v(publishedMeta, 'sectionCount')}
      && ${v(publishedGeneration, 'meta/expectedSections')} === ${v(publishedMeta, 'sectionCount')}
      && ${v(publishedEditor, 'progress/reasons')} === ${v(publishedMeta, 'reasonCount')}
      && (${countSlots(`${publishedEditor}.child('images')`, imageSlots)}) === ${v(publishedMeta, 'imageCount')}
      && ${root}.child('references').child(${opId}).child('active').val() === true
      && ${v(result, 'generation')} === ${v(newHead, 'generation')} && ${v(result, 'resultRevision')} === ${v(newHead, 'revision')}
      && !${root}.child('sharedOperations').child(${opId}).exists()`, ...fields(headKeys) };
  const resultHead = 'newData.parent().parent().child(\'sharedHead\')';
  const sharedOperations = { $operation: { '.read': manager,
    '.write': `${editing} && !data.exists() && newData.exists() && ${v(resultHead, 'operationId')} === $operation`,
    '.validate': `newData.hasChildren(${JSON.stringify(resultKeys)}) && ${scope('newData')} && ${v('newData', 'schemaVersion')} === 1
      && ${v('newData', 'operationId')} === $operation && ${v('newData', 'referenceId')} === $operation
      && ${v('newData', 'generation')} === $operation && ${v('newData', 'resultRevision')} === ${v(resultHead, 'revision')}
      && ${v('newData', 'baseLayoutGeneration')} === ${v(resultHead, 'baseLayoutGeneration')}
      && ${v('newData', 'baseLayoutRevision')} === ${v(resultHead, 'baseLayoutRevision')}
      && ${v('newData', 'inputDigest')} === ${v(dm, 'inputDigest')}
      && ${v('newData', 'humanUid')} === ${v(own, 'humanUid')} && ${v('newData', 'deviceUid')} === auth.uid
      && ${v('newData', 'committedAt')} === now`, ...fields(resultKeys) } };
  const imagePost = 'newData.parent().parent().parent().parent().parent()';
  const imageReference = `${imagePost}.child('references').child($reference)`;
  const pinnedImage = `${root}.child('sharedDrafts').child($reference).child('images').child($slot)`;
  const imageReferences = { '.read': manager, '.write': false, $bank: { $reference: {
    '.write': `${editing} && !data.exists() && newData.val() === true
      && ${v(imageReference, 'active')} === true && ${v(imageReference, 'deviceUid')} === auth.uid
      && ${v(pinnedImage, 'active')} === true && ${v(pinnedImage, 'bank')} === $bank`,
  } } };
  const retainedImageRead = `${manager} && data.parent().parent().child('references').child($bank).hasChildren()`;
  return { seatRules: { generations: { $generation: generationRules }, sharedDrafts, references, sharedHead, sharedOperations },
    imageReferences, retainedImageRead };
}
