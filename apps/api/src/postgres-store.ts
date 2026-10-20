import {PrismaClient} from '@prisma/client';
import {emptyStoreData, normalizeStoreData, PersistenceStore, StoreData} from './store';

type HeadRow={revision:string|bigint;snapshot_id:string|bigint;state:StoreData};
type QueryClient={
  $queryRawUnsafe<T=unknown>(query:string,...values:any[]):Promise<T>;
  $executeRawUnsafe(query:string,...values:any[]):Promise<number>;
};
type DatabaseClient=QueryClient&{
  $connect():Promise<void>;$disconnect():Promise<void>;
  $transaction<T>(callback:(client:QueryClient)=>Promise<T>):Promise<T>;
};
class PostgresConflictError extends Error{}

/**
 * PostgreSQL persistence for the existing StoreData contract. Immutable JSONB
 * snapshots deliberately retain fields that are still typed as any in the API.
 * A revision compare-and-swap prevents one API instance from silently replacing
 * another instance's newer state.
 */
export class PostgresStore implements PersistenceStore {
  readonly backend='postgres' as const;
  readonly file=null;
  readonly evidenceDirectory:string;
  data:StoreData;
  private revision=0n;
  private snapshotId=0n;
  private committedData:StoreData;
  private chain:Promise<void>=Promise.resolve();

  private constructor(private readonly client:DatabaseClient, data:StoreData, revision:bigint, snapshotId:bigint){
    this.data=normalizeStoreData(data);this.committedData=structuredClone(this.data);this.revision=revision;this.snapshotId=snapshotId;
    this.evidenceDirectory=process.env.SKILLSETU_EVIDENCE_DIR||`${process.cwd()}/data/evidence`;
  }

