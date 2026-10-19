import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {OfflineAssessmentDraft,AssessmentDraftStorage,makeAssessmentDraft,assessmentWorkPayload,conflictSummary} from './offline-assessment';

class MemoryDrafts implements AssessmentDraftStorage {
 private rows=new Map<string,OfflineAssessmentDraft>();
 async put(d:OfflineAssessmentDraft){this.rows.set(d.key,structuredClone(d))}
 async get(userId:string,id:string){return structuredClone(this.rows.get(`${userId}:${id}`)||null)}
 async list(userId:string){return [...this.rows.values()].filter(x=>x.userId===userId).map(x=>structuredClone(x))}
 async delete(userId:string,id:string){this.rows.delete(`${userId}:${id}`)}
}
const assessment={id:'ASM-1',candidateId:'CAN-1',assessorId:'USR-A',status:'IN_PROGRESS',updatedAt:'2026-10-19T10:00:00.000Z',contentSetId:'CSET-1',contentVersion:'v1',rubricVersion:'v1-rubric',mappingSnapshotVersion:'abc',performanceCriteria:[{id:'PC-1'}],vivaQuestions:[{id:'VIVA-1'}],scopeTaskIds:['TASK-1']};
test('offline assessment draft keeps workflow snapshot and sync metadata without profile PII',()=>{
 const draft=makeAssessmentDraft({userId:'USR-A',assessment,scores:[{criterionId:'PC-1',score:2}],viva:[{questionId:'VIVA-1',response:'observed',judgement:'ANSWERED'}],observation:'field note',catalogue:{contentSet:{id:'CSET-1'}}});
 assert.equal(draft.state,'PENDING');assert.equal(draft.serverRevision,assessment.updatedAt);assert.equal(draft.snapshot.candidateId,'CAN-1');assert.equal(draft.snapshot.performanceCriteria[0].id,'PC-1');assert.equal(draft.snapshot.catalogue.contentSet.id,'CSET-1');assert.equal('name' in draft.snapshot,false);assert.equal('phone' in draft.snapshot,false);
 const payload=assessmentWorkPayload(draft);assert.equal(payload.offlineSync.baseRevision,assessment.updatedAt);assert.equal(payload.offlineSync.contentVersion,'v1');assert.equal(payload.scores[0].score,2);assert.equal('submit' in payload,false);
});
test('local draft storage scopes read, list and delete by authenticated user and preserves conflict copy',async()=>{
 const db=new MemoryDrafts(),draft=makeAssessmentDraft({userId:'USR-A',assessment,scores:[],viva:[],observation:''});await db.put(draft);assert.equal((await db.list('USR-B')).length,0);assert.equal(await db.get('USR-B','ASM-1'),null);const conflict={...draft,state:'CONFLICT' as const,error:'Server revision changed'};await db.put(conflict);assert.equal((await db.get('USR-A','ASM-1'))?.state,'CONFLICT');assert.match(conflictSummary({versionChanges:{content:true}}),/content/);await db.delete('USR-B','ASM-1');assert.equal((await db.list('USR-A')).length,1);await db.delete('USR-A','ASM-1');assert.equal((await db.list('USR-A')).length,0);
});
test('service worker only caches static assets and never intercepts API data',()=>{
 const source=fs.readFileSync(path.join(process.cwd(),'apps/web/public/sw.js'),'utf8');assert.match(source,/request\.method!=='GET'\|\|url\.origin!==self\.location\.origin\|\|url\.pathname\.startsWith\('\/api\/'\)\)return/);assert.match(source,/STATIC_PATH\.test\(url\.pathname\)/);assert.match(source,/request\.mode==='navigate'/);assert.match(source,/fetch\(request\)\.catch\(async\(\)=>await caches\.match\('\/'\)/);const app=fs.readFileSync(path.join(process.cwd(),'apps/web/src/RoleApp.tsx'),'utf8');assert.match(app,/navigator\.serviceWorker\.register\('\/sw\.js'\)/);assert.match(app,/fetch\('\/api\/health',\{cache:'no-store'/);assert.doesNotMatch(source,/cache\.put\(request,response\.clone\(\)\).*\/api/);
 const manifest=JSON.parse(fs.readFileSync(path.join(process.cwd(),'apps/web/public/manifest.webmanifest'),'utf8'));assert.equal(manifest.name,'SkillSetu — RPL Assessment');assert.equal(manifest.display,'standalone');assert.ok(fs.existsSync(path.join(process.cwd(),'apps/web/public/icons/skillsetu-app.svg')));
});
