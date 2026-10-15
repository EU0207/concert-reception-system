import {base, recentManager, manager} from '../GD91-84/auth-rules.mjs';

const v = (n,p) => `${n}.child('${p}').val()`;
const fields = ['candidateGeneration','sourceGeneration','sourceHeadRevision','sourceEventRevision','sourceControlRevision','deviceUid','publicationOperationId','cursor','phase'];
const eventRevision = `${base}.child('event/commit/revision').val()`;
const sourceFence = n => [
  `${v(n,'sourceGeneration')} === (${base}.child('head/generation').exists() ? ${base}.child('head/generation').val() : 'none')`,
  `${v(n,'sourceHeadRevision')} === (${base}.child('head/revision').exists() ? ${base}.child('head/revision').val() : 0)`,
  `${v(n,'sourceEventRevision')} === (${eventRevision} === null ? 0 : ${eventRevision})`,
  `${v(n,'sourceControlRevision')} === ${base}.child('control/revision').val()`
].map(x=>'('+x+')').join(' && ');

export function addPublicationChecks(rules) {
  const run=rules.rules.checks.$run;
  const source=`${base}.child('generations').child(${v('newData','sourceGeneration')})`;
  const candidate=`${base}.child('generations').child(${v('newData','candidateGeneration')})`;
  const oldPart=`${source}.child('parts').child('p'+${v('data','cursor')})`;
  const record='newData.parent().parent()';
  const old=`${base}.child('generations').child(${v(record,'sourceGeneration')}).child('parts').child('p'+(${v(record,'cursor')}-1)).child('slots').child($slot)`;
  const person=`${base}.child('event/seats').child(${v(old,'seatId')}).child('personId')`;
  const target=`${base}.child('generations').child(${v(record,'candidateGeneration')})`;
  const index=`${target}.child('ids').child(${v(old,'seatId')})`;
  const next=`${target}.child('parts').child(${v(index,'part')}).child('slots').child(${v(index,'slot')})`;
  const same=['id','cellId','row','column','kind','sectionId','lineId','label','seatId','numberingMode','prefix','number','manualNumber','consumedNumber','category','usable','reservedLabel','emergencyChange/kind','emergencyChange/reason'].map(f=>`${v(next,f)} === ${v(old,f)}`).join(' && ');
  const checks=Array.from({length:16},(_,i)=>`newData.child('slots/s${String(i).padStart(2,'0')}').val() === newData.child('cursor').val()`);
  const sourceParts=`(${v('newData','sourceGeneration')} === 'none' ? 0 : ${source}.child('meta/expectedParts').val())`;
  const immutable=fields.filter(x=>!['cursor','phase'].includes(x)).map(f=>`${v('newData',f)} === ${v('data',f)}`).join(' && ');
  const initial=`!data.exists() && ${v('newData','cursor')} === 0 && ${v('newData','phase')} === 'checking' && (${v('newData','sourceGeneration')} !== 'none' ? ${source}.child('meta/schemaVersion').val() === 2 : !${base}.child('event/people').hasChildren())`;
  const advance=`data.exists() && (${immutable}) && ${v('data','phase')} === 'checking' && ((${v('newData','phase')} === 'checking' && ${v('newData','cursor')} === ${v('data','cursor')}+1 && ${v('data','cursor')} < ${sourceParts} && ${oldPart}.exists() && ${checks.join(' && ')}) || (${v('newData','phase')} === 'checked' && ${v('newData','cursor')} === ${v('data','cursor')} && ${v('data','cursor')} === ${sourceParts}))`;
  const persistedOperation=`${base}.child('operations').child(${v('newData','publicationOperationId')})`;
  const done=`data.exists() && (${immutable}) && ${v('newData','cursor')} === ${v('data','cursor')} && ((${v('newData','phase')} === 'cancelled' && !${persistedOperation}.exists() && (${v('data','phase')} === 'checking' || ${v('data','phase')} === 'checked')) || (${v('newData','phase')} === 'published' && ${v('data','phase')} === 'checked' && ${v(persistedOperation,'publicationCheckId')} === $check && ${v(persistedOperation,'generation')} === ${v('newData','candidateGeneration')} && ${v(persistedOperation,'resultRevision')} === ${v('newData','sourceHeadRevision')}+1))`;
  const pin=`newData.parent().parent().child('generations').child(${v('newData','candidateGeneration')}).child('refs').child('publication-'+$check)`;
  run.publicationChecks={$check:{'.read':manager,
    '.write':`${recentManager} && newData.exists() && ${base}.child('control/layoutSchemaVersion').val() === 2 && ${v('newData','deviceUid')} === auth.uid && ${candidate}.child('meta/schemaVersion').val() === 2 && ${candidate}.child('meta/kind').val() === 'layout' && ${candidate}.child('meta/phase').val() === 'ready' && (((${sourceFence('newData')}) && ((${initial}) || (${advance}))) || (${done}))`,
    '.validate':`newData.hasChildren(${JSON.stringify(fields)}) && ((${v('newData','phase')} === 'checking' || ${v('newData','phase')} === 'checked') ? ${pin}.val() === true : !${pin}.exists())`,
    ...Object.fromEntries(fields.map(f=>[f,{'.validate':true}])),
    publicationOperationId:{'.validate':'newData.isString() && newData.val().matches(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)'},
    slots:{$slot:{'.validate':`$slot.matches(/^s(0[0-9]|1[0-5])$/) && newData.val() === ${v(record,'cursor')} && (${v(record,'phase')} !== 'checking' || ${v(old,'kind')} !== 'seat' || !${person}.exists() || ${person}.val() === 'none' || (${same}))`}},
    '$other':{'.validate':false}}};
  const ref=run.generations.$generation.refs.$ref, path="newData.parent().parent().parent().parent()", proof=`${path}.child('publicationChecks').child($ref.replace('publication-',''))`;
  const ownProof=`$ref.matches(/^publication-[a-f0-9-]{36}$/) && ${v(proof,'candidateGeneration')} === $generation && ${v(proof,'deviceUid')} === auth.uid`;
  const refCheck=`(${ownProof}) && (newData.val() === true ? (${v(proof,'phase')} === 'checking' || ${v(proof,'phase')} === 'checked') : !newData.exists() && (${v(proof,'phase')} === 'published' || ${v(proof,'phase')} === 'cancelled'))`;
  ref['.write']=`$ref.matches(/^publication-[a-f0-9-]{36}$/) ? (${recentManager} && (${refCheck})) : (${ref['.write']})`;
  ref['.validate']=`(${ref['.validate']}) || (${refCheck})`;
  run.head.publicationCheckId={'.validate':'newData.isString()'};
  run.operations.$op.publicationCheckId={'.validate':'newData.isString()'};
  const check=`newData.child('publicationChecks').child(newData.child('head/publicationCheckId').val())`;
  const op=`newData.child('operations').child(newData.child('head/operationId').val())`;
  const changed=['generation','revision','operationId'].map(f=>`${v('newData','head/'+f)} !== ${v('data','head/'+f)}`).join(' || ');
  const complete=[`${v(check,'phase')} === 'checked'`,`${v(check,'candidateGeneration')} === ${v('newData','head/generation')}`,`${v(check,'deviceUid')} === auth.uid`,`${v(check,'publicationOperationId')} === ${v('newData','head/operationId')}`,`${v(op,'publicationCheckId')} === ${v('newData','head/publicationCheckId')}`,sourceFence(check),`${v(check,'sourceEventRevision')} === (newData.child('event/commit/revision').exists() ? newData.child('event/commit/revision').val() : 0)`,`${v(check,'sourceControlRevision')} === newData.child('control/revision').val()`].map(x=>'('+x+')').join(' && ');
  run['.validate']=`(${run['.validate']}) && (${base}.child('control/layoutSchemaVersion').val() !== 2 || ((${changed}) ? (${complete}) : ${v('newData','head/publicationCheckId')} === ${v('data','head/publicationCheckId')}))`;
  return rules;
}
