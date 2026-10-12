// 公開済みの不変構成と現在の索引から受付投影を組み立てる隔離候補。
export async function assemble(read,{afterIndex=async()=>{}}={}) {
 const head=await read('publication','publicIndex/current');
 await afterIndex(head);
 const sections=[];
 try {
  for(const [sectionId,generation] of Object.entries(head.sections)){
   const display=await read('publication','sectionDisplay/'+generation);
   let view=await read('publication','sectionViews/'+sectionId,{optional:true});
   if(!view||view.generation!==generation)view={rowOffset:0,columnOffset:0};
   const section={sectionId,name:display.name,stagePosition:display.stagePosition,rows:display.rows,columns:display.columns,cells:[]};
   for(let row=0;row<display.rows;row++)for(let column=0;column<display.columns;column+=2){
    const root=sectionId+'/generations/'+generation+'/',part=await read('source',root+'chunks/'+row+'-'+column),attrs=await read('source',root+'attributes/'+row+'-'+column);
    for(let i=0;i<part.content.length;i++){
     const c=part.content[i].cell;
     const cell={row:(c.row+view.rowOffset+display.rows)%display.rows,column:(c.column+view.columnOffset+display.columns)%display.columns,kind:c.kind};
     if(c.kind==='seat'){
      const fact=(await read('source',root+'seatFacts/'+c.seatId)).fact,n=fact.item.numbering,a=attrs.values[i],person=head.assignments[c.seatId];
      const label=person?(await read('publication','attendeeLabels/'+person)).seatDisplayName:'';
      const arrival=person?await read('publication','receptionRecords/'+person,{optional:true}):null;
      Object.assign(cell,{seatId:c.seatId,seatNumber:n.mode==='manual'?n.manualNumber.trim():(fact.prefix+n.number).trim(),category:a.category,usable:a.usable,reservedLabel:a.reservedLabel??null,seatDisplayName:label,receptionStatus:arrival?.status??'notReceived',emergencyChange:a.emergencyChange??null});
     }
     section.cells.push(cell);
    }
   }
   section.cells.sort((a,b)=>a.row-b.row||a.column-b.column);sections.push(section);
  }
 }catch(error){
  const next=await read('publication','publicIndex/current');
  if(JSON.stringify(next)!==JSON.stringify(head))throw new Error('stale-projection');
  throw error;
 }
 const next=await read('publication','publicIndex/current');
 if(JSON.stringify(next)!==JSON.stringify(head))throw new Error('stale-projection');
 const seats=sections.flatMap(s=>s.cells.filter(c=>c.kind==='seat'));
 return{schemaVersion:1,layoutRevision:head.versions.layout,assignmentRevision:head.versions.assignment,attendeeRevision:head.versions.attendee,ticketRevision:head.versions.ticket,sections,
  counts:{seats:seats.length,assigned:seats.filter(s=>s.seatDisplayName!=='').length,received:seats.filter(s=>s.receptionStatus==='received').length}};
}
