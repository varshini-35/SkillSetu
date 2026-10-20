import test from 'node:test';
import assert from 'node:assert/strict';
import {requestableDeclaredSkills} from './worker-profile';

test('a missing worker profile safely produces no requestable skills', () => {
  assert.deepEqual(requestableDeclaredSkills(null, [], [], 'qp1'), []);
});

test('requestable skills require both a saved declaration and a QP task mapping', () => {
  const profile = {declaredSkills: [{id: 'task1'}, {id: 'task2'}], declaration: {taskIds: ['task1', 'task2']}};
  assert.deepEqual(requestableDeclaredSkills(profile, [{taskId: 'task1', nosId: 'nos1'}], [{id: 'nos1', qpId: 'qp1'}], 'qp1'), [{id: 'task1'}]);
});
