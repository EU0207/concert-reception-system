import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
export function editModel(before,e){
 const m=structuredClone(before),s=m.section;
 const target=s.cells.find(c=>c.cellId===e.targetCellId),source=s.cells.find(c=>c.cellId===e.sourceCellId),seat=m.seats.find(x=>x.seatId===e.seatId);
 assert(target);const line=s.lineSettings[s.axis==='horizontal'?target.row:target.column];
 if(e.kind==='add'){
  assert(!seat);target.kind='seat';target.seatId=e.seatId;
  m.seats.push({seatId:e.seatId,sectionId:s.sectionId,lineId:line.lineId,numberingMode:'manual',manualNumber:e.number,category:'general',usable:true,emergencyChange:{kind:'add',reason:e.reason}});
 }else{
  assert(seat&&source);seat.emergencyChange={kind:e.kind,reason:e.reason};
  if(e.kind==='renumber'){
   seat.numberingMode='manual';seat.manualNumber=e.number;delete seat.number;delete seat.prefix;
  }else{
   assert.equal(e.kind,'move');const label=seat.numberingMode==='automatic'?seat.prefix+seat.number:seat.manualNumber;
   source.kind='space';delete source.seatId;delete source.consumedNumber;target.kind='seat';target.seatId=e.seatId;
   if(seat.lineId!==line.lineId){seat.numberingMode='manual';seat.manualNumber=label;delete seat.prefix;delete seat.number;}
   seat.lineId=line.lineId;
  }
 }
 return m;
}
export function command(f,kind,options={}){
 const m=f.models.find(m=>m.section.sectionId===f.section),seat=m.seats[0],source=m.section.cells.find(c=>c.seatId===seat.seatId),target=m.section.cells.find(c=>c.kind==='unset');
 return{kind,seatId:kind==='add'?randomUUID():seat.seatId,sourceCellId:kind==='add'?'':source.cellId,targetCellId:kind==='renumber'?source.cellId:target?.cellId,reason:'架空：座席の用途変更',number:'補助-1',...options};
}
