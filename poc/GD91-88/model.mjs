import {randomUUID,randomInt} from 'node:crypto';
export const emptyEvent=seats=>({commit:{revision:1,operationId:'initial'},seats:Object.fromEntries(seats.map(id=>[id,{personId:'none',revision:1}])),view:Object.fromEntries(seats.map(id=>[id,{personId:'none',displayName:'',revision:1}]))});
export const profile=(i=0)=>({name:'架'.repeat(50),displayName:'架空来場者名',paid:false,extra:Object.fromEntries(Array.from({length:10},(_,j)=>['f'+j,'補'.repeat(200)]))});
export function command(f,state,kind,target,options={}){
  const id=options.id??randomUUID(), revision=state.commit.revision+1;
  const oldTicket=state.tickets?.[target];
  const op={kind,target,expectedRevision:state.commit.revision,resultRevision:revision,sourceControlRevision:options.controlRevision??1,humanUid:f.human.uid,confirmedPrimary:options.confirmedPrimary??true,confirmedTicketWarning:options.confirmedTicketWarning??true,stopConfirmed:options.stopConfirmed??true,paid:options.paid??false,issued:options.issued??true,sent:options.sent??true,newCredential:'',newCode:'',previousCredential:oldTicket?.credentialRef??'',previousCode:oldTicket?.code??'',previousSeat:state.people?.[target]?.seatId??'none',ticketSnapshot:'none',committedAt:{'.sv':'timestamp'}};
  const body={commit:{revision,operationId:id},['operations/'+id]:op};
  if(kind==='register'){
    const p=options.profile??profile();body['profiles/'+target]={...p,revision};body['people/'+target]={active:true,seatId:'none',displayName:p.displayName,revision};
  }else if(kind==='payment')body['profiles/'+target]={...state.profiles[target],paid:op.paid,revision};
  else if(kind==='returnAttendance')body['people/'+target]={...state.people[target],active:true,revision};
  else if(kind==='cancelAttendance'){
    const person=state.people[target];body['people/'+target]={...person,active:false,seatId:'none',revision};
    if(person.seatId!=='none'){body['seats/'+person.seatId]={personId:'none',revision};body['view/'+person.seatId]={personId:'none',displayName:'',revision};}
    const t=state.tickets?.[target];if(t){body['tickets/'+target]={...t,credentialRef:'',code:'',cycleClosed:true,issued:false,sent:false,issuedAt:0,sentAt:0,revision};revoke(t);}
  }else{
    const old=state.tickets?.[target],fresh=!old||old.cycleClosed;
    const t=fresh?{credentialRef:'',code:'',currentCycle:old?old.currentCycle+1:1,credentialVersion:0,cycleClosed:false,everIssued:false,everSent:false,issued:false,sent:false,issuedAt:0,sentAt:0,revision}:{...old,revision};
    if(kind==='ticketCheck'){
      for(const k of ['issued','sent']){const value=options[k]??true;t[k+'At']=value?(t[k]?t[k+'At']:{'.sv':'timestamp'}):0;t[k]=value;t['ever'+k[0].toUpperCase()+k.slice(1)]=t['ever'+k[0].toUpperCase()+k.slice(1)]||value;}
    }else{
      op.newCredential=options.credential??randomUUID();op.newCode=options.code??String(randomInt(10000000,100000000));
      t.credentialRef=op.newCredential;t.code=op.newCode;t.credentialVersion=kind==='qrReissue'?old.credentialVersion+1:1;
      body['credentials/'+op.newCredential]={personId:target,currentCycle:t.currentCycle,credentialVersion:t.credentialVersion,code:t.code,active:true,revision};
      body['codes/'+op.newCode]={credentialRef:op.newCredential,active:true,revision};if(kind==='qrReissue')revoke(old);
    }
    body['tickets/'+target]=t;
  }
  function revoke(t){if(!t.credentialRef)return;body['credentials/'+t.credentialRef]={...state.credentials[t.credentialRef],active:false,revision};body['codes/'+t.code]={...state.codes[t.code],active:false,revision};}
  if(body['tickets/'+target])op.ticketSnapshot=structuredClone(body['tickets/'+target]);
  return body;
}
export function applyModel(state,body){for(const[path,value]of Object.entries(body)){const parts=path.split('/'),last=parts.pop();let at=state;for(const key of parts)at=at[key]??=( {} );at[last]=structuredClone(value);}return state;}
