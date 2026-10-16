import fs from 'node:fs';import {generated as original} from '../GD91-107/generate.mjs';import {capacityPolicy,maxParts,maxSections} from './capacity-policy.mjs';
const value=(n,p)=>`${n}.child('${p}').val()`;
export function generated(){
 const rules=original(),run=rules.rules.checks.$run,g=run.generations.$generation;
 const within=n=>`${value(n,'meta/expectedParts')} <= ${maxParts} && ${value(n,'meta/expectedSections')} <= ${maxSections} && ${value(n,'meta/sectionCellTotal')} <= ${capacityPolicy.maxCells} && ${value(n,'meta/receivedCells')} <= ${capacityPolicy.maxCells}`;
 g['.validate']+=` && (newData.child('meta/schemaVersion').val() !== 2 || newData.child('meta/phase').val() === 'deleting' || newData.child('meta/phase').val() === 'deleted' || (${within('newData')}))`;
 for(const name of['head','sharedHead']){
  const changed=['generation','revision','operationId'].map(k=>`${value('newData',name+'/'+k)} !== ${value('data',name+'/'+k)}`).join(' || '),candidate=`newData.child('generations').child(${value('newData',name+'/generation')})`;
  run['.validate']+=` && (!newData.child('${name}').exists() || !(${changed}) || ${value(candidate,'meta/schemaVersion')} !== 2 || (${within(candidate)}))`;
 }
 return rules;
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/GD91-110/generate.mjs')){fs.writeFileSync(new URL('database.rules.json',import.meta.url),JSON.stringify(generated(),null,2)+'\n');for(const f of['deny.rules.json','firebase.json'])fs.copyFileSync(new URL('../GD91-107/'+f,import.meta.url),new URL(f,import.meta.url));console.log(JSON.stringify({maxCells:capacityPolicy.maxCells,maxParts,maxSections}));}
