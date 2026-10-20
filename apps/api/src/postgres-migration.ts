export interface MigrationClient {
  $queryRawUnsafe<T=unknown>(query:string,...values:any[]):Promise<T>;
  $executeRawUnsafe(query:string,...values:any[]):Promise<number>;
  $transaction<T>(callback:(client:Omit<MigrationClient,'$transaction'>)=>Promise<T>):Promise<T>;
}

export async function runPostgresMigration(client:MigrationClient,version:string,statements:string[]):Promise<'applied'|'already-applied'>{
  await client.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS skillsetu_schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  return client.$transaction(async tx=>{
    // Prisma cannot deserialize PostgreSQL's `void` return type. Casting the
    // lock result to text preserves the transaction-scoped lock and returns a
    // Prisma-compatible scalar.
    await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('skillsetu-schema-migrations'))::text AS lock_result");
    const applied=await tx.$queryRawUnsafe<Array<{version:string}>>('SELECT version FROM skillsetu_schema_migrations WHERE version=$1 FOR UPDATE',version);
    if(applied.length)return 'already-applied';
    for(const statement of statements)await tx.$executeRawUnsafe(statement);
    await tx.$executeRawUnsafe('INSERT INTO skillsetu_schema_migrations(version) VALUES ($1)',version);
    return 'applied';
  });
}
