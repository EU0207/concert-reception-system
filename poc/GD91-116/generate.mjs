import {generated as original} from '../GD91-113/generate.mjs';
import {limits} from './policy.mjs';
const v=(node,path)=>`${node}.child('${path}').val()`;
export function generated(){
 const rules=original(),run=rules.rules.checks.$run,g=run.generations.$generation;
 const collecting=node=>`(${v(node,'meta/phase')} === 'deleting' || ${v(node,'meta/phase')} === 'deleted')`;
 g['.validate']+=` && (newData.child('meta/schemaVersion').val() !== 2 || ${collecting('newData')} || ${v('newData','meta/expectedSections')} <= ${limits.maxSections})`;
 const section=g.sections.$section,lineCount=node=>`(${v(node,'axis')} === 'horizontal' ? ${v(node,'rows')} : ${v(node,'columns')})`;
 section['.validate']+=` && (newData.parent().parent().child('meta/schemaVersion').val() !== 2 || ${collecting('newData.parent().parent()')} || ${lineCount('newData')} <= ${limits.maxNumberingLines})`;
 for(const head of ['head','sharedHead']){
  const changed=['generation','revision','operationId'].map(k=>`${v('newData',head+'/'+k)} !== ${v('data',head+'/'+k)}`).join(' || ');
  const candidate=`newData.child('generations').child(${v('newData',head+'/generation')})`;
  const bound=[`${v(candidate,'meta/expectedSections')} <= ${limits.maxSections}`];
  for(let i=0;i<limits.maxSections;i++){
   const sectionNode=`${candidate}.child('sections').child(${v(candidate,'sectionOrder/s'+i)})`;
   bound.push(`(${v(candidate,'meta/expectedSections')} <= ${i} || ${lineCount(sectionNode)} <= ${limits.maxNumberingLines})`);
  }
  run['.validate']+=` && (!newData.child('${head}').exists() || !(${changed}) || ${v(candidate,'meta/schemaVersion')} !== 2 || (${bound.join(' && ')}))`;
 }
 return rules;
}
