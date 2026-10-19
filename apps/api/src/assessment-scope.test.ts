import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {canCancelAssessment,contentForTaskScope,findActiveAssessmentForScope,isSingleSkillSelection,isValidAssessmentMethod,selectVivaQuestionsForScope,shouldExposeVivaQuestions,validateAssessmentModeDetails} from './assessment-scope';

const assessment=(id:string,pack:string,status:any='REQUESTED')=>({id,candidateId:'holder-1',qualificationPackId:pack,status});

test('assessment request input contains exactly one non-empty skill ID',()=>{
  assert.equal(isSingleSkillSelection(['tools']),true);
  assert.equal(isSingleSkillSelection([]),false);
  assert.equal(isSingleSkillSelection(['tools','circuits']),false);
  assert.equal(isSingleSkillSelection(['  ']),false);
  assert.equal(isSingleSkillSelection('tools'),false);
});
test('only an unassigned REQUESTED assessment can be cancelled',()=>{
  assert.equal(canCancelAssessment('REQUESTED',null),true);
  assert.equal(canCancelAssessment('REQUESTED','assessor-1'),false);
  assert.equal(canCancelAssessment('IN_PROGRESS',null),false);
  assert.equal(canCancelAssessment('CANCELLED',null),false);
});
test('viva questions are exposed only after an assessment is in progress',()=>{
  assert.equal(shouldExposeVivaQuestions('REQUESTED'),false);
  assert.equal(shouldExposeVivaQuestions('IN_PROGRESS'),true);
  assert.equal(shouldExposeVivaQuestions('RETURNED'),false);
  assert.equal(shouldExposeVivaQuestions('AWAITING_REVIEW'),false);
});
test('assessment request requires a supported preferred method',()=>{
  assert.equal(isValidAssessmentMethod('IN_PERSON'),true);
  assert.equal(isValidAssessmentMethod('VIDEO'),true);
  assert.equal(isValidAssessmentMethod('PORTFOLIO'),true);
  assert.equal(isValidAssessmentMethod(undefined),false);
  assert.equal(isValidAssessmentMethod('REMOTE'),false);
});

test('blocks an active request for the same qualification and selected skills',()=>{
  const current={...assessment('a1','qp-a'),scopeTaskIds:['tools','circuits']};
  assert.equal(findActiveAssessmentForScope([current],'holder-1','qp-a',['circuits','tools'])?.id,'a1');
});
test('allows an independent qualification scope for the same person',()=>{
  assert.equal(findActiveAssessmentForScope([assessment('a1','qp-a')],'holder-1','qp-b'),undefined);
});
test('allows a different skill scope within the same qualification',()=>{
  const current={...assessment('a1','qp-a'),scopeTaskIds:['tools']};
  assert.equal(findActiveAssessmentForScope([current],'holder-1','qp-a',['circuits']),undefined);
});
test('legacy multi-skill assessment does not block a different single-skill scope',()=>{
  const legacy={...assessment('legacy','qp-a'),scopeTaskIds:['tools','circuits']};
  assert.equal(findActiveAssessmentForScope([legacy],'holder-1','qp-a',['tools']),undefined);
  assert.equal(findActiveAssessmentForScope([legacy],'holder-1','qp-a',['lighting']) ,undefined);
});
test('an active single-skill assessment blocks only an equivalent request scope',()=>{
  const active={...assessment('active','qp-a'),scopeTaskIds:['tools']};
  assert.equal(findActiveAssessmentForScope([active],'holder-1','qp-a',['tools'])?.id,'active');
  assert.equal(findActiveAssessmentForScope([active],'holder-1','qp-a',['circuits']),undefined);
});
test('completed attempts do not block a new request in the same scope',()=>{
  assert.equal(findActiveAssessmentForScope([assessment('a1','qp-a','APPROVED')],'holder-1','qp-a'),undefined);
});
test('does not match another candidate with an active assessment',()=>{
  assert.equal(findActiveAssessmentForScope([assessment('a1','qp-a')],'holder-2','qp-a'),undefined);
});

test('assessment content follows the selected skill mapping and its NOS viva questions',()=>{
  const bundle={
    standards:[{id:'nos-a',qpId:'qp-a'},{id:'nos-b',qpId:'qp-b'}],
    taskMappings:[{taskId:'tools',nosId:'nos-a',criterionIds:['pc-tools']},{taskId:'circuits',nosId:'nos-b',criterionIds:['pc-circuits']}],
    performanceCriteria:[{id:'pc-tools',nosId:'nos-a'},{id:'pc-circuits',nosId:'nos-b'}],
    vivaQuestions:[{id:'viva-tools',taskId:'tools',nosId:'nos-a'},{id:'viva-related',taskId:'another-nos-a-task',nosId:'nos-a'},{id:'viva-other',taskId:'circuits',nosId:'nos-b'}],
  };
  const scoped=contentForTaskScope(bundle,'qp-a',['tools']);
  assert.deepEqual(scoped.performanceCriteria.map((item:any)=>item.id),['pc-tools']);
  assert.deepEqual(scoped.vivaQuestions.map((item:any)=>item.id),['viva-tools','viva-related']);
});

