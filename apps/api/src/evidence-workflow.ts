export type EvidenceState='PENDING_REVIEW'|'ACCEPTED'|'CHANGES_REQUESTED'|'DELETED'|'ASSESSOR_ADDED';

export function evidenceForSkillExists(items:any[],assessmentId:string,skillId:string):boolean {
  return items.some(item=>item.assessmentId===assessmentId&&item.skillId===skillId
    && !['DELETED','CHANGES_REQUESTED'].includes(item.status||'PENDING_REVIEW'));
}

export function workerCanDeleteEvidence(item:any,workerUserId:string):boolean {
  return item?.uploadedBy===workerUserId
    && (item.status===undefined||item.status==='PENDING_REVIEW'||item.status==='CHANGES_REQUESTED');
}

export function validateEvidenceDecision(decision:string,remarks:string):string|null {
  if(!['ACCEPTED','CHANGES_REQUESTED'].includes(decision))return 'Choose accept or request changes';
  if(decision==='CHANGES_REQUESTED'&&remarks.trim().length<3)return 'Explain what needs to change';
  return null;
}
