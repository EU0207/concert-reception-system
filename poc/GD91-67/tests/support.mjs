import * as initial from '../../GD91-65/tests/support.mjs';
import * as lifecycle from '../../GD91-64/tests/support.mjs';
import {prepareFirst as prepare} from './structure.mjs';
export * from '../../GD91-65/tests/support.mjs';
export {ticketSnapshot, noTicketWrites, rebuild, audit} from '../../GD91-64/tests/support.mjs';
const {stored, commit, ok, path} = initial;
export const registrationWrites = initial.registrationWrites;
export async function initPlan(f) {
  const o = await initial.initPlan(f); o.people.roster = {}; return initial.initWrites(f, o);
}
export async function initialize(f) { const o = await initPlan(f); ok(await commit(o.writes, f.manager.token)); return o; }
export async function registration(f, {groupId = null, ...options} = {}) {
  const o = await initial.registration(f, options), index = await stored(f, 'eligible/current');
  o.profile.groupId = groupId; o.profile.rosterOrder = Object.keys(index.roster).length;
  o.index.roster = {...index.roster, [o.attendeeId]: {groupId, rosterOrder: o.profile.rosterOrder}};
  return o;
}
export async function register(f, options) { const o = await registration(f, options); ok(await commit(registrationWrites(f, o), f.manager.token)); return o; }
export function paidWrites(f, o) {
  return [initial.write(path(f, 'versions/current'), o.versions, true), initial.write(path(f, 'attendees/' + o.attendeeId), o.profile, true),
    initial.write(path(f, 'eligible/current'), o.index, true), initial.eventWrite(f, o)];
}
export const prepareFirst = prepare;
export const rawFixture = initial.fixture;
export async function fixture({noLayout = false, unusable = false, controlRevision = 1} = {}) {
  const f = await initial.fixture({controlRevision}); await initialize(f);
  if (!noLayout) { await prepare(f, {unusable}); await initial.publish(f); }
  return f;
}
export const noTicketPlan = lifecycle.noTicketPlan;
