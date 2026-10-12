import {scope,version,stored} from '../../GD91-68/tests/support.mjs';
import {rosterProjection} from '../../GD91-67/projection.mjs';
export async function calculationSnapshot(f){
 const v=await version(f),s=await stored(f,'assignmentState/current'),people=rosterProjection(v,await stored(f,'eligible/current'),await stored(f,'ticketProtection/current')),models=f.models??[f.next.model];
 return {...scope(f),completeRoster:true,versions:v.values,people,groupStates:s.groups,assignments:s.assignments,
  sections:models.map((m,i)=>({sectionId:m.section.sectionId,displayOrder:i,axis:m.section.axis,seatOrder:m.section.seatOrder})),
  seats:models.flatMap(m=>m.seats.map(s=>{const section=m.section,c=section.cells.find(c=>c.seatId===s.seatId),l=section.lineSettings[section.axis==='horizontal'?c.row:c.column];return {...s,row:c.row,column:c.column,lineId:l.lineId,lineOrder:l.index,category:s.category==='special'?'reserved':s.category};}))};
}
