import assert from 'node:assert/strict';
import {
  appendEventDiscoveryVisibility,
  eventDiscoveryVisibilityWhere,
} from './eventApprovalVisibility';

{
  const publicOnly = eventDiscoveryVisibilityWhere({});
  assert.deepEqual(publicOnly, {
    OR: [
      { entityType: { not: 'EVENT' } },
      { entityType: 'EVENT', eventApprovalStatus: 'APPROVED' },
    ],
  });
}

{
  const owner = eventDiscoveryVisibilityWhere({ userId: 'owner-1' });
  assert.equal((owner.OR ?? []).length, 3);
  assert.deepEqual((owner.OR ?? [])[2], {
    entityType: 'EVENT',
    eventApprovalStatus: 'ON_APPROVE',
    participants: { some: { userId: 'owner-1', role: 'OWNER' } },
  });
}

{
  const admin = eventDiscoveryVisibilityWhere({ userId: 'admin-1', isAdmin: true });
  assert.deepEqual((admin.OR ?? [])[2], {
    entityType: 'EVENT',
    eventApprovalStatus: 'ON_APPROVE',
  });
}

{
  const where = appendEventDiscoveryVisibility({ isPublic: true }, { isAdmin: true });
  assert.ok(Array.isArray(where.AND));
  assert.equal((where.AND as unknown[]).length, 1);
}

console.log('eventApprovalVisibility.test.ts: ok');
