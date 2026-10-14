import {base, editing, manager, activeRead} from '../GD91-84/auth-rules.mjs';

const value = (n, p) => `${n}.child('${p}').val()`;
const integer = (n, min = 0, max = 9007199254740991) => `${n}.isNumber() && ${n}.val() % 1 === 0 && ${n}.val() >= ${min} && ${n}.val() <= ${max}`;
const text = (n, max, min = 0) => `${n}.isString() && ${n}.val().length >= ${min} && ${n}.val().length <= ${max}`;
const allowed = names => Object.fromEntries([...names.map(n => [n, {'.validate': true}]), ['$other', {'.validate': false}]]);
const uuid = n => `${n}.isString() && ${n}.val().matches(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)`;
const same = (a, b, fields) => fields.map(f => `${value(a, f)} === ${value(b, f)}`).join(' && ');

export function addLayoutContracts(rules) {
  const run = rules.rules.checks.$run, g = run.generations.$generation;
  const source = `${base}.child('generations').child($generation)`;
  const full = `${source}.child('meta/schemaVersion').val() === 2`;
  const building = `${editing} && ${source}.child('meta/phase').val() === 'building'`;
  const current = `${base}.child('head/generation').val() === $generation`;
  const readable = `${manager} || (${activeRead} && ${current})`;
  const meta = 'newData.child(\'meta\')', old = 'data.child(\'meta\')';
  const fields = ['schemaVersion', 'expectedSections', 'sectionCursor', 'lastSection', 'sectionCellTotal', 'receivedCells'];
  for (const f of fields) g.meta[f] = {'.validate': true};
  g.meta['.validate'] += " && (!newData.child('schemaVersion').exists() || (newData.child('kind').val() === 'layout' && $generation.matches(/^[A-Za-z0-9_-]{1,64}$/)))";
  const totalsSame = same(meta, old, fields.filter(x => x !== 'receivedCells'));
  const totalsAllSame = same(meta, old, fields);
  const section = `newData.child('sections').child(${value(meta, 'lastSection')})`;
  const sectionAdded = `${value(meta, 'cursor')} === ${value(old, 'cursor')} && ${value(meta, 'sectionCursor')} === ${value(old, 'sectionCursor')} + 1 && !data.child('sections').child(${value(meta, 'lastSection')}).exists() && newData.child('sectionOrder').child('s'+${value(old, 'sectionCursor')}).val() === ${value(meta, 'lastSection')} && ${value(meta, 'sectionCellTotal')} === ${value(old, 'sectionCellTotal')} + ${value(section, 'rows')} * ${value(section, 'columns')} && ${value(meta, 'receivedCells')} === ${value(old, 'receivedCells')} && ${value(meta, 'schemaVersion')} === 2 && ${value(meta, 'expectedSections')} === ${value(old, 'expectedSections')}`;
  const partAdded = `(${totalsSame}) && ${value(meta, 'cursor')} === ${value(old, 'cursor')} + 1 && ${value(meta, 'receivedCells')} === ${value(old, 'receivedCells')} + newData.child('parts').child(${value(meta, 'lastPart')}).child('count').val()`;
  const shape = [`${value(meta, 'schemaVersion')} === 2`, integer(meta + ".child('expectedParts')", 1), integer(meta + ".child('cursor')"), integer(meta + ".child('expectedSections')", 1), integer(meta + ".child('sectionCursor')"), integer(meta + ".child('sectionCellTotal')"), integer(meta + ".child('receivedCells')"), `${value(meta, 'sectionCursor')} <= ${value(meta, 'expectedSections')}`, `${value(meta, 'receivedCells')} <= ${value(meta, 'sectionCellTotal')}`].map(x => '(' + x + ')').join(' && ');
  const initial = `${value(meta, 'sectionCursor')} === 0 && ${value(meta, 'sectionCellTotal')} === 0 && ${value(meta, 'receivedCells')} === 0 && ${value(meta, 'lastSection')} === ''`;
  g['.validate'] = `(${g['.validate']}) && (${value(meta, 'kind')} !== 'layout' || (${base}.child('control/layoutSchemaVersion').val() === 2 ? (${shape} && (!data.exists() ? (${initial}) : ((${totalsAllSame}) || (${sectionAdded}) || (${partAdded}))) && (${value(meta, 'phase')} !== 'ready' || (${value(meta, 'sectionCursor')} === ${value(meta, 'expectedSections')} && ${value(meta, 'receivedCells')} === ${value(meta, 'sectionCellTotal')}))) : !${meta}.child('schemaVersion').exists()))`;

  const s = g.sections.$section, oldSectionWrite = s['.write'];
  s['.write'] = `((${full}) && ${building} && !data.exists() && newData.exists()) || (!(${full}) && (${oldSectionWrite}))`;
  const sectionShape = ["newData.hasChildren(['name','displayOrder','rows','columns','axis','seatOrder','stagePosition','lines','lineIndices'])", text("newData.child('name')", 100, 1), integer("newData.child('rows')", 1), integer("newData.child('columns')", 1), integer("newData.child('displayOrder')"), "(newData.child('axis').val() === 'horizontal' || newData.child('axis').val() === 'vertical')", "(newData.child('seatOrder').val() === 'forward' || newData.child('seatOrder').val() === 'reverse')", "(newData.child('stagePosition').val() === 'left' || newData.child('stagePosition').val() === 'top')", "(!newData.child('floorId').exists() || " + text("newData.child('floorId')", 64, 1) + ')', "newData.parent().parent().child('meta/lastSection').val() === $section", "newData.parent().parent().child('sectionOrder').child('s'+newData.child('displayOrder').val()).val() === $section"].map(x => '(' + x + ')').join(' && ');
  s['.validate'] = `(${full}) ? (${sectionShape}) : (${s['.validate']})`;
  s['.validate'] = `(${s['.validate']}) && (!(${full}) || $section.matches(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/))`;
  Object.assign(s, allowed(['name','displayOrder','rows','columns','axis','seatOrder','stagePosition','floorId','lines','lineIndices']));
  const lineSection = 'newData.parent().parent()', lineCount = `(${value(lineSection, 'axis')} === 'horizontal' ? ${value(lineSection, 'rows')} : ${value(lineSection, 'columns')})`;
  s.lines = {$line: {
    '.validate': `newData.hasChildren(['lineId','index','name','prefix','startNumber','nextAutomaticNumber']) && (${uuid("newData.child('lineId')")}) && newData.child('lineId').val() === $line && (${integer("newData.child('index')")}) && ${value('newData', 'index')} < ${lineCount} && (${text("newData.child('name')",64,1)}) && (${text("newData.child('prefix')",64)}) && (${integer("newData.child('startNumber')",1)}) && (${integer("newData.child('nextAutomaticNumber')",1)}) && ${value('newData','nextAutomaticNumber')} >= ${value('newData','startNumber')} && ${lineSection}.child('lineIndices').child('i'+${value('newData','index')}).val() === $line`,
    ...allowed(['lineId','index','name','prefix','startNumber','nextAutomaticNumber'])
  }};
  s.lineIndices = {$index: {'.validate': `newData.isString() && $index === 'i'+newData.parent().parent().child('lines').child(newData.val()).child('index').val()`}};
  g.sectionOrder = {$order: {'.read': readable, '.write': `${building} && !data.exists() && newData.exists()`, '.validate': `$order === 's'+newData.parent().parent().child('sections').child(newData.val()).child('displayOrder').val() && newData.parent().parent().child('meta/sectionCursor').val() === ${source}.child('meta/sectionCursor').val()+1`}};

  const slot = g.parts.$part.slots.$slot, gn = 'newData.parent().parent().parent().parent()';
  const sc = `${gn}.child('sections').child(${value('newData','sectionId')})`, line = `${sc}.child('lines').child(${value('newData','lineId')})`;
  const point = index => `${index}.child('part').val() === $part && ${index}.child('slot').val() === $slot`;
  const extraFields = ['cellId','row','column','seatId','consumedNumber','numberingMode','prefix','number','manualNumber','displayOrder','category','usable','reservedLabel','emergencyChange'];
  const physical = [uuid("newData.child('id')"), uuid("newData.child('cellId')"), integer("newData.child('row')"), integer("newData.child('column')"), `${value('newData','row')} < ${value(sc,'rows')}`, `${value('newData','column')} < ${value(sc,'columns')}`, `${value(line,'index')} === (${value(sc,'axis')} === 'horizontal' ? ${value('newData','row')} : ${value('newData','column')})`, point(`${gn}.child('indexes/cells').child(${value('newData','cellId')})`), point(`${gn}.child('indexes/coordinates').child(${value('newData','sectionId')}).child('r'+${value('newData','row')}+'c'+${value('newData','column')})`)];
  const consumed = `(${value('newData','numberingMode')} === 'automatic' ? ${value('newData','number')} : ${value('newData','consumedNumber')})`;
  physical.push(`(!newData.child('consumedNumber').exists() || newData.child('kind').val() === 'gap' || (newData.child('kind').val() === 'seat' && newData.child('numberingMode').val() === 'manual'))`);
  physical.push(`newData.child('kind').val() !== 'seat' || newData.child('cellId').val() !== newData.child('seatId').val()`);
  physical.push(`(newData.child('kind').val() !== 'gap' && !newData.child('consumedNumber').exists() && newData.child('numberingMode').val() !== 'automatic') || (${consumed} >= ${value(line,'startNumber')} && ${consumed} < ${value(line,'nextAutomaticNumber')} && ${consumed} % 1 === 0 && ${point(`${gn}.child('indexes/numbers').child(${value('newData','sectionId')}).child(${value('newData','lineId')}).child('n'+${consumed})`)})`);
  const seat = ["newData.hasChildren(['seatId','numberingMode','displayOrder','category','usable'])", `${value('newData','seatId')} === ${value('newData','id')}`, integer("newData.child('displayOrder')"), "(newData.child('category').val() === 'general' || newData.child('category').val() === 'reserved' || newData.child('category').val() === 'special')", "newData.child('usable').isBoolean()", `(${value('newData','numberingMode')} === 'automatic' ? (${integer("newData.child('number')",1)} && ${value('newData','prefix')} === ${value(line,'prefix')} && ${value('newData','label')} === ${value('newData','prefix')}+${value('newData','number')} && !newData.child('manualNumber').exists() && !newData.child('consumedNumber').exists()) : (${value('newData','numberingMode')} === 'manual' && ${value('newData','label')} === ${value('newData','manualNumber')} && !newData.child('prefix').exists() && !newData.child('number').exists()))`, `(!newData.child('reservedLabel').exists() || (${text("newData.child('reservedLabel')",100)}))`];
  const nonSeat = extraFields.filter(x => !['cellId','row','column','consumedNumber'].includes(x)).map(x=>`!newData.child('${x}').exists()`);
  physical.push(`${value('newData','kind')} === 'seat' ? (${seat.map(x=>'('+x+')').join(' && ')}) : (${value('newData','id')} === ${value('newData','cellId')} && ${nonSeat.join(' && ')})`);
  const legacy = slot['.validate'];
  slot['.validate'] = `(${legacy}) && (${value(gn,'meta/schemaVersion')} === 2 ? (${physical.map(x=>'('+x+')').join(' && ')}) : (${extraFields.map(x=>`!newData.child('${x}').exists()`).join(' && ')}))`;
  g.parts.$part['.validate'] += ` && (!(${full}) || newData.child('count').val() <= 16)`;
  Object.assign(slot, Object.fromEntries(extraFields.map(x=>[x,{'.validate':true}])));
  slot.emergencyChange = {'.validate': "newData.hasChildren(['kind','reason']) && (newData.child('kind').val() === 'add' || newData.child('kind').val() === 'number' || newData.child('kind').val() === 'position') && newData.child('reason').isString() && newData.child('reason').val().length > 0 && newData.child('reason').val().length <= 200", ...allowed(['kind','reason'])};

  function index(depth, match) {
    const n = 'newData' + '.parent()'.repeat(depth), p = `${n}.child('parts').child(${value('newData','part')}).child('slots').child(${value('newData','slot')})`;
    return {'.write': `${building} && (${full}) && !data.exists() && newData.exists()`, '.validate': `newData.hasChildren(['part','slot']) && (${match(p)}) && ${n}.child('parts').child(${value('newData','part')}).child('index').val() === ${source}.child('meta/cursor').val()`, ...allowed(['part','slot'])};
  }
  g.indexes = {
    cells: {$cell: index(3,p=>`${value(p,'cellId')} === $cell`)},
    coordinates: {$section: {$coordinate: index(4,p=>`${value(p,'sectionId')} === $section && $coordinate === 'r'+${value(p,'row')}+'c'+${value(p,'column')}`)}},
    numbers: {$section: {$line: {$number: index(5,p=>`${value(p,'sectionId')} === $section && ${value(p,'lineId')} === $line && $number === 'n'+(${value(p,'numberingMode')} === 'automatic' ? ${value(p,'number')} : ${value(p,'consumedNumber')})`)}}},
    '$other': {'.validate':false}
  };
  return rules;
}
