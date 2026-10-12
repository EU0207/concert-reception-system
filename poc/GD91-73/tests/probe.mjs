import './transport-hook.mjs';
import * as t from '../../GD91-72/tests/support.mjs';
const f=await t.rawFixture();
let o=await t.initPlan(f);t.ok(await t.commit(o.writes,f.manager.token));
await t.prepareFirst(f);o=await t.firstPlan(f);t.ok(await t.commit(o.writes,f.manager.token));
o=await t.registration(f);t.ok(await t.commit(t.registrationWrites(f,o),f.manager.token));
o=await t.assignment(f,'assign',{attendeeId:o.attendeeId});t.ok(await t.commit(o.writes,f.manager.token));
console.log(JSON.stringify({initialization:true,publication:true,registration:true,assignment:true}));
