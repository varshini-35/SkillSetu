import type {Assessment} from './store';

export const ACTIVE_ASSESSMENT_STATUSES: ReadonlySet<Assessment['status']> = new Set([
  'REQUESTED', 'IN_PROGRESS', 'AWAITING_REVIEW', 'RETURNED',
]);

/** Qualification-pack IDs are stable scope keys; content version stays on each attempt. */
type ScopedAssessment = Pick<Assessment, 'candidateId' | 'status'> & {qualificationPackId?:string|null;scopeTaskIds?:string[]};
const canonicalScope=(ids:string[]|undefined)=>[...(ids||[])].sort().join('\u0000');

export function isSingleSkillSelection(value:unknown):value is [string]{
  return Array.isArray(value)&&value.length===1&&typeof value[0]==='string'&&value[0].trim().length>0;
}

export function canCancelAssessment(status:Assessment['status'],assessorId:string|null){
  return status==='REQUESTED'&&assessorId===null;
}

export function shouldExposeVivaQuestions(status:Assessment['status']){
  return status==='IN_PROGRESS';
}

export function isValidAssessmentMethod(value:unknown):value is 'IN_PERSON'|'VIDEO'|'PORTFOLIO'{
  return value==='IN_PERSON'||value==='VIDEO'||value==='PORTFOLIO';
}
export function validateAssessmentModeDetails(method:'IN_PERSON'|'VIDEO'|'PORTFOLIO',details:unknown):string|null{
  if(details===undefined)return null;
  if(!details||typeof details!=='object'||Array.isArray(details))return 'Assessment coordination details must be an object';
  const values=details as Record<string,unknown>;
  const permitted=method==='IN_PERSON'?['location','availability','sessionNotes']:method==='VIDEO'?['availability','connectivity','sessionNotes']:['sessionNotes'];
  for(const [key,value] of Object.entries(values)){if(!permitted.includes(key))return `The ${key} field does not apply to this assessment method`;if(typeof value!=='string')return `${key} must be text`;const limit=key==='sessionNotes'?1000:500;if(value.length>limit)return `${key} must be ${limit} characters or fewer`;}
  return null;
}

export function contentForTaskScope(bundle:any,qualificationPackId:string,taskIds:string[]){
  const mappings=(bundle.taskMappings||[]).filter((mapping:any)=>taskIds.includes(String(mapping.taskId))
    && (bundle.standards||[]).some((standard:any)=>standard.id===mapping.nosId&&standard.qpId===qualificationPackId));
  const nosIds=new Set(mappings.map((mapping:any)=>mapping.nosId));
  const criterionIds=new Set(mappings.flatMap((mapping:any)=>mapping.criterionIds||[]));
  const legacyMultiSkill=taskIds.length>1;
  return {
    performanceCriteria:legacyMultiSkill?(bundle.performanceCriteria||[]):(bundle.performanceCriteria||[]).filter((criterion:any)=>criterionIds.size
      ? criterionIds.has(criterion.id) : nosIds.has(criterion.nosId)),
    vivaQuestions:legacyMultiSkill?(bundle.vivaQuestions||[]):(bundle.vivaQuestions||[]).filter((question:any)=>taskIds.includes(String(question.taskId))||nosIds.has(question.nosId)),
  };
}

/**
 * Build a deterministic, explainable viva shortlist for a single assessment scope.
 * Task/NOS links are only described as verified when the source bundle is approved;
 * provisional imported links remain explicitly provisional in the returned records.
 */
