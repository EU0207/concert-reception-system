export * from '../../GD91-72/tests/support.mjs';
import * as base from '../../GD91-72/tests/support.mjs';
import {data} from '../../GD91-60/tests/transport.mjs';
export async function draftPlan(f,contents,baseVersions){
 const o=await base.draftPlan(f,contents,baseVersions);
 const r=await base.request(base.base+'/'+base.path(f,'sharedDraftHead/current'),f.manager.token);
 if(![200,404].includes(r.status))base.ok(r);
 o.draft.expectedSharedVersion=r.status===404?0:data(r).revision;
 const w=base.write(base.path(f,'sharedDrafts/'+o.id),o.draft,false);w.updateTransforms=[{fieldPath:'occurredAt',setToServerValue:'REQUEST_TIME'}];
 o.head={...base.scope(f),operationId:o.id,revision:o.draft.expectedSharedVersion+1};
 o.writes=[w,base.write(base.path(f,'sharedDraftHead/current'),o.head,r.status===200)];return o;
}
