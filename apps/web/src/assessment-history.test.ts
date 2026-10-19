import test from 'node:test';
import assert from 'node:assert/strict';
import {newestFirst,numberedNewestFirst} from './assessment-history';

test('assessment history renders newest first with numbering matching visible rows',()=>{
 const rows=[{id:'old',at:'2026-01-01T00:00:00Z'},{id:'new',at:'2026-02-01T00:00:00Z'},{id:'middle',at:'2026-01-15T00:00:00Z'}];
 assert.deepEqual(newestFirst(rows).map(x=>x.id),['new','middle','old']);
 assert.deepEqual(numberedNewestFirst(rows).map(x=>[x.number,x.record.id]),[[1,'new'],[2,'middle'],[3,'old']]);
 assert.deepEqual(numberedNewestFirst([]),[]);
});
