import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceForSkillExists,validateEvidenceDecision,workerCanDeleteEvidence} from './evidence-workflow';

test('blocks duplicate pending/accepted evidence for the same skill but permits another skill and changed evidence',()=>{
  const records=[{assessmentId:'a',skillId:'tools',status:'PENDING_REVIEW'},{assessmentId:'a',skillId:'circuits',status:'CHANGES_REQUESTED'}];
  assert.equal(evidenceForSkillExists(records,'a','tools'),true);
  assert.equal(evidenceForSkillExists(records,'a','circuits'),false);
  assert.equal(evidenceForSkillExists(records,'b','tools'),false);
});

test('only own pending or changes-requested evidence can be deleted',()=>{
  assert.equal(workerCanDeleteEvidence({uploadedBy:'u1',status:'PENDING_REVIEW'},'u1'),true);
  assert.equal(workerCanDeleteEvidence({uploadedBy:'u1',status:'ACCEPTED'},'u1'),false);
  assert.equal(workerCanDeleteEvidence({uploadedBy:'u2',status:'PENDING_REVIEW'},'u1'),false);
});

test('evidence review needs remarks when requesting changes',()=>{
  assert.match(validateEvidenceDecision('CHANGES_REQUESTED','  ')||'',/Explain/);
  assert.equal(validateEvidenceDecision('ACCEPTED',''),null);
});
