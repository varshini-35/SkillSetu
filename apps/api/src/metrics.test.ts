import test from 'node:test';
import assert from 'node:assert/strict';
import {weightedCohenKappa} from './metrics';

test('weighted kappa is 1 for two varying but identical assessor rating sets',()=>{
  assert.deepEqual(weightedCohenKappa([0,1,2,3],[0,1,2,3]),{value:1,n:4,reason:null});
});
test('weighted kappa handles a one-category disagreement and reports paired count',()=>{
  const result=weightedCohenKappa([0,1,2,3],[1,1,2,3]);
  assert.equal(result.n,4);
  assert.equal(result.value,0.875);
});
test('weighted kappa excludes missing or invalid pairs and refuses tiny samples',()=>{
  assert.deepEqual(weightedCohenKappa([1,2],[1,null as any]),{value:null,n:1,reason:'At least two paired cases are needed.'});
});
test('weighted kappa reports zero-expected-disagreement edge case as undefined',()=>{
  assert.equal(weightedCohenKappa([2,2],[2,2]).value,null);
});
