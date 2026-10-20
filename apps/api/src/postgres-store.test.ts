import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {PostgresStore,secureDatabaseUrl,hasApplicationRecords} from './postgres-store';
import {runPostgresMigration,MigrationClient} from './postgres-migration';
import {validateStoreData} from './store-import-validation';
import {emptyStoreData,StoreData} from './store';

type Snapshot={id:string;state:StoreData;previous:string|null};
class FakePostgres {
  snapshots=new Map<string,Snapshot>();head:{revision:string;snapshot_id:string}|null=null;imports=new Set<string>();migrations=new Set<string>();next=1;statements:string[]=[];failSnapshot=false;failStatement=false;
  async $connect(){} async $disconnect(){}
  async $transaction<T>(callback:(client:any)=>Promise<T>):Promise<T>{const backup=structuredClone({snapshots:[...this.snapshots],head:this.head,imports:[...this.imports],migrations:[...this.migrations],next:this.next,statements:this.statements});try{return await callback(this)}catch(error){this.snapshots=new Map(backup.snapshots);this.head=backup.head;this.imports=new Set(backup.imports);this.migrations=new Set(backup.migrations);this.next=backup.next;this.statements=backup.statements;throw error}}
  async $queryRawUnsafe<T=unknown>(query:string,...values:any[]):Promise<T>{
    if(query.includes('FROM skillsetu_store_head')){if(!this.head)return [] as T;const snap=this.snapshots.get(this.head.snapshot_id)!;return (query.includes('JOIN skillsetu_store_snapshots')?[{...this.head,state:snap.state}]:[{...this.head}]) as T}
    if(query.startsWith('UPDATE skillsetu_store_head')){if(!this.head||this.head.revision!==String(values[2]))return [] as T;this.head={revision:String(values[0]),snapshot_id:String(values[1])};return [{revision:this.head.revision}] as T}
    if(query.includes('FROM skillsetu_import_history'))return (this.imports.has(String(values[0]))?[{source_sha256:String(values[0])}]:[]) as T;
    if(query.includes('FROM skillsetu_schema_migrations'))return (this.migrations.has(String(values[0]))?[{version:String(values[0])}]:[]) as T;
    if(query.includes('INSERT INTO skillsetu_store_snapshots')){if(this.failSnapshot)throw new Error('simulated write error');const id=String(this.next++),state=JSON.parse(String(values[0]));this.snapshots.set(id,{id,state,previous:values[1]===undefined?null:String(values[1])});return [{id}] as T}
    if(query.includes('pg_advisory_xact_lock'))return [{}] as T;
    throw new Error(`Unexpected fake query: ${query}`);
  }
  async $executeRawUnsafe(query:string,...values:any[]):Promise<number>{
    this.statements.push(query);
    if(query.includes('skillsetu_store_head')&&query.includes('INSERT')){this.head={revision:'1',snapshot_id:String(values[0])};return 1}
    if(query.includes('skillsetu_store_head')&&query.includes('UPDATE')){if(!this.head||this.head.revision!==String(values[2]))return 0;this.head={revision:String(values[0]),snapshot_id:String(values[1])};return 1}
    if(query.includes('skillsetu_import_history')){this.imports.add(String(values[0]));return 1}
    if(query.includes('skillsetu_schema_migrations')&&query.includes('INSERT')){this.migrations.add(String(values[0]));return 1}
    if(this.failStatement&&query.includes('example'))throw new Error('simulated DDL failure');
    if(query.includes('CREATE TABLE'))return 0;
    throw new Error(`Unexpected fake command: ${query}`);
  }
}

