import assert from 'node:assert/strict';

// 同じ版の通常索引を計算用入力へ変換する。名前・購入者情報は入力へ複製しない。
export function rosterProjection(versions, people, protection) {
  for (const child of [people, protection]) {
    assert.equal(child.environmentId, versions.environmentId, 'SCOPE');
    assert.equal(child.performanceId, versions.performanceId, 'SCOPE');
    assert.equal(child.schemaVersion, 1, 'SCHEMA');
  }
  assert.equal(people.revision, versions.values.attendee, 'STALE_ROSTER');
  assert.equal(protection.revision, versions.values.ticket, 'STALE_TICKET');
  assert(people.roster && typeof people.roster === 'object' && !Array.isArray(people.roster), 'MISSING_ROSTER');
  const ids = new Set(Object.keys(people.roster)), planned = new Set(people.attendeeIds), protectedIds = new Set(protection.protectedAttendeeIds);
  assert.equal(planned.size, people.attendeeIds.length, 'DUPLICATE');
  for (const id of [...planned, ...protectedIds]) assert(ids.has(id), 'UNKNOWN_PERSON');
  const orders = new Set();
  return Object.entries(people.roster).map(([attendeeId, metadata]) => {
    assert(Number.isSafeInteger(metadata.rosterOrder) && metadata.rosterOrder >= 0 && !orders.has(metadata.rosterOrder), 'ROSTER_ORDER');
    assert(metadata.groupId === null || typeof metadata.groupId === 'string' && metadata.groupId.length > 0, 'GROUP_ID');
    orders.add(metadata.rosterOrder);
    return {attendeeId, groupId: metadata.groupId, rosterOrder: metadata.rosterOrder,
      attendancePlan: planned.has(attendeeId) ? 'planned' : 'cancelled', everIssued: protectedIds.has(attendeeId), activeCredentialId: null};
  }).sort((a, b) => a.rosterOrder - b.rosterOrder);
}
