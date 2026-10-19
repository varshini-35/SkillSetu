import test from 'node:test';
import assert from 'node:assert/strict';
import { canAssignAssessment, canReleaseLegacyAdminAssignment } from './assessment-authorization';

test('assignment requires explicit assessor role and occupation authorization',()=>{
  assert.equal(canAssignAssessment({role:'ADMIN',authorizedOccupationIds:['domestic-electrician']},'domestic-electrician'),false);
  assert.equal(canAssignAssessment({role:'ASSESSOR',authorizedOccupationIds:['another-trade']},'domestic-electrician'),false);
  assert.equal(canAssignAssessment({role:'ASSESSOR',authorizedOccupationIds:['domestic-electrician']},'domestic-electrician'),true);
});

test('legacy Admin assignment recovery is narrow and administrator-only',()=>{
  assert.equal(canReleaseLegacyAdminAssignment('ADMIN','IN_PROGRESS','ADMIN'),true);
  assert.equal(canReleaseLegacyAdminAssignment('REVIEWER','IN_PROGRESS','ADMIN'),false);
  assert.equal(canReleaseLegacyAdminAssignment('ADMIN','APPROVED','ADMIN'),false);
  assert.equal(canReleaseLegacyAdminAssignment('ADMIN','IN_PROGRESS','ASSESSOR'),false);
});