  static async open(clientOverride?:DatabaseClient):Promise<PostgresStore>{
    const databaseUrl=secureDatabaseUrl(process.env.DATABASE_URL);
    const client=clientOverride||new PrismaClient({datasources:{db:{url:databaseUrl}},log:['error']}) as unknown as DatabaseClient;
    try{
      await client.$connect();
      const state=await client.$transaction(async tx=>{
        // Keep the transaction-scoped lock while returning a Prisma-compatible
        // scalar instead of PostgreSQL's unsupported `void` result.
        await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('skillsetu-store-head-init'))::text AS lock_result");
        let rows=await tx.$queryRawUnsafe<HeadRow[]>(`SELECT h.revision::text, h.snapshot_id::text, s.state FROM skillsetu_store_head h JOIN skillsetu_store_snapshots s ON s.id=h.snapshot_id WHERE h.singleton_key='main' FOR UPDATE OF h`);
        if(!rows.length){
          const initial=JSON.stringify(emptyStoreData());
          const inserted=await tx.$queryRawUnsafe<Array<{id:string}>>(`INSERT INTO skillsetu_store_snapshots(state) VALUES ($1::jsonb) RETURNING id::text`,initial);
          const snapshotId=inserted[0]?.id;
          if(!snapshotId)throw new Error('Initial state snapshot was not created');
          await tx.$executeRawUnsafe(`INSERT INTO skillsetu_store_head(singleton_key,revision,snapshot_id) VALUES ('main',1,$1::bigint)`,snapshotId);
          rows=await tx.$queryRawUnsafe<HeadRow[]>(`SELECT h.revision::text, h.snapshot_id::text, s.state FROM skillsetu_store_head h JOIN skillsetu_store_snapshots s ON s.id=h.snapshot_id WHERE h.singleton_key='main'`);
        }
        const row=rows[0];if(!row)throw new Error('PostgreSQL state head is unavailable');
        return {data:row.state,revision:BigInt(row.revision),snapshotId:BigInt(row.snapshot_id)};
      });
      return new PostgresStore(client,state.data,state.revision,state.snapshotId);
    }catch{
      await client.$disconnect().catch(()=>undefined);
      throw new Error('PostgreSQL persistence could not initialize. Check DATABASE_URL and confirm the SkillSetu database migration has been applied. No JSON fallback was used.');
    }
  }

  async save():Promise<void>{return this.enqueue(structuredClone(this.data))}

  async refresh():Promise<void>{
    await this.chain;
    const rows=await this.client.$queryRawUnsafe<HeadRow[]>(`SELECT h.revision::text, h.snapshot_id::text, s.state FROM skillsetu_store_head h JOIN skillsetu_store_snapshots s ON s.id=h.snapshot_id WHERE h.singleton_key='main'`);
    const row=rows[0];if(!row)throw new Error('PostgreSQL state head is unavailable.');
    const revision=BigInt(row.revision);if(revision===this.revision)return;
    this.revision=revision;this.snapshotId=BigInt(row.snapshot_id);this.committedData=normalizeStoreData(row.state);this.data=structuredClone(this.committedData);
  }

  async transact<T>(mutate:(draft:StoreData)=>T|Promise<T>):Promise<T>{
    let result!:T;
    const operation=this.chain.then(async()=>{
      const draft=structuredClone(this.committedData);
      result=await mutate(draft);
      await this.persist(draft);
      this.data=draft;this.committedData=structuredClone(draft);
    });
    this.chain=operation.then(()=>undefined,()=>undefined);
    try{await operation;return result}catch(error){if(error instanceof PostgresConflictError)await this.reloadCommitted();throw error}
  }

  async importInitialData(data:StoreData,sourceSha256:string):Promise<'imported'|'already-imported'>{
    const normalized=normalizeStoreData(structuredClone(data));
    if(!/^[a-f0-9]{64}$/i.test(sourceSha256))throw new Error('Import source hash is invalid');
    let outcome:'imported'|'already-imported'='imported';
    await this.chain;
    const committed=await this.client.$transaction(async tx=>{
      const prior=await tx.$queryRawUnsafe<Array<{source_sha256:string}>>(`SELECT source_sha256 FROM skillsetu_import_history WHERE source_sha256=$1 FOR UPDATE`,sourceSha256);
      if(prior.length)return null;
      const rows=await tx.$queryRawUnsafe<HeadRow[]>(`SELECT h.revision::text, h.snapshot_id::text, s.state FROM skillsetu_store_head h JOIN skillsetu_store_snapshots s ON s.id=h.snapshot_id WHERE h.singleton_key='main' FOR UPDATE OF h`);
      const head=rows[0];if(!head)throw new Error('PostgreSQL state head is missing; apply the database migration first');
      const current=normalizeStoreData(head.state);
      if(hasApplicationRecords(current))throw new Error('Import refused: the PostgreSQL store is not empty. Existing records were preserved.');
      if(BigInt(head.revision)!==this.revision)throw new Error('Import refused: the database changed since this importer loaded it. Re-run the command to inspect current state.');
      const nextRevision=this.revision+1n;
      const snapshot=await tx.$queryRawUnsafe<Array<{id:string}>>(`INSERT INTO skillsetu_store_snapshots(state,previous_id) VALUES ($1::jsonb,$2::bigint) RETURNING id::text`,JSON.stringify(normalized),String(this.snapshotId));
      const nextId=snapshot[0]?.id;if(!nextId)throw new Error('Imported snapshot was not created');
      const updated=await tx.$queryRawUnsafe<Array<{revision:string}>>(`UPDATE skillsetu_store_head SET revision=$1::bigint,snapshot_id=$2::bigint WHERE singleton_key='main' AND revision=$3::bigint RETURNING revision::text`,String(nextRevision),nextId,String(this.revision));
      if(!updated.length)throw new Error('Import refused: the database changed during import');
      const counts=recordCounts(normalized);
      await tx.$executeRawUnsafe(`INSERT INTO skillsetu_import_history(source_sha256,snapshot_id,record_counts) VALUES ($1,$2::bigint,$3::jsonb)`,sourceSha256,nextId,JSON.stringify(counts));
      return {revision:nextRevision,snapshotId:BigInt(nextId)};
    });
    if(committed){this.revision=committed.revision;this.snapshotId=committed.snapshotId;this.data=normalized;this.committedData=structuredClone(normalized)}else outcome='already-imported';
    return outcome;
  }

  async close():Promise<void>{await this.client.$disconnect()}

  private async enqueue(data:StoreData):Promise<void>{
    const operation=this.chain.then(async()=>{await this.persist(data);this.data=data;this.committedData=structuredClone(data)});
    this.chain=operation.then(()=>undefined,()=>undefined);
    try{await operation}catch(error){if(error instanceof PostgresConflictError)await this.reloadCommitted();else this.data=structuredClone(this.committedData);throw error}
  }

  private async persist(next:StoreData):Promise<void>{
    try{
      const saved=await this.client.$transaction(async tx=>{
        const rows=await tx.$queryRawUnsafe<HeadRow[]>(`SELECT h.revision::text, h.snapshot_id::text FROM skillsetu_store_head h WHERE h.singleton_key='main' FOR UPDATE`);
        const current=rows[0];if(!current)throw new Error('state-head-missing');
        if(BigInt(current.revision)!==this.revision)throw new Error('revision-conflict');
        const nextRevision=this.revision+1n;
        const snapshot=await tx.$queryRawUnsafe<Array<{id:string}>>(`INSERT INTO skillsetu_store_snapshots(state,previous_id) VALUES ($1::jsonb,$2::bigint) RETURNING id::text`,JSON.stringify(next),String(this.snapshotId));
        const nextId=snapshot[0]?.id;if(!nextId)throw new Error('snapshot-insert-failed');
        const updated=await tx.$queryRawUnsafe<Array<{revision:string}>>(`UPDATE skillsetu_store_head SET revision=$1::bigint,snapshot_id=$2::bigint WHERE singleton_key='main' AND revision=$3::bigint RETURNING revision::text`,String(nextRevision),nextId,String(this.revision));
        if(!updated.length)throw new Error('revision-conflict');
        return {revision:nextRevision,snapshotId:BigInt(nextId)};
      });
      this.revision=saved.revision;this.snapshotId=saved.snapshotId;
    }catch(error){
      const message=error instanceof Error?error.message:'';
      if(message==='revision-conflict')throw new PostgresConflictError('PostgreSQL store changed in another API process. This write was rejected to prevent lost data; the current state was reloaded. Refresh and retry.');
      throw new Error('PostgreSQL could not persist this change. The previous committed state remains active; check database availability and retry.');
    }
  }

  private async reloadCommitted():Promise<void>{
    const rows=await this.client.$queryRawUnsafe<HeadRow[]>(`SELECT h.revision::text, h.snapshot_id::text, s.state FROM skillsetu_store_head h JOIN skillsetu_store_snapshots s ON s.id=h.snapshot_id WHERE h.singleton_key='main'`);
    const row=rows[0];if(!row)throw new Error('PostgreSQL state could not be reloaded after a concurrent update.');
    this.revision=BigInt(row.revision);this.snapshotId=BigInt(row.snapshot_id);this.committedData=normalizeStoreData(row.state);this.data=structuredClone(this.committedData);
  }
}

