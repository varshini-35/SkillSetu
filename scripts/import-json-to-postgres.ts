import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {PostgresStore,recordCounts} from '../apps/api/src/postgres-store';
import {validateStoreData} from '../apps/api/src/store-import-validation';

async function main(){
  const args=process.argv.slice(2),sourceIndex=args.indexOf('--source');
  if(sourceIndex<0||!args[sourceIndex+1])throw new Error('Usage: npm run db:import-json -- --source <path> [--apply]');
  const source=path.resolve(process.cwd(),args[sourceIndex+1]);
  const raw=fs.readFileSync(source),parsed=JSON.parse(raw.toString('utf8'));
  const checked=validateStoreData(parsed);
  if(checked.errors.length)throw new Error(`Source validation failed (${checked.errors.length} issue(s)): ${checked.errors.slice(0,12).join('; ')}`);
  const digest=createHash('sha256').update(raw).digest('hex');
  console.log(JSON.stringify({source:path.relative(process.cwd(),source),sourceSha256:digest,recordCounts:recordCounts(checked.data),mode:args.includes('--apply')?'apply':'dry-run'}));
  if(!args.includes('--apply')){console.log('Dry run only. PostgreSQL was not changed. Re-run with --apply only after choosing and verifying the source file.');return}
  const store=await PostgresStore.open();
  try{const result=await store.importInitialData(checked.data,digest);console.log(result==='already-imported'?'This exact source file was already imported; no records changed.':'Import committed as a new immutable snapshot.');}
  finally{await store.close?.()}
}

void main().catch(error=>{console.error(error instanceof Error?error.message:'JSON import failed');process.exitCode=1});
