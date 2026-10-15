import {base, recentManager, manager} from '../GD91-84/auth-rules.mjs';
const v=(n,p)=>`${n}.child('${p}').val()`;

export function addCollection(rules){
  const g=rules.rules.checks.$run.generations.$generation;
  const source=`${base}.child('generations').child($generation)`;
  const gc=`${recentManager} && ${source}.child('meta/phase').val() === 'deleting' && !${source}.child('refs').hasChildren() && ${base}.child('head/generation').val() !== $generation && ${base}.child('sharedHead/generation').val() !== $generation`;
  g.sections.$section['.write']=`(${g.sections.$section['.write']}) || (${gc} && !newData.exists())`;
  g.sectionOrder.$order['.write']=`(${g.sectionOrder.$order['.write']}) || (${gc} && !newData.exists() && !newData.parent().parent().child('sections').child(data.val()).exists())`;
  g.indexes['.read']=manager;
  g.indexes['.write']=`${gc} && !newData.exists()`;
  g.parts.$part['.write']=`(${g.parts.$part['.write']}) && (newData.exists() || data.parent().parent().child('meta/schemaVersion').val() !== 2 || !newData.parent().parent().child('indexes').exists())`;
  g['.validate']+=` && (newData.child('meta/phase').val() !== 'deleted' || (!newData.child('indexes').exists() && !newData.child('sectionOrder').exists()))`;
  return rules;
}
