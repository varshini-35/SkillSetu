import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {PrismaClient} from '@prisma/client';
import {secureDatabaseUrl} from '../apps/api/src/postgres-store';
import {runPostgresMigration} from '../apps/api/src/postgres-migration';

async function main(){
  const version='001_postgres_state_store';
  const migrationPath=path.resolve(process.cwd(),'database/migrations/001_postgres_state_store.sql');
  const sql=fs.readFileSync(migrationPath,'utf8');
  const statements=sql.split(';').map(statement=>statement.trim()).filter(Boolean);
  const client=new PrismaClient({datasources:{db:{url:secureDatabaseUrl(process.env.DATABASE_URL)}},log:['error']});
  try{
    await client.$connect();
    const result=await runPostgresMigration(client,version,statements);
    console.log(`SkillSetu PostgreSQL schema ${result}. No application data was imported.`);
  }catch{
    console.error('PostgreSQL migration failed. Check DATABASE_URL, database permissions, and the migration SQL. No JSON fallback was used.');
    process.exitCode=1;
  }finally{await client.$disconnect()}
}
void main().catch(()=>{console.error('PostgreSQL migration could not start. Check DATABASE_URL without sharing its value.');process.exitCode=1});