test('viva shortlist is deterministic, limited to five, and excludes unrelated qualification questions',()=>{
  const bundle={contentSet:{classification:'SYNTHETIC_DEMO'},standards:[{id:'nos-a',qpId:'qp-a'},{id:'nos-b',qpId:'qp-a'}],
    tasks:[{id:'tools',label:'Inspect electrical tools and protective equipment'}],
    taskMappings:[{taskId:'tools',taskLabel:'Inspect electrical tools and protective equipment',nosId:'nos-a',criterionIds:['pc-tools']}],
    vivaQuestions:[...Array.from({length:6},(_,i)=>({id:`related-${i}`,taskId:'other-task',nosId:'nos-a',question:`How do you inspect electrical equipment ${i}?`,expectedFocus:'Check condition and safety'})),
      {id:'unrelated',taskId:'other-task',nosId:'nos-b',question:'Explain unrelated plumbing work',expectedFocus:'Pipe fitting'}]};
  const result=selectVivaQuestionsForScope(bundle,'qp-a',['tools']);
  assert.equal(result.selectedQuestions.length,5);
  assert.equal(result.availableCount,6);
  assert.equal(result.additionalReviewRequired,false);
  assert.equal(result.mappingStatus,'SYNTHETIC_DEMO');
  assert.ok(result.selectedQuestions.every((question:any)=>question.nosReferences.includes('nos-a')));
  assert.ok(result.selectedQuestions.every((question:any)=>question.skillReferences[0].id==='tools'));
  assert.ok(!result.selectedQuestions.some((question:any)=>question.id==='unrelated'));
  assert.deepEqual(result.selectedQuestions.map((q:any)=>q.id),selectVivaQuestionsForScope(bundle,'qp-a',['tools']).selectedQuestions.map((q:any)=>q.id));
});

test('provisional NOS matches are labelled and fewer than five do not get unrelated fillers',()=>{
  const bundle={contentSet:{classification:'PROVISIONAL_IMPORTED'},standards:[{id:'nos-a',qpId:'qp-a'},{id:'nos-b',qpId:'qp-a'}],
    tasks:[{id:'task-a',label:'Inspect damaged electrical components'}],
    taskMappings:[{taskId:'task-a',taskLabel:'Inspect damaged electrical components',nosId:'nos-a',criterionIds:[],mappingStatus:'PROVISIONAL_UNVERIFIED',reviewRequired:true}],
    vivaQuestions:[{id:'q-related',taskId:'PROVISIONAL-UNMAPPED',nosId:'nos-a',question:'What should you do if you find a damaged electrical component?',expectedFocus:'Report the defect.'},
      {id:'q-other',taskId:'other',nosId:'nos-b',question:'Explain an unrelated topic',expectedFocus:'No match.'}]};
  const result=selectVivaQuestionsForScope(bundle,'qp-a',['task-a']);
  assert.deepEqual(result.selectedQuestions.map((q:any)=>q.id),['q-related']);
  assert.equal(result.availableCount,1);
  assert.equal(result.additionalReviewRequired,true);
  assert.equal(result.selectedQuestions[0].mappingStatus,'PROVISIONAL');
  assert.match(result.notice,/provisional/i);
});

test('imported ELE-Q5804 shortlist reuses its existing bank and preserves provisional status',()=>{
  const bundle=JSON.parse(readFileSync(resolve(process.cwd(),'qualification-data/ELE-Q5804/generated/ele-q5804-provisional.json'),'utf8'));
  const mapping=bundle.taskMappings[0];
  const selected=selectVivaQuestionsForScope(bundle,bundle.qualificationPacks[0].id,[mapping.taskId]);
  const sourceIds=new Set(bundle.vivaQuestions.map((question:any)=>question.id));
  assert.equal(bundle.contentSet.classification,'PROVISIONAL_IMPORTED');
  assert.equal(bundle.vivaQuestions.length,30);
  assert.ok(selected.selectedQuestions.length<=5);
  assert.ok(selected.selectedQuestions.length>0);
  assert.ok(selected.selectedQuestions.every((question:any)=>sourceIds.has(question.id)));
  assert.ok(selected.selectedQuestions.every((question:any)=>question.mappingStatus==='PROVISIONAL'));
  assert.equal(selected.mappingStatus,'PROVISIONAL');
});

test('uses a strong question-text match provisionally when task and NOS links are absent',()=>{
  const bundle={contentSet:{classification:'PROVISIONAL_IMPORTED'},qualificationPacks:[{id:'qp-a'}],
    standards:[{id:'nos-a',qpId:'qp-a'}],tasks:[{id:'fan-wiring',label:'Wire a ceiling fan connection'}],taskMappings:[],
    vivaQuestions:[{id:'match',question:'How do you wire a ceiling fan connection safely?',expectedFocus:'Check the connection and isolation.'},
      {id:'weak',question:'What is workplace safety?',expectedFocus:'Follow general rules.'},
      {id:'unrelated',nosId:'nos-a',question:'Explain plumbing pipe maintenance',expectedFocus:'Pipe fittings.'}]};
  const result=selectVivaQuestionsForScope(bundle,'qp-a',['fan-wiring']);
  assert.deepEqual(result.selectedQuestions.map((q:any)=>q.id),['match']);
  assert.equal(result.selectedQuestions[0].matchBasis,'QUESTION_TEXT');
  assert.equal(result.selectedQuestions[0].mappingStatus,'PROVISIONAL');
});

test('assessment coordination fields are specific to selected mode and length-limited',()=>{
 assert.equal(validateAssessmentModeDetails('IN_PERSON',{location:'Training centre',availability:'Weekday mornings'}),null);
 assert.equal(validateAssessmentModeDetails('VIDEO',{availability:'Evenings',connectivity:'Phone with data'}),null);
 assert.equal(validateAssessmentModeDetails('PORTFOLIO',{sessionNotes:'Upload work samples after request'}),null);
 assert.match(validateAssessmentModeDetails('PORTFOLIO',{connectivity:'Phone with data'})||'',/does not apply/);
 assert.match(validateAssessmentModeDetails('VIDEO',{location:'Training centre'})||'',/does not apply/);
 assert.match(validateAssessmentModeDetails('IN_PERSON',{location:'x'.repeat(501)})||'',/500 characters/);
});
