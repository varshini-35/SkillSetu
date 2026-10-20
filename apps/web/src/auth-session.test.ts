import test from 'node:test';
import assert from 'node:assert/strict';
import {authenticatedUserFromResponse, dashboardForRole} from './auth-session';

test('authenticated session roles resolve to their existing dashboards', () => {
  assert.equal(dashboardForRole('WORKER'), 'worker');
  assert.equal(dashboardForRole('ASSESSOR'), 'assessor');
  assert.equal(dashboardForRole('REVIEWER'), 'admin');
  assert.equal(dashboardForRole('ADMIN'), 'admin');
});

test('session restoration rejects missing users and unsupported roles', () => {
  assert.throws(() => authenticatedUserFromResponse({}), /valid authenticated user and role/);
  assert.throws(() => authenticatedUserFromResponse({user: {id: 'u1', displayName: 'Unknown', role: 'OWNER'}}), /valid authenticated user and role/);
  assert.equal(authenticatedUserFromResponse({user: {id: 'u1', role: 'ADMIN', displayName: 'Admin', hasProfile: true}}).role, 'ADMIN');
});
