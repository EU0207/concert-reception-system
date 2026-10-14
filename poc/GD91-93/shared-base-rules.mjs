import {base} from '../GD91-84/auth-rules.mjs';
export function addSharedBase(rules){
 const run=rules.rules.checks.$run,shared=run.sharedHead,operation=run.sharedOperations.$op;
 shared['.validate']=`(${shared['.validate']}) && newData.child('baseLayoutGeneration').isString() && newData.child('baseLayoutGeneration').val() === ${base}.child('head/generation').val() && ${base}.child('generations').child(newData.child('baseLayoutGeneration').val()).child('meta/phase').val() === 'ready' && newData.parent().child('sharedOperations').child(newData.child('operationId').val()).child('baseLayoutGeneration').val() === newData.child('baseLayoutGeneration').val()`;
 shared.baseLayoutGeneration={'.validate':'newData.isString()'};
 operation['.validate']=`(${operation['.validate']}) && newData.child('baseLayoutGeneration').isString() && newData.child('baseLayoutGeneration').val() === newData.parent().parent().child('sharedHead/baseLayoutGeneration').val()`;
 operation.baseLayoutGeneration={'.validate':'newData.isString()'};
 const generation=run.generations.$generation;
 generation['.validate']=`(${generation['.validate']}) && (!(newData.child('meta/phase').val() === 'deleting' && data.child('meta/phase').val() !== 'deleting') || ${base}.child('sharedHead/baseLayoutGeneration').val() !== $generation)`;
 return rules;
}
