// ローカル試験の失敗箇所を絞る補助。Emulatorの判定を代替しない。
export function diagnose(rules,before,patch,path,auth){
 const after=structuredClone(before),now=Date.now(),normalize=v=>v&&typeof v==='object'?(v['.sv']==='timestamp'?now:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,normalize(x)]))):v;
 for(const[k,v]of Object.entries(patch)){const keys=(path+'/'+k).split('/'),last=keys.pop();let n=after;for(const key of keys)n=n[key]??={};n[last]=normalize(v);}
 const at=(tree,p)=>p.reduce((n,k)=>n?.[k],tree)??null;
 const snap=(tree,p)=>({val:()=>at(tree,p),exists:()=>at(tree,p)!==null,child:k=>snap(tree,[...p,...String(k).split('/')]),parent:()=>snap(tree,p.slice(0,-1)),hasChildren:ks=>ks?ks.every(k=>at(tree,[...p,...k.split('/')])!==null):!!at(tree,p)&&Object.keys(at(tree,p)).length>0,isString:()=>typeof at(tree,p)==='string',isNumber:()=>typeof at(tree,p)==='number',isBoolean:()=>typeof at(tree,p)==='boolean'});
 const root=snap(before,[]),fails=[];
 if(!String.prototype.matches)Object.defineProperty(String.prototype,'matches',{value:function(r){return r.test(String(this));},configurable:true});
 function walk(rule,p,vars,writeAllowed=false){
  const current=p.join('/');if(current&&current!==path&&!path.startsWith(current+'/')&&!current.startsWith(path+'/'))return;
  const value=at(after,p);if(value===null)return;
  const evaluate=s=>new Function('root','data','newData','auth','now',...Object.keys(vars),'return ('+s+');')(root,snap(before,p),snap(after,p),auth,now,...Object.values(vars));
  if(typeof rule['.write']==='string')try{writeAllowed=writeAllowed||evaluate(rule['.write']);}catch{fails.push(current+':write-evaluation-error');}
  if(rule['.validate']===false)fails.push(current+':validate-false');
  if(typeof rule['.validate']==='string')try{if(!evaluate(rule['.validate']))fails.push(current+':validate');}catch{fails.push(current+':evaluation-error');}
  if(value&&typeof value==='object')for(const key of Object.keys(value)){let child=rule[key],next={...vars};if(!child){const wildcard=Object.keys(rule).find(k=>k.startsWith('$'));if(wildcard){child=rule[wildcard];next[wildcard]=key;}}if(child)walk(child,[...p,key],next,writeAllowed);}
  else if(current.startsWith(path+'/')&&!writeAllowed&&JSON.stringify(at(before,p))!==JSON.stringify(value))fails.push(current+':write');
 }
 walk(rules.rules,[],{});return fails.slice(0,20);
}
export async function serverDiagnose(rules,patch,device,{request,user,owner,trial}){
 const old=await owner(trial+'/event'),results=[];
 const variants=[['event-validation',r=>{r.rules.checks.$run.event['.validate']=true;}],['new-subtree-writes',r=>{for(const k of['roster','groupInfo','groupStates'])r.rules.checks.$run.event[k]['.write']=true;}],['event-write',r=>{r.rules.checks.$run.event['.write']=true;}]];
 try{for(const[name,mutate]of variants){const candidate=structuredClone(rules);mutate(candidate);const loaded=await request('.settings/rules',{token:'owner',method:'PUT',body:candidate});if(loaded.status!==200){results.push({name,load:loaded.status});continue;}const result=await user('event',device,'PATCH',patch);results.push({name,status:result.status});await owner(trial+'/event','PUT',old);}}
 finally{await request('.settings/rules',{token:'owner',method:'PUT',body:rules});}
 return results;
}
