import assert from 'node:assert/strict';
export function createBudget({initial=18,limit=300,reserve=60,enforce=true}={}) {
  let calls=initial, stopped=false; const byKind={}, paths={};
  return {
    count(kind,path='') {
      if(enforce&&calls>=limit-reserve) {stopped=true;throw Object.assign(new Error('application-budget'),{code:'APPLICATION_BUDGET'});}
      calls++;byKind[kind]=(byKind[kind]??0)+1;
      const key=kind+':'+path;paths[key]=(paths[key]??0)+1;
    },
    summary:()=>({calls,initial,limit,reserve,enforce,stopped,byKind,paths})
  };
}