export function selectVivaQuestionsForScope(bundle:any,qualificationPackId:string,taskIds:string[],questions?:any[]){
  const taskSet=new Set(taskIds.map(String));
  const mappings=(bundle.taskMappings||[]).filter((mapping:any)=>taskSet.has(String(mapping.taskId))
    &&(bundle.standards||[]).some((standard:any)=>standard.id===mapping.nosId&&standard.qpId===qualificationPackId));
  const nosIds=new Set(mappings.map((mapping:any)=>String(mapping.nosId)));
  const sourceQuestions=questions||bundle.vivaQuestions||[];
  const qualificationNos=new Set((bundle.standards||[]).filter((standard:any)=>standard.qpId===qualificationPackId).map((standard:any)=>String(standard.id)));
  const tasks=(bundle.tasks||[]);
  const scopeLabels=taskIds.map(id=>{
    const task=tasks.find((item:any)=>String(item.id)===id||String(item.taskId)===id);
    const mapping=mappings.find((item:any)=>String(item.taskId)===id);
    return {id,label:String(task?.label||task?.taskLabel||mapping?.taskLabel||id)};
  });
  const mappingStatus=bundle.contentSet?.classification==='SYNTHETIC_DEMO'?'SYNTHETIC_DEMO':
    bundle.contentSet?.productionApproved===true?'APPROVED_CONTENT':'PROVISIONAL';
  const stopwords=new Set(['electrical','electric','work','worker','workers','task','tasks','equipment','check','safely','safety','safe','using','use','explain','describe','question','should','must','what','why','when','where','before','after','according','relevant','appropriate','procedure','person','perform','identify','installation']);
  const tokens=(text:string)=>new Set((text.toLowerCase().match(/[a-z0-9]+/g)||[]).filter((word:string)=>word.length>3&&!stopwords.has(word)).map((word:string)=>word.endsWith('ing')&&word.length>6?word.slice(0,-3):word.endsWith('ed')&&word.length>5?word.slice(0,-2):word.endsWith('s')&&word.length>5?word.slice(0,-1):word));
  const relevant=sourceQuestions.map((question:any)=>{
    const directTask=taskSet.has(String(question.taskId));
    if(question.nosId&&!qualificationNos.has(String(question.nosId)))return null;
    const nosMatch=!!question.nosId&&nosIds.has(String(question.nosId));
    const qTokens=tokens(`${question.question||''} ${question.expectedFocus||''}`);
    const matchedSkills=scopeLabels.filter((skill:any)=>[...tokens(skill.label)].some((word:string)=>qTokens.has(word)));
    // Exact task links and mapped NOS links come from the loaded bundle. In a
    // provisional bundle they are usable only as clearly marked suggestions.
    if(!directTask&&!nosMatch&&matchedSkills.length===0)return null;
    let score=directTask?100:nosMatch?60:0;
    if(matchedSkills.length)score+=Math.min(30,matchedSkills.length*15);
    const text=`${question.question||''} ${question.expectedFocus||''}`.toLowerCase();
    if(/safe|safety|hazard|isolation|shock|fire|protective|regulation|rule|standard|authori[sz]/.test(text))score+=8;
    if(/how|demonstrat|check|test|inspect|install|measure|explain|procedure/.test(text))score+=4;
    const mapping= mappings.find((item:any)=>String(item.taskId)===String(question.taskId))
      ||mappings.find((item:any)=>String(item.nosId)===String(question.nosId));
    const criterionIds=new Set((mapping?.criterionIds||[]).map(String));
    const criterionReferences=(bundle.performanceCriteria||[]).filter((criterion:any)=>criterionIds.has(String(criterion.id)))
      .map((criterion:any)=>({id:String(criterion.id),description:String(criterion.description||criterion.text||criterion.title||criterion.id)}));
    return {...question,score,skillReferences:directTask?scopeLabels:matchedSkills,
      nosReferences:question.nosId?[String(question.nosId)]:mapping?.nosId?[String(mapping.nosId)]:[],
      performanceCriterionReferences:criterionReferences,
      matchBasis:directTask?'TASK_ID':nosMatch?'NOS_ID':'QUESTION_TEXT',
      mappingStatus:mappingStatus==='APPROVED_CONTENT'&&!mapping?.reviewRequired&&mapping?.mappingStatus!=='PROVISIONAL_UNVERIFIED'?'APPROVED_CONTENT':mappingStatus};
  }).filter(Boolean).sort((a:any,b:any)=>b.score-a.score||String(a.id).localeCompare(String(b.id)));
  const selectedQuestions=relevant.slice(0,5).map(({score,...question}:any)=>question);
  const notices:string[]=[];
  if(relevant.length<5)notices.push('Fewer than five relevant questions are available; additional questions require assessor review.');
  if(mappingStatus==='PROVISIONAL')notices.push('Suggestions use provisional dataset mappings or question text and require assessor review.');
  else if(mappingStatus==='SYNTHETIC_DEMO')notices.push('Suggestions use synthetic demonstration mappings and are not official assessment content.');
  else notices.push('Suggestions are drawn from the loaded assessment scope; the assessor remains responsible for the viva.');
  return {selectedQuestions,questionBank:relevant.map(({score,...question}:any)=>question),mappingStatus,
    availableCount:relevant.length,additionalReviewRequired:relevant.length<5,notice:notices.join(' ')};
}

export function findActiveAssessmentForScope<T extends ScopedAssessment>(
  assessments: T[], candidateId: string, qualificationPackId: string, scopeTaskIds?:string[],
): T | undefined {
  return assessments.find(assessment => assessment.candidateId === candidateId
    && assessment.qualificationPackId === qualificationPackId
    // A request's scope is the qualification pack plus its complete skill set.
    // Older assessments may have a multi-skill scope; sharing one skill with a
    // new single-skill request does not make those scopes equivalent.
    && canonicalScope(assessment.scopeTaskIds)===canonicalScope(scopeTaskIds)
    && ACTIVE_ASSESSMENT_STATUSES.has(assessment.status));
}

