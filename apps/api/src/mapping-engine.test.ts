import test from 'node:test';
import assert from 'node:assert/strict';
import {attachAssessmentMapping,buildAssessmentMappingSnapshot,mappingStatus,summarizeNosScores,validAssessmentScores,validateQualificationBundle} from './mapping-engine';

const bundle:any={contentSet:{id:'v1',version:'1',classification:'VERIFIED',productionApproved:true},qualificationPacks:[{id:'qp',code:'QP-1'}],standards:[{id:'nos',qpId:'qp',code:'NOS-1',title:'NOS',mappingStatus:'VERIFIED'}],performanceCriteria:[{id:'pc',nosId:'nos',sourcePcId:'ORIGINAL-PC',description:'Criterion',mappingStatus:'VERIFIED',anchors:[{score:0},{score:1},{score:2},{score:3},{score:4}]}],taskMappings:[{id:'map',taskId:'task',taskLabel:'Task',nosId:'nos',criterionIds:['pc'],mappingStatus:'VERIFIED',sourceReference:'source.pdf#p=2'}],vivaQuestions:[{id:'viva',taskId:'task',nosId:'nos',performanceCriteriaIds:['pc'],mappingStatus:'VERIFIED'}],assessmentMetadata:{}};

test('validates QP to NOS to PC/task/viva references and rejects missing/duplicate IDs',()=>{
 assert.equal(validateQualificationBundle(bundle).valid,true);
 const invalid=structuredClone(bundle);invalid.performanceCriteria.push({...invalid.performanceCriteria[0]});invalid.taskMappings[0].criterionIds.push('missing');
 const result=validateQualificationBundle(invalid);assert.equal(result.valid,false);assert.ok(result.errors.some(x=>x.includes('duplicate ID pc')));assert.ok(result.errors.some(x=>x.includes('missing PC missing')));
});

test('rejects a task mapping that connects a performance criterion to the wrong NOS',()=>{
 const invalid=structuredClone(bundle);invalid.taskMappings[0].nosId='other-nos';
 const result=validateQualificationBundle(invalid);assert.equal(result.valid,false);assert.ok(result.errors.some(x=>x.includes('belongs to NOS nos, not other-nos')));
});

test('preserves explicit mapping status and treats synthetic or absent status as provisional/unmapped',()=>{
 assert.equal(mappingStatus('VERIFIED'), 'VERIFIED');assert.equal(mappingStatus('REJECTED'),'REJECTED');assert.equal(mappingStatus(undefined,'SYNTHETIC_DEMO'),'PROVISIONAL');assert.equal(mappingStatus(undefined,'IMPORTED'),'UNMAPPED');
});

test('assessment snapshot freezes versioned task, NOS, PC, viva and provenance references',()=>{
 const snap=buildAssessmentMappingSnapshot(bundle,'qp',['task'],bundle.vivaQuestions);assert.equal(snap.contentSetId,'v1');assert.deepEqual(snap.performanceCriteria.map((x:any)=>x.sourcePcId),['ORIGINAL-PC']);assert.equal(snap.taskMappings[0].sourceReference,'source.pdf#p=2');assert.equal(snap.vivaQuestions[0].id,'viva');
});

test('NOS scoring uses verified links, rubric maximum, no duplicate PC count, and no unsupported aggregate',()=>{
 const assessment:any={qualificationPackId:'qp',scopeTaskIds:['task'],scores:[{criterionId:'pc',score:3}]};const result=summarizeNosScores(bundle,assessment)[0];assert.equal(result.scoreObtained,3);assert.equal(result.maxScore,4);assert.equal(result.result,'NOT_DETERMINED');
 const duplicate=structuredClone(bundle);duplicate.taskMappings.push({...duplicate.taskMappings[0],id:'map-2'});const once=summarizeNosScores(duplicate,assessment)[0];assert.equal(once.scoreObtained,3);
 const many=structuredClone(bundle);many.performanceCriteria.push({id:'pc2',nosId:'nos',mappingStatus:'VERIFIED',anchors:[{score:0},{score:4}]});many.taskMappings[0].criterionIds.push('pc2');const multiple=summarizeNosScores(many,{...assessment,scores:[...assessment.scores,{criterionId:'pc2',score:2}]})[0];assert.equal(multiple.scoreObtained,null);assert.match(multiple.limitation,/no approved aggregation/i);
});

