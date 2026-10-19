import {randomUUID,randomBytes} from 'node:crypto';
import {createSection,numberInitial} from '../GD91-07/planner.mjs';
import {pack} from '../GD91-49/codec.mjs';

// 架空の変換入力。DBの通常操作で発生した証拠とは区別する。
export function fixture(){
 const environmentId='FAKE-migration-source',performanceId=randomUUID(),person=randomUUID(),buyer=randomUUID();
 const credential=randomBytes(16).toString('base64url'),code='ABCD2345';
 const scope={schemaVersion:1,environmentId,performanceId};
 const model=numberInitial(createSection({name:'架空区画',rows:1,columns:2,axis:'horizontal',seatOrder:'forward',lines:[{name:'A'}]},{maxCells:4096}),{'0,0':'seat','0,1':'seat'},{maxCells:4096});
 const source={format:1,control:{state:'preparing'},versions:{...scope,values:{commit:8},sections:{[model.section.sectionId]:randomUUID()}},
  layouts:[pack({environmentId,performanceId,generation:randomUUID(),model},2,{maxCells:4096})],
  people:{[person]:{...scope,attendeeId:person,buyerId:buyer,attendancePlan:'planned',paid:true,groupId:null,rosterOrder:0}},
  labels:{[person]:{...scope,seatDisplayName:'架空A'}},buyers:{[buyer]:{name:'架空購入者'}},
  eligible:{roster:{[person]:{groupId:null,rosterOrder:0}},groups:{}},
  assignments:{assignments:Object.fromEntries(model.seats.map((s,i)=>[s.seatId,i===0?person:''])),groups:{}},
  tickets:{[person]:{...scope,activeCredentialId:credential,activeCode:code,currentCycle:1,credentialVersion:1,cycleClosed:false,everIssued:false,issued:false,sent:false,issuedAt:null,sentAt:null}},
  credentials:{[credential]:{...scope,ticketId:person,currentCycle:1,credentialVersion:1,status:'active'}},codes:{[code]:{...scope,credentialId:credential,active:true}},
  operations:{},reception:{},deletions:{},sharedDrafts:{},sharedHead:null,pendingOperations:[],unsentEvents:0,
  reconciliation:{registeredDevices:1,declaredDevices:1,coverageConfirmed:true,sourceAccessFenced:true}};
 return {source,person,buyer};
}