function secureDatabaseUrl(value:string|undefined):string{
  if(!value)throw new Error('DATABASE_URL is required when PostgreSQL storage is selected');
  let parsed:URL;try{parsed=new URL(value)}catch{throw new Error('DATABASE_URL is not a valid PostgreSQL URL')}
  if(!['postgres:','postgresql:'].includes(parsed.protocol))throw new Error('DATABASE_URL must use the PostgreSQL protocol');
  if(!['localhost','127.0.0.1','::1','[::1]'].includes(parsed.hostname))parsed.searchParams.set('sslmode','require');
  return parsed.toString();
}

function hasApplicationRecords(data:StoreData):boolean{
  return ['users','candidates','declarations','assessments','evidence','reports','audit','notifications','calibrationRatings','mappingReviews','offlineSyncReceipts'].some(key=>Array.isArray((data as any)[key])&&(data as any)[key].length>0)||Object.keys(data.occupationAvailability||{}).length>0;
}

function recordCounts(data:StoreData):Record<string,number>{const counts:Record<string,number>={};for(const key of ['users','candidates','declarations','assessments','evidence','reports','audit','notifications','calibrationRatings','mappingReviews','offlineSyncReceipts'])counts[key]=Array.isArray((data as any)[key])?(data as any)[key].length:0;return counts}

export {secureDatabaseUrl,hasApplicationRecords,recordCounts};
