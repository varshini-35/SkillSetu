export type MappingStatus='VERIFIED'|'PROVISIONAL'|'REJECTED'|'UNMAPPED';
const statuses=new Set<MappingStatus>(['VERIFIED','PROVISIONAL','REJECTED','UNMAPPED']);
export function mappingStatus(value:unknown,classification?:string):MappingStatus{
 if(typeof value==='string'&&statuses.has(value as MappingStatus))return value as MappingStatus;
 return classification==='SYNTHETIC_DEMO'?'PROVISIONAL':'UNMAPPED';
}
export function validAssessmentScores(scores:any,criteria:any[]){
 const byId=new Map<string,any>((criteria||[]).map((criterion:any)=>[String(criterion.id),criterion]));
 return Array.isArray(scores)&&new Set(scores.map((score:any)=>score?.criterionId)).size===scores.length&&scores.every((score:any)=>{
  const criterion=byId.get(String(score?.criterionId));if(!criterion)return false;
  if(score.notAssessed===true)return typeof score.reason==='string'&&score.reason.trim().length>=3;
  const anchors=criterion.anchors||[],permitted=anchors.length?anchors.some((anchor:any)=>anchor.score===score.score):Number.isInteger(score.score)&&score.score>=0&&score.score<=4;
  return Number.isInteger(score.score)&&permitted;
 });
}
export function attachAssessmentMapping(snapshot:any,scores:any[],viva:any[]){
 const criteria=snapshot?.performanceCriteria||[],mappings=snapshot?.taskMappings||[],nos=snapshot?.nos||[],questions=snapshot?.vivaQuestions||[];
 const savedScores=(scores||[]).map((entry:any)=>{
  const criterion=criteria.find((item:any)=>String(item.id)===String(entry.criterionId));
  const links=mappings.filter((item:any)=>(item.criterionIds||[]).map(String).includes(String(entry.criterionId)));
  const verifiedNos=[...new Set(links.filter((link:any)=>link.status==='VERIFIED'&&criterion?.status==='VERIFIED'&&nos.some((standard:any)=>standard.id===link.nosId&&standard.status==='VERIFIED')).map((link:any)=>String(link.nosId)))];
  const relationshipStatus=verifiedNos.length===1?'VERIFIED':links.some((link:any)=>link.status==='REJECTED')?'REJECTED':links.some((link:any)=>link.status==='PROVISIONAL')||criterion?.status==='PROVISIONAL'||links.some((link:any)=>link.status==='VERIFIED')?'PROVISIONAL':'UNMAPPED';
  return {...entry,assessmentItemId:String(entry.criterionId),maxScore:criterion?.maxScore??null,rubricVersion:snapshot?.rubricVersion||null,nosId:verifiedNos.length===1?verifiedNos[0]:null,nosReferences:[...new Set(links.map((link:any)=>String(link.nosId)))],taskIds:[...new Set(links.map((link:any)=>String(link.taskId)))],mappingStatus:relationshipStatus,mappingSourceReferences:[...new Set([criterion?.sourceReference,...links.map((link:any)=>link.sourceReference)].filter(Boolean))]};
 });
 const savedViva=(viva||[]).map((entry:any)=>{
  const question=questions.find((item:any)=>String(item.id)===String(entry.questionId));
  const standard=nos.find((item:any)=>String(item.id)===String(question?.nosId));
  const linked=question?.status==='VERIFIED'&&standard?.status==='VERIFIED';
  const relationshipStatus=linked?'VERIFIED':question?.status==='REJECTED'?'REJECTED':question?.status==='PROVISIONAL'||question?.status==='VERIFIED'?'PROVISIONAL':'UNMAPPED';
  return {...entry,assessmentItemId:String(entry.questionId),question:question?.question||'',expectedFocus:question?.expectedFocus||null,taskId:question?.taskId||null,nosId:linked?question.nosId:null,nosReferences:question?.nosId?[String(question.nosId)]:[],performanceCriteriaIds:question?.performanceCriteriaIds||[],mappingStatus:relationshipStatus,mappingSourceReference:question?.sourceReference||null,rubricVersion:snapshot?.rubricVersion||null};
 });
 return {scores:savedScores,viva:savedViva};
}
export function validateQualificationBundle(bundle:any){
 const errors:string[]=[],unique=(items:any[],label:string)=>{const seen=new Set<string>();for(const item of items||[]){const id=String(item?.id||'');if(!id)errors.push(`${label}: missing ID`);else if(seen.has(id))errors.push(`${label}: duplicate ID ${id}`);else seen.add(id)}return seen};
 const qps=unique(bundle.qualificationPacks||[],'QP'),nos=unique(bundle.standards||[],'NOS'),pcs=unique(bundle.performanceCriteria||[],'PC'),tasks=unique(bundle.taskMappings||[],'Task mapping'),viva=unique(bundle.vivaQuestions||[],'Viva question');
 for(const standard of bundle.standards||[])if(!qps.has(String(standard.qpId)))errors.push(`NOS ${standard.id}: missing QP ${standard.qpId}`);
 for(const criterion of bundle.performanceCriteria||[])if(!nos.has(String(criterion.nosId)))errors.push(`PC ${criterion.id}: missing NOS ${criterion.nosId}`);
 for(const mapping of bundle.taskMappings||[]){if(!nos.has(String(mapping.nosId)))errors.push(`Task mapping ${mapping.id}: missing NOS ${mapping.nosId}`);for(const pcId of mapping.criterionIds||[]){const pc=(bundle.performanceCriteria||[]).find((item:any)=>String(item.id)===String(pcId));if(!pc)errors.push(`Task mapping ${mapping.id}: missing PC ${pcId}`);else if(String(pc.nosId)!==String(mapping.nosId))errors.push(`Task mapping ${mapping.id}: PC ${pcId} belongs to NOS ${pc.nosId}, not ${mapping.nosId}`)}if(mapping.mappingStatus&&!statuses.has(mapping.mappingStatus))errors.push(`Task mapping ${mapping.id}: invalid mapping status ${mapping.mappingStatus}`);}
 for(const question of bundle.vivaQuestions||[]){if(question.nosId&&!nos.has(String(question.nosId)))errors.push(`Viva question ${question.id}: missing NOS ${question.nosId}`);if(question.taskId&&!((bundle.taskMappings||[]).some((mapping:any)=>String(mapping.taskId)===String(question.taskId))))errors.push(`Viva question ${question.id}: missing task ${question.taskId}`);if((question.performanceCriteriaIds||[]).some((id:string)=>!pcs.has(String(id))))errors.push(`Viva question ${question.id}: missing PC reference`);}
 const version=String(bundle.contentSet?.version||'');if(!version)errors.push('Content version is required');
 return {valid:errors.length===0,errors,counts:{qualificationPacks:qps.size,nos:nos.size,performanceCriteria:pcs.size,taskMappings:tasks.size,vivaQuestions:viva.size}};
}
export function mappingCounts(bundle:any){
 const rows:any[]=[];for(const nos of bundle.standards||[])rows.push(mappingStatus(nos.mappingStatus||nos.reviewStatus,bundle.contentSet?.classification));
 for(const pc of bundle.performanceCriteria||[])rows.push(mappingStatus(pc.mappingStatus||pc.reviewStatus,bundle.contentSet?.classification));
 for(const task of bundle.taskMappings||[])for(const pcId of task.criterionIds||[])rows.push((bundle.performanceCriteria||[]).some((pc:any)=>String(pc.id)===String(pcId))?mappingStatus(task.mappingStatus||task.reviewStatus,bundle.contentSet?.classification):'UNMAPPED');
 for(const question of bundle.vivaQuestions||[]){const refs=question.performanceCriteriaIds||[];if(!refs.length)rows.push(question.mappingStatus==='REJECTED'||question.reviewStatus==='REJECTED'?'REJECTED':'UNMAPPED');else for(const pcId of refs)rows.push((bundle.performanceCriteria||[]).some((pc:any)=>String(pc.id)===String(pcId))?mappingStatus(question.mappingStatus||question.reviewStatus,bundle.contentSet?.classification):'UNMAPPED')}
 return {total:rows.length,verified:rows.filter(x=>x==='VERIFIED').length,provisional:rows.filter(x=>x==='PROVISIONAL').length,rejected:rows.filter(x=>x==='REJECTED').length,unmapped:rows.filter(x=>x==='UNMAPPED').length};
}
export function buildAssessmentMappingSnapshot(bundle:any,qualificationPackId:string,taskIds:string[],vivaQuestions:any[]){
 const taskSet=new Set(taskIds.map(String)),standards=(bundle.standards||[]).filter((nos:any)=>String(nos.qpId)===qualificationPackId&&((bundle.taskMappings||[]).some((mapping:any)=>taskSet.has(String(mapping.taskId))&&String(mapping.nosId)===String(nos.id))));
 const relevantMappings=(bundle.taskMappings||[]).filter((mapping:any)=>taskSet.has(String(mapping.taskId))&&standards.some((nos:any)=>String(nos.id)===String(mapping.nosId)));
 const pcIds=[...new Set(relevantMappings.flatMap((mapping:any)=>mapping.criterionIds||[]).map(String))];
 const status=(item:any)=>mappingStatus(item.mappingStatus||item.reviewStatus,bundle.contentSet?.classification);
 const qp=(bundle.qualificationPacks||[]).find((item:any)=>String(item.id)===qualificationPackId)||{};
 return {contentSetId:bundle.contentSet.id,contentVersion:bundle.contentSet.version,classification:bundle.contentSet.classification||'UNVERIFIED',qualificationPackId,qualificationPackCode:qp.code||null,qualificationPackTitle:qp.title||null,nsqfLevel:qp.nsqfLevel??null,awardingBody:qp.awardingBody||null,qualificationSource:qp.sourceReference||qp.source||null,rubricVersion:`${bundle.contentSet.version}-rubric`,scoringModel:structuredClone(bundle.assessmentMetadata?.scoringModel||bundle.contentSet?.scoringModel||null),taskIds:[...taskSet],tasks:relevantMappings.map((item:any)=>({id:String(item.taskId),label:item.taskLabel||String(item.taskId)})).filter((item:any,index:number,all:any[])=>all.findIndex((candidate:any)=>candidate.id===item.id)===index),nos:standards.map((nos:any)=>({id:String(nos.id),code:nos.code||null,title:nos.title||nos.name||String(nos.id),status:status(nos),sourceReference:nos.sourceReference||nos.source||null,reviewer:nos.reviewedBy||null,reviewedAt:nos.reviewedAt||null,reviewReason:nos.reviewReason||null})),performanceCriteria:pcIds.map(id=>{const pc=(bundle.performanceCriteria||[]).find((item:any)=>String(item.id)===id);const anchors=structuredClone(pc?.anchors||[]),maxScore=anchors.reduce((max:number,anchor:any)=>Number.isInteger(anchor.score)?Math.max(max,anchor.score):max,-1);return pc?{id,sourcePcId:pc.sourcePcId||pc.originalPcId||pc.sourceId||null,nosId:String(pc.nosId),description:pc.description||pc.text||pc.title||id,safetyCritical:pc.safetyCritical===true,status:status(pc),sourceReference:pc.sourceReference||pc.source||null,reviewer:pc.reviewedBy||null,reviewedAt:pc.reviewedAt||null,reviewReason:pc.reviewReason||null,anchors,maxScore:maxScore>=0?maxScore:null}:null}).filter(Boolean),taskMappings:relevantMappings.map((item:any)=>({id:String(item.id),taskId:String(item.taskId),taskLabel:item.taskLabel||String(item.taskId),nosId:String(item.nosId),criterionIds:(item.criterionIds||[]).map(String),status:status(item),sourceReference:item.sourceReference||item.source||null,reviewer:item.reviewedBy||null,reviewedAt:item.reviewedAt||null,reviewReason:item.reviewReason||null})),vivaQuestions:vivaQuestions.map((item:any)=>({id:String(item.id),question:item.question||item.text||'',expectedFocus:item.expectedFocus||null,followUps:structuredClone(item.followUps||item.followups||[]),taskId:item.taskId||null,nosId:item.nosId||null,performanceCriteriaIds:item.performanceCriteriaIds||[],skillReferences:structuredClone(item.skillReferences||[]),nosReferences:structuredClone(item.nosReferences||(item.nosId?[String(item.nosId)]:[])),performanceCriterionReferences:structuredClone(item.performanceCriterionReferences||[]),status:status(item),sourceReference:item.sourceReference||item.source||null,reviewer:item.reviewedBy||null,reviewedAt:item.reviewedAt||null,reviewReason:item.reviewReason||null,matchBasis:item.matchBasis||'TASK_OR_NOS'}))};
}
export function summarizeNosScores(bundle:any,assessment:any){
 const scope=assessment.mappingSnapshot||buildAssessmentMappingSnapshot(bundle,String(assessment.qualificationPackId||''),assessment.scopeTaskIds||[],[]),scoreById=new Map<string,any>((assessment.scores||[]).map((entry:any)=>[String(entry.criterionId),entry]));
 const rules=scope.scoringModel||bundle.assessmentMetadata?.scoringModel||bundle.contentSet?.scoringModel||null;
 return (scope.nos||[]).map((nos:any)=>{
  const linked=new Set((scope.taskMappings||[]).filter((mapping:any)=>mapping.nosId===nos.id&&mapping.status==='VERIFIED').flatMap((mapping:any)=>mapping.criterionIds||[]).map(String));
  const criteria=(scope.performanceCriteria||[]).filter((pc:any)=>pc.nosId===nos.id&&pc.status==='VERIFIED'&&linked.has(pc.id));
  const recorded:any[]=criteria.map((pc:any)=>({criterionId:pc.id,score:Number.isInteger(scoreById.get(pc.id)?.score)?scoreById.get(pc.id).score:null,notAssessed:scoreById.get(pc.id)?.notAssessed===true,maxScore:pc.maxScore??((bundle.performanceCriteria||[]).find((item:any)=>String(item.id)===pc.id)?.anchors||[]).reduce((max:number,anchor:any)=>Number.isInteger(anchor.score)?Math.max(max,anchor.score):max,-1)}));
  const complete=recorded.length>0&&recorded.every(item=>item.score!==null||item.notAssessed);
  const countable=recorded.filter(item=>item.score!==null);
  let scoreObtained:number|null=null,maxScore:number|null=null,limitation='';
  if(nos.status!=='VERIFIED'||!criteria.length)limitation='No verified NOS-to-PC and task relationship is available; NOS totals are not attributed.';
  else if(recorded.length===1&&recorded[0].score!==null&&recorded[0].maxScore>=0){scoreObtained=recorded[0].score;maxScore=recorded[0].maxScore}
  else if(rules?.approved===true&&rules?.aggregation==='SUM'&&countable.length===recorded.length&&recorded.every(item=>item.maxScore>=0)){scoreObtained=countable.reduce((sum,item)=>sum+item.score!,0);maxScore=recorded.reduce((sum,item)=>sum+item.maxScore,0)}
  else limitation=complete?'Multiple criteria have no approved aggregation rule; individual scores are retained without a NOS total.':'One or more verified criterion scores are missing or not assessed; no NOS total is inferred.';
  let result='NOT_DETERMINED';if(scoreObtained!==null&&rules?.approved===true&&Number.isFinite(rules.passThreshold)){result=scoreObtained>=Number(rules.passThreshold)?'MEETS_CONFIGURED_THRESHOLD':'BELOW_CONFIGURED_THRESHOLD'}
  return {id:nos.id,code:nos.code,title:nos.title,mappingStatus:nos.status,criteria:recorded,scoreObtained,maxScore,result,limitation};
 });
}
