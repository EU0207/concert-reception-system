// 固定5枠・2バンクの画像準備と公開を分け、現在認可・版と不変結果を一体で検査する。

import { validPerformanceCalendar } from './performance-calendar-rules.mjs';

/** 指定した子の値を参照するRules式を作る。 */
const value = (node, path) => `${node}.child('${path}').val()`;

/** 必須項目以外を拒否する、検証済みレコードの子規則を作る。 */
function fields(keys) {
  return { ...Object.fromEntries(keys.map((key) => [key, { '.validate': true }])), $other: { '.validate': false } };
}

/** 対象公演の所属を検査する式を作る。 */
function scope(node) {
  return `${value(node, 'environmentId')} === $environmentId && ${value(node, 'performanceId')} === $performanceId`;
}

/** 許可したフィールドすべてが変更されていないことを確認する。 */
function same(before, after, keys) {
  return keys.map((key) => `${value(before, key)} === ${value(after, key)}`).join(' && ');
}

/** 現行バンクの保護、非公開準備と原容量検査、公開先と結果の一体更新を組み立てる。 */
export function venueImageRules({ root, manager, preparedAuthorization, integer }) {
  const slot = `${root}.child('images').child($slot)`;
  const oldHead = `${slot}.child('head')`;
  const head = "newData.child('head')";
  const slotAllowed = "$slot.matches(/^[0-4]$/)";
  const bankAllowed = "($bank === 'a' || $bank === 'b')";
  const revision = `(${oldHead}.exists() ? ${value(oldHead, 'revision')} : 0)`;
  const controlRevision = value(root, 'control/controlRevision');
  const editing = `(${manager} && ${validPerformanceCalendar(root, integer)}
    && ${integer(controlRevision, 1)} && ${value(root, 'control/businessSchemaVersion')} === 3
    && ${value(root, 'control/layoutSchemaVersion')} === 2
    && ${value(root, 'control/state')} === 'preparing'
    && !${root}.child('control/firstReceptionStartedAt').exists()
    && now < ${value(root, 'control/calendar/dayStartsAt')})`;
  const reading = `(${preparedAuthorization()} && (${manager}
    || ${value(root, 'control/state')} === 'preparing' || ${value(root, 'control/state')} === 'operating'
    || ${value(root, 'control/state')} === 'stopped'))`;
  const headKeys = ['environmentId', 'performanceId', 'schemaVersion', 'revision', 'active', 'bank', 'operationId', 'sha256'];
  const bankKeys = ['environmentId', 'performanceId', 'schemaVersion', 'expectedRevision', 'revision', 'operationId', 'mime', 'rawBytes', 'base64', 'sha256'];
  const operationKeys = ['environmentId', 'performanceId', 'schemaVersion', 'kind', 'slot', 'revision', 'bank', 'sha256', 'committedAt', 'controlRevision', 'humanUid', 'deviceUid'];
  const uuid = "newData.child('operationId').isString() && newData.child('operationId').val().matches(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)";
  const operation = `newData.child('operations').child(${value(head, 'operationId')})`;
  const prepared = `${slot}.child('banks').child(${value(head, 'bank')})`;
  const afterBank = `newData.child('banks').child(${value(head, 'bank')})`;
  const publish = `${value(operation, 'kind')} === 'publish' && ${prepared}.exists()
    && ${value(prepared, 'expectedRevision')} === ${revision}
    && ${value(prepared, 'revision')} === ${value(head, 'revision')}
    && ${value(prepared, 'operationId')} === ${value(head, 'operationId')}
    && ${value(prepared, 'sha256')} === ${value(head, 'sha256')}
    && (${same(prepared, afterBank, bankKeys)})
    && (${value(oldHead, 'active')} !== true || ${value(head, 'bank')} !== ${value(oldHead, 'bank')})`;
  const transition = `${value(head, 'revision')} === ${revision} + 1
    && newData.parent().parent().child('control/controlRevision').val() === ${controlRevision} + 1
    && ${operation}.exists() && !${slot}.child('operations').child(${value(head, 'operationId')}).exists()
    && ${value(operation, 'revision')} === ${value(head, 'revision')}
    && ${value(operation, 'bank')} === ${value(head, 'bank')}
    && ${value(operation, 'sha256')} === ${value(head, 'sha256')}
    && ${value(operation, 'controlRevision')} === ${controlRevision} + 1
    && (${value(head, 'active')} === true ? (${publish}) :
      (${value(operation, 'kind')} === 'remove' && ${value(oldHead, 'active')} === true))`;
  const base64 = "newData.child('base64').val()";
  const decodedLength = `(${base64}.length / 4 * 3 - (${base64}.matches(/.*==$/) ? 2 : (${base64}.matches(/.*=$/) ? 1 : 0)))`;
  const notCurrent = `!(${value(oldHead, 'active')} === true && ${value(oldHead, 'bank')} === $bank)`;
  // 参照の登録・解除は保存・バックアップ側へ渡す。未実装のうちは既定拒否で、端末から消して回収を迂回させない。
  const unreferenced = `!${slot}.child('references').child($bank).exists()`;
  const knownHead = `(!${oldHead}.exists() || (${value(oldHead, 'schemaVersion')} === 1 && ${scope(oldHead)}
    && ${oldHead}.child('active').isBoolean() && ${integer(value(oldHead, 'revision'), 1)}))`;

  // 公開直前の準備確認を失効させるため、画像公開と同じ更新で公演管理版も進める。
  const changedSlots = Array.from({ length: 5 }, (_, chosen) => {
    const post = 'newData.parent().parent()';
    return Array.from({ length: 5 }, (_, index) => {
      const before = `${root}.child('images/${index}/head')`;
      const after = `${post}.child('images/${index}/head')`;
      const oldRevision = `(${before}.exists() ? ${value(before, 'revision')} : 0)`;

      return index === chosen ? `${value(after, 'revision')} === ${oldRevision} + 1` : `(${same(before, after, headKeys)})`;
    }).join(' && ');
  });
  const controlRevisionWrite = `${editing} && newData.val() === ${controlRevision} + 1
    && (${changedSlots.map((condition) => `(${condition})`).join(' || ')})`;

  return { controlRevisionWrite, images: { $slot: {
    '.validate': `(${same(oldHead, head, headKeys)}) || (${transition})`,
    head: {
      '.read': `${slotAllowed} && ${reading}`,
      '.write': `${slotAllowed} && ${knownHead} && ${editing} && newData.exists()`,
      '.validate': `newData.hasChildren(${JSON.stringify(headKeys)}) && ${scope('newData')}
        && newData.child('schemaVersion').val() === 1 && ${uuid}
        && newData.child('revision').isNumber() && ${integer(value('newData', 'revision'), 1)}
        && newData.child('active').isBoolean() && newData.child('sha256').isString()
        && (newData.child('active').val() === true ?
          ((newData.child('bank').val() === 'a' || newData.child('bank').val() === 'b') && newData.child('sha256').val().matches(/^[a-f0-9]{64}$/)) :
          (newData.child('bank').val() === '' && newData.child('sha256').val() === ''))`,
      ...fields(headKeys),
    },
    banks: { $bank: {
      '.read': `${slotAllowed} && ${bankAllowed} && ${reading}
        && ${value(oldHead, 'active')} === true && ${value(oldHead, 'bank')} === $bank
        && data.child('revision').val() === ${value(oldHead, 'revision')}
        && data.child('sha256').val() === ${value(oldHead, 'sha256')}`,
      '.write': `${slotAllowed} && ${bankAllowed} && ${knownHead} && ${notCurrent} && ${unreferenced}
        && (!newData.exists() ? (${manager} && (!data.exists() || (data.child('schemaVersion').val() === 1 && ${scope('data')}))) :
          (${editing} && newData.child('expectedRevision').val() === ${revision}
          && newData.child('revision').val() === ${revision} + 1
          && !${slot}.child('operations').child(newData.child('operationId').val()).exists()
          && (!data.exists() || (${same('data', 'newData', bankKeys)}))))`,
      '.validate': `newData.hasChildren(${JSON.stringify(bankKeys)}) && ${scope('newData')}
        && newData.child('schemaVersion').val() === 1 && ${uuid}
        && newData.child('expectedRevision').isNumber() && ${integer(value('newData', 'expectedRevision'), 0)}
        && newData.child('revision').isNumber() && ${integer(value('newData', 'revision'), 1)}
        && (newData.child('mime').val() === 'image/png' || newData.child('mime').val() === 'image/jpeg')
        && newData.child('rawBytes').isNumber() && ${integer(value('newData', 'rawBytes'), 1)}
        && newData.child('rawBytes').val() <= 1000000 && newData.child('base64').isString()
        && ${base64}.length <= 1333336 && ${base64}.length % 4 === 0
        && ${base64}.matches(/^[A-Za-z0-9+\\/]*={0,2}$/)
        && (!${base64}.matches(/.*=$/) || ${base64}.matches(/.*[AEIMQUYcgkosw048]=$/) || ${base64}.matches(/.*[AQgw]==$/))
        && ${decodedLength} === newData.child('rawBytes').val()
        && newData.child('sha256').isString() && newData.child('sha256').val().matches(/^[a-f0-9]{64}$/)`,
      ...fields(bankKeys),
    } },
    operations: { $operationId: {
      '.read': `${slotAllowed} && ${manager}`,
      '.write': `${slotAllowed} && ${editing} && !data.exists() && newData.exists()
        && newData.parent().parent().child('head/operationId').val() === $operationId
        && ${value(oldHead, 'operationId')} !== $operationId`,
      '.validate': `newData.hasChildren(${JSON.stringify(operationKeys)}) && ${scope('newData')}
        && newData.child('schemaVersion').val() === 1 && newData.child('slot').val() === $slot
        && newData.child('humanUid').val() === ${root}.child('sessions').child(auth.uid).child('humanUid').val()
        && newData.child('deviceUid').val() === auth.uid
        && newData.child('committedAt').val() === now`,
      ...fields(operationKeys),
    } },
    references: { '.read': manager, '.write': false },
    $other: { '.validate': false },
  } } };
}
