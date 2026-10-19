import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationsForUser,removeOwnedNotification} from './notification-access';

test('notification reads and deletes are scoped to their owner',()=>{
 const items=[{id:'n1',userId:'worker-a'},{id:'n2',userId:'worker-b'}];
 assert.deepEqual(notificationsForUser(items,'worker-a').map(x=>x.id),['n1']);
 assert.equal(removeOwnedNotification(items,'n2','worker-a').status,'forbidden');
 assert.deepEqual(items.map(x=>x.id),['n1','n2']);
 assert.equal(removeOwnedNotification(items,'missing','worker-a').status,'missing');
 assert.equal(removeOwnedNotification(items,'n1','worker-a').status,'deleted');
 assert.deepEqual(items.map(x=>x.id),['n2']);
});
