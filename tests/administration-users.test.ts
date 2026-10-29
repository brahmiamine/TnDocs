import test from 'node:test';
import assert from 'node:assert/strict';
import { userAccessSchema, validateUserAccessChange } from '../src/modules/administration/user-policy';
const verified = { id: 'target', role: 'admin' as const, status: 'active' as const, emailVerifiedAt: new Date() };
test('user management prevents self-suspension and loss of the last active administrator', () => {
  assert.equal(validateUserAccessChange('target', verified, { role: 'admin', status: 'suspended' }, 2), 'SELF_SUSPENSION_FORBIDDEN');
  assert.equal(validateUserAccessChange('actor', verified, { role: 'user', status: 'active' }, 1), 'LAST_ACTIVE_ADMIN');
  assert.equal(validateUserAccessChange('actor', verified, { role: 'admin', status: 'suspended' }, 1), 'LAST_ACTIVE_ADMIN');
  assert.equal(validateUserAccessChange('actor', verified, { role: 'user', status: 'active' }, 2), null);
});
test('active access requires verified email and immutable expected role/status in each request', () => {
  assert.equal(validateUserAccessChange('actor', { ...verified, role: 'user', status: 'pending_verification', emailVerifiedAt: null }, { role: 'user', status: 'active' }, 2), 'EMAIL_NOT_VERIFIED');
  const valid = { expectedRole: 'user', expectedStatus: 'suspended', role: 'user', status: 'active' };
  assert.equal(userAccessSchema.safeParse(valid).success, true);
  assert.equal(userAccessSchema.safeParse({ role: 'admin', status: 'active' }).success, false);
  assert.equal(userAccessSchema.safeParse({ ...valid, passwordHash: 'forbidden' }).success, false);
});
