export function reportSubmissionError(input: { status: string; assessorId: string | null; userId: string; declarationAccepted: boolean; reportAlreadySubmitted: boolean }) {
  if (input.status !== 'IN_PROGRESS' || input.assessorId !== input.userId) return 'Only the assigned assessor can submit this in-progress assessment';
  if (!input.declarationAccepted) return 'Accept the assessor declaration before signing and submitting the report';
  if (input.reportAlreadySubmitted) return 'A report version is already awaiting review';
  return null;
}

export function reportCandidateNameError(name: unknown) {
  return typeof name !== 'string' || name.trim().length < 2
    ? 'The Skill Holder profile has no saved full name. Ask the Skill Holder to complete or correct their profile before signing this report.'
    : null;
}

export function reportReviewError(input: { status: string; assessorId: string | null; report: any; snapshotIntegrityValid: boolean; reportId: string; reportVersion: number; decision: string; reviewerDeclarationAccepted: boolean; contentClassification: string }) {
  if (input.status !== 'AWAITING_REVIEW') return 'Only a submitted report can be reviewed';
  if (!input.report || input.report.id !== input.reportId || input.report.status !== 'SUBMITTED_FOR_REVIEW') return 'The submitted report version is no longer current';
  if (Number(input.report.version) !== Number(input.reportVersion)) return 'Report version changed. Refresh and review the latest saved version';
  if (!input.report.assessorSignoff?.accepted || Number(input.report.assessorSignoff.version) !== Number(input.report.version)) return 'The report does not contain a valid assessor sign-off';
  if (!input.assessorId || input.report.assessorSignoff.userId !== input.assessorId) return 'The assessor sign-off does not match the assessor assigned to this assessment';
  if (!input.snapshotIntegrityValid) return 'The saved report snapshot is missing or does not match its integrity hash';
  if (input.decision === 'APPROVED' && input.contentClassification === 'PROVISIONAL_IMPORTED') return 'This imported qualification is provisional and cannot receive final report approval until its source and assessment mappings are verified';
  if (['APPROVED', 'RETURNED'].includes(input.decision) && !input.reviewerDeclarationAccepted) return 'Accept the reviewer declaration before recording a review decision';
  return null;
}

export function workerCanViewReport(status: string) { return status === 'APPROVED' || status === 'SIGNED_OFF'; }