const originalDatabaseUrl=process.env.DATABASE_URL;
test('PostgreSQL URL enforces TLS for remote Neon-compatible hosts without displaying credentials',t=>{
  assert.equal(new URL(secureDatabaseUrl('postgresql://user:secret@ep-example.neon.tech/neondb')).searchParams.get('sslmode'),'require');
  assert.equal(new URL(secureDatabaseUrl('postgresql://user:secret@localhost/db')).searchParams.get('sslmode'),null);
  assert.throws(()=>secureDatabaseUrl(undefined),/DATABASE_URL is required/);
  t.after(()=>{if(originalDatabaseUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=originalDatabaseUrl});
});

test('PostgreSQL store initializes empty, persists complete model snapshots, and restores them',async()=>{
  process.env.DATABASE_URL='postgresql://test:secret@localhost/test';
  const client=new FakePostgres(),store=await PostgresStore.open(client as any);
  assert.equal(hasApplicationRecords(store.data),false);
  store.data.users.push({id:'user-1',username:'staff1',passwordHash:'hashed',role:'ASSESSOR',phone:null,displayName:'Test Assessor',candidateId:null,authorizedOccupationIds:['trade-1'],createdAt:'2026-01-01T00:00:00Z'});
  store.data.candidates.push({id:'candidate-1',ownerUserId:'user-2',phone:null,name:'Synthetic Name',language:'English',yearsExperience:4,taskIds:['task-1'],description:'',consent:true,synthetic:true,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'});
  store.data.assessments.push({id:'assessment-1',candidateId:'candidate-1',assessorId:'user-1',status:'AWAITING_REVIEW',declarationId:null,contentSetId:'demo-content',contentVersion:'v1',rubricVersion:'r1',scores:[{criterionId:'criterion-1',score:3}],viva:[{questionId:'q1',judgement:'ANSWERED'}],draftResult:null,humanDecision:null,reviewerId:null,reviewReason:null,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',synthetic:true});
  store.data.reports.push({id:'report-1-v2',assessmentId:'assessment-1',candidateId:'candidate-1',version:2,status:'SUBMITTED_FOR_REVIEW',snapshot:{qualification:{provisional:true}},assessorSignoff:{version:2},reviewerSignoff:null});
  store.data.audit.push({id:'audit-1',detail:{workflow:'preserved'}});store.data.notifications!.push({id:'notification-1',userId:'user-2'});store.data.mappingReviews!.push({id:'mapping-1',reviewerId:'user-1'});store.data.offlineSyncReceipts!.push({id:'receipt-1',userId:'user-1',assessmentId:'assessment-1',syncId:'sync-1'});
  await store.save();
  const reloaded=await PostgresStore.open(client as any);
  assert.deepEqual(reloaded.data,store.data);assert.equal(client.snapshots.size,2);assert.equal(client.head?.revision,'2');
});

test('stale PostgreSQL writer is rejected instead of replacing newer persisted state',async()=>{
  process.env.DATABASE_URL='postgresql://test:secret@localhost/test';const client=new FakePostgres(),first=await PostgresStore.open(client as any),second=await PostgresStore.open(client as any);
  first.data.audit.push({id:'first'});await first.save();second.data.audit.push({id:'stale'});
  await assert.rejects(second.save(),/changed in another API process/);
  assert.deepEqual(second.data.audit,[{id:'first'}]);
  assert.deepEqual((await PostgresStore.open(client as any)).data.audit,[{id:'first'}]);
});

test('PostgreSQL refresh exposes another instance’s committed snapshot before dashboard reads',async()=>{
  process.env.DATABASE_URL='postgresql://test:secret@localhost/test';const client=new FakePostgres(),first=await PostgresStore.open(client as any),second=await PostgresStore.open(client as any);
  first.data.audit.push({id:'new-from-peer'});await first.save();await second.refresh();assert.deepEqual(second.data.audit,[{id:'new-from-peer'}]);
});

test('failed PostgreSQL save leaves published memory and latest database snapshot unchanged',async()=>{
  process.env.DATABASE_URL='postgresql://test:secret@localhost/test';const client=new FakePostgres(),store=await PostgresStore.open(client as any);
  store.data.audit.push({id:'committed'});await store.save();const before=structuredClone(store.data);client.failSnapshot=true;store.data.audit.push({id:'uncommitted'});
  await assert.rejects(store.save(),/could not persist/);assert.deepEqual(store.data,before);assert.deepEqual((await PostgresStore.open(client as any)).data,before);
});

test('JSON import validates IDs and relationships, imports only into empty store, and is idempotent',async()=>{
  process.env.DATABASE_URL='postgresql://test:secret@localhost/test';const client=new FakePostgres(),store=await PostgresStore.open(client as any),data=emptyStoreData();
  data.users.push({id:'u1',username:null,passwordHash:null,role:'WORKER',phone:null,displayName:'Holder',candidateId:'c1',createdAt:'2026-01-01T00:00:00Z'});
  data.candidates.push({id:'c1',ownerUserId:'u1',phone:null,name:'Synthetic Holder',language:'English',yearsExperience:0,taskIds:[],description:'',consent:false,synthetic:true,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'});
  const checked=validateStoreData(data);assert.deepEqual(checked.errors,[]);
  assert.equal(await store.importInitialData(checked.data,'a'.repeat(64)),'imported');
  assert.equal(await store.importInitialData(checked.data,'a'.repeat(64)),'already-imported');
  assert.deepEqual((await PostgresStore.open(client as any)).data,checked.data);
  const invalid=structuredClone(data);invalid.assessments.push({id:'bad',candidateId:'missing'} as any);assert.ok(validateStoreData(invalid).errors.some(x=>x.includes('missing candidates')));
  const other=await PostgresStore.open(new FakePostgres() as any);other.data.audit.push({id:'already-has-record'});await other.save();
  await assert.rejects(other.importInitialData(data,'b'.repeat(64)),/not empty/);
});

test('PostgreSQL schema migration is additive and safe to rerun',async()=>{
  const client=new FakePostgres() as any as MigrationClient;
  const statements=fs.readFileSync(path.resolve(process.cwd(),'database/migrations/001_postgres_state_store.sql'),'utf8').split(';').map(x=>x.trim()).filter(Boolean);
  assert.ok(statements.every(x=>/^CREATE TABLE IF NOT EXISTS/i.test(x)));
  assert.ok(statements.every(x=>!/(DROP|TRUNCATE|DELETE FROM)/i.test(x)));
  assert.equal(await runPostgresMigration(client,'001_postgres_state_store',statements),'applied');
  const count=client instanceof FakePostgres?client.statements.length:0;
  assert.equal(await runPostgresMigration(client,'001_postgres_state_store',statements),'already-applied');
  assert.equal((client as any).statements.length,count+1); // The rerun only takes the advisory lock.
});

test('failed migration rolls back migration records and schema statements',async()=>{
  const client=new FakePostgres();client.failStatement=true;
  await assert.rejects(runPostgresMigration(client as any,'test-migration',['CREATE TABLE IF NOT EXISTS example (id TEXT)']));
  assert.equal(client.migrations.size,0);
});