test('saved assessment mapping content is immutable when the current catalogue changes',()=>{
 const snap=buildAssessmentMappingSnapshot(bundle,'qp',['task'],bundle.vivaQuestions),changed=structuredClone(bundle);changed.performanceCriteria[0].description='Changed later';changed.performanceCriteria[0].anchors=[{score:0},{score:1}];changed.vivaQuestions[0].question='Changed later';
 assert.equal((snap.performanceCriteria[0] as any).description,'Criterion');assert.equal((snap.performanceCriteria[0] as any).anchors.at(-1).score,4);assert.equal((snap.vivaQuestions[0] as any).question,bundle.vivaQuestions[0].question||'');
});

test('score validation follows the saved rubric anchors and requires a reason for not assessed',()=>{
 const criteria=[{id:'pc',anchors:[{score:0},{score:2},{score:5}]}];
 assert.equal(validAssessmentScores([{criterionId:'pc',score:5}],criteria),true);assert.equal(validAssessmentScores([{criterionId:'pc',score:4}],criteria),false);assert.equal(validAssessmentScores([{criterionId:'pc',notAssessed:true,reason:'Not observed'}],criteria),true);assert.equal(validAssessmentScores([{criterionId:'pc',notAssessed:true,reason:' ' }],criteria),false);
});

test('saved practical and viva results retain rubric, item IDs and only verified NOS associations',()=>{
 const snapshot=buildAssessmentMappingSnapshot(bundle,'qp',['task'],bundle.vivaQuestions),entries=attachAssessmentMapping(snapshot,[{criterionId:'pc',score:3}],[{questionId:'viva',response:'response',judgement:'ANSWERED'}]);
 assert.equal(entries.scores[0].assessmentItemId,'pc');assert.equal(entries.scores[0].maxScore,4);assert.equal(entries.scores[0].rubricVersion,'1-rubric');assert.equal(entries.scores[0].nosId,'nos');assert.equal(entries.scores[0].mappingStatus,'VERIFIED');
 assert.equal(entries.viva[0].assessmentItemId,'viva');assert.equal(entries.viva[0].question,bundle.vivaQuestions[0].question||'');assert.equal(entries.viva[0].nosId,'nos');
 const provisional=structuredClone(snapshot);provisional.taskMappings[0].status='PROVISIONAL';const pending=attachAssessmentMapping(provisional,[{criterionId:'pc',score:3}],[]);assert.equal(pending.scores[0].nosId,null);assert.equal(pending.scores[0].mappingStatus,'PROVISIONAL');assert.deepEqual(pending.scores[0].nosReferences,['nos']);
});

test('NOS scoring excludes provisional/unmapped and missing or not-assessed scores',()=>{
 const provisional=structuredClone(bundle);provisional.taskMappings[0].mappingStatus='PROVISIONAL';assert.equal(summarizeNosScores(provisional,{qualificationPackId:'qp',scopeTaskIds:['task'],scores:[{criterionId:'pc',score:4}]})[0].scoreObtained,null);
 assert.equal(summarizeNosScores(bundle,{qualificationPackId:'qp',scopeTaskIds:['task'],scores:[]})[0].scoreObtained,null);
 assert.equal(summarizeNosScores(bundle,{qualificationPackId:'qp',scopeTaskIds:['task'],scores:[{criterionId:'pc',notAssessed:true,reason:'not performed'}]})[0].scoreObtained,null);
});
