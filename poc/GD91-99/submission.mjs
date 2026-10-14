import assert from 'node:assert/strict';
const stable=value=>JSON.stringify(Object.fromEntries(Object.entries(value).filter(([k])=>!['decidedAt','releasedAt','closedAt'].includes(k)).sort()));
export function createSubmission({user,loadState,saveState}){
 async function submit(subject,proposal,{write,trace={}}={}){
  let state=await loadState()??{pending:null,results:[]};trace.writes??=0;
  if(state.pending)assert.deepEqual(state.pending,proposal,'different-pending-review');
  else{state={...state,pending:proposal};await saveState(state);}
  const old=await user(subject,proposal.path);assert.equal(old.status,200,'review-result-lookup-denied');let result=old.body;
  if(!result){trace.writes++;const r=await(write?write(proposal):user(subject,'','PATCH',proposal.body));assert.equal(r.status,200,'review-request-denied');result=r.body[proposal.path]??proposal.path.split('/').reduce((n,k)=>n?.[k],r.body);}
  assert(result&&stable(result)===stable(proposal.decision),'review-result-content-conflict');
  await saveState({pending:null,results:[...state.results,result]});return result;
 }
 return{submit};
}
