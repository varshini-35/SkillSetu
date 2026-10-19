import test from 'node:test';
import assert from 'node:assert/strict';
import { createReportSnapshot, createShowcaseReport, reportPdf, reportPreviewHtml } from './assessment-report';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { reportCandidateNameError, reportReviewError, reportSubmissionError, workerCanViewReport } from './report-workflow';

const bundle = { contentSet: { trade: 'Demo electrician', version: 'demo-1', source: 'Synthetic', classification: 'SYNTHETIC_DEMO', productionApproved: false, assessmentReady: false, passThresholdVerified: false }, qualificationPacks: [{ id: 'qp-1', title: 'Demo QP', code: 'DEMO' }], standards: [{ id: 'nos-1', qpId: 'qp-1', code: 'NOS-1', title: 'Safe work' }], taskMappings: [{ taskId: 'task-1', nosId: 'nos-1', criterionIds: ['pc-1', 'pc-2'] }], practicalAssessmentTasks: [{ id: 'task-1', label: 'Inspect a circuit' }] };
const assessment = { id: 'ASM-1', candidateId: 'CAN-1', assessorId: 'ASR-1', status: 'IN_PROGRESS', qualificationPackId: 'qp-1', scopeTaskIds: ['task-1'], contentSetId: 'set-1', contentVersion: 'demo-1', rubricVersion: 'demo-1-rubric', preferredMethod: 'IN_PERSON', createdAt: '2026-01-01T00:00:00Z', scores: [{ criterionId: 'pc-1', score: 3, observation: 'Careful isolation' }, { criterionId: 'pc-2', notAssessed: true, reason: 'Could not safely demonstrate' }], viva: [{ questionId: 'q-1', question: 'How do you isolate power?', response: 'Switch off and verify.', judgement: 'ANSWERED' }] };

test('report snapshot preserves only recorded answers and does not invent scores or outcomes', () => {
  const snapshot = createReportSnapshot({ assessment, candidate: { id: 'CAN-1', name: 'Demo Holder', yearsExperience: 4 }, assessor: { id: 'ASR-1', displayName: 'Demo Assessor' }, bundle, reportId: 'RPT-1', version: 1, at: '2026-01-02T00:00:00Z', performanceCriteria: [{ id: 'pc-1', description: 'Isolate safely' }, { id: 'pc-2', description: 'Verify isolation' }], evidence: [] });
  assert.equal(snapshot.criteriaResults.find((x: any) => x.id === 'pc-1')?.score, 3);
  assert.equal(snapshot.criteriaResults.find((x: any) => x.id === 'pc-2')?.score, null);
  assert.equal(snapshot.viva.length, 1);
  assert.equal(snapshot.outcome.status, 'NOT_DETERMINED');
  assert.equal(snapshot.qualification.provisional, true);
});

test('report uses the canonical linked candidate profile name', () => {
  const snapshot = createReportSnapshot({ assessment, candidate: { id: 'CAN-1', name: 'Stale account label', canonicalName: 'Ramesh Kumar', yearsExperience: 4 }, assessor: { id: 'ASR-1', displayName: 'Demo Assessor' }, bundle, reportId: 'RPT-NAME', version: 1, at: '2026-01-02T00:00:00Z', performanceCriteria: [], evidence: [] });
  assert.equal(snapshot.skillHolder.name, 'Ramesh Kumar');
});

test('report uses the saved mapping and rubric snapshot instead of changed catalogue content',async()=>{
 const saved={...assessment,mappingSnapshot:{contentSetId:'set-1',contentVersion:'demo-1',qualificationPackId:'qp-1',rubricVersion:'demo-1-rubric',scoringModel:null,nos:[{id:'nos-1',code:'NOS-1',title:'Saved NOS title',status:'PROVISIONAL'}],performanceCriteria:[{id:'pc-1',nosId:'nos-1',description:'Saved criterion wording',status:'PROVISIONAL',anchors:[{score:0,description:'No demonstration'},{score:2,description:'Partial demonstration'},{score:5,description:'Full demonstration'}],maxScore:5}],taskMappings:[{id:'map-1',taskId:'task-1',taskLabel:'Saved practical task',nosId:'nos-1',criterionIds:['pc-1'],status:'PROVISIONAL'}],vivaQuestions:[{id:'q-1',question:'Saved viva wording',expectedFocus:'Saved expected focus',taskId:'task-1',nosId:'nos-1',status:'PROVISIONAL'}]}};
 const snapshot=createReportSnapshot({assessment:saved,candidate:{id:'CAN-1',name:'Demo Holder',yearsExperience:4},assessor:{id:'ASR-1',displayName:'Demo Assessor'},bundle:{...bundle,standards:[{id:'nos-1',qpId:'qp-1',title:'Changed NOS title'}],taskMappings:[{taskId:'task-1',taskLabel:'Changed practical task',nosId:'nos-1',criterionIds:['pc-1']}],performanceCriteria:[{id:'pc-1',nosId:'nos-1',description:'Changed criterion wording',anchors:[{score:0},{score:4}]}],vivaQuestions:[{id:'q-1',question:'Changed viva wording',taskId:'task-1'}]},reportId:'RPT-SNAPSHOT',version:1,at:'2026-01-02T00:00:00Z',performanceCriteria:[{id:'pc-1',description:'Changed criterion wording',anchors:[{score:0},{score:4}]}],evidence:[]});
 assert.equal(snapshot.criteriaResults[0].description,'Saved criterion wording');assert.equal(snapshot.criteriaResults[0].maxScore,5);assert.equal(snapshot.nosResults[0].title,'Saved NOS title');assert.equal(snapshot.viva[0].question,'Saved viva wording');assert.equal(snapshot.mappingSnapshot.contentVersion,'demo-1');
 const preview=reportPreviewHtml(snapshot,'IN_PROGRESS',null,null);assert.match(preview,/NOS-wise Score Summary/);assert.match(preview,/Saved NOS title/);assert.match(preview,/Saved criterion wording/);assert.match(preview,/Saved viva wording/);
 const pdf=(await reportPdf(snapshot,'IN_PROGRESS',null,null)).toString('latin1');assert.match(pdf,/\/Type \/Page/);assert.match(pdf,/%%EOF/);
});

test('real report submission requires a saved Skill Holder name', () => {
  assert.match(reportCandidateNameError('')!, /profile has no saved full name/);
  assert.match(reportCandidateNameError(' ')!, /profile has no saved full name/);
  assert.equal(reportCandidateNameError('Ramesh'), null);
});

test('report derives rubric maximum and recorded activities from actual scores, excludes untouched catalogue tasks, and exposes no inferred pass result', () => {
  const extended = { ...bundle, taskMappings: [...bundle.taskMappings, { taskId: 'task-2', nosId: 'nos-1', criterionIds: ['pc-3'] }], practicalAssessmentTasks: [...bundle.practicalAssessmentTasks, { id: 'task-2', label: 'Untouched task' }] };
  const snapshot = createReportSnapshot({ assessment, candidate: { id: 'CAN-1', name: 'Demo Holder', yearsExperience: 4 }, assessor: { id: 'ASR-1', displayName: 'Demo Assessor' }, bundle: extended, reportId: 'RPT-2', version: 1, at: '2026-01-02T00:00:00Z', performanceCriteria: [{ id: 'pc-1', description: 'Isolate safely', anchors: [{ score: 0, description: 'Unsafe' }, { score: 3, description: 'Safe with prompts' }] }, { id: 'pc-2', description: 'Verify isolation' }, { id: 'pc-3', description: 'Untouched criterion' }], evidence: [] });
  assert.equal(snapshot.criteriaResults.find((x: any) => x.id === 'pc-1')?.maxScore, 3);
  assert.equal(snapshot.criteriaResults.find((x: any) => x.id === 'pc-1')?.rating, 'Safe with prompts');
  assert.equal(snapshot.practicalTasks.some((x: any) => x.id === 'task-2'), false);
  assert.equal(snapshot.summary.passed, null);
  assert.equal(snapshot.summary.notPassed, null);
  assert.equal(snapshot.activities.find((x: any) => x.criterionId === 'pc-1')?.result, 'RAW_SCORE_RECORDED');
  assert.equal(snapshot.activities.find((x: any) => x.criterionId === 'pc-2')?.result, 'NOT_ASSESSED');
  assert.equal(snapshot.activities.some((x: any) => x.criterionId === 'pc-3'), false, 'unrecorded rubric criteria must not be presented as tests performed');
});

test('HTML preview uses the same snapshot values, versioned reviewer decision, and synthetic warning', () => {
  const snapshot = createReportSnapshot({ assessment, candidate: { id: 'CAN-1', name: 'Demo <Holder>', yearsExperience: 4 }, assessor: { id: 'ASR-1', displayName: 'Demo Assessor' }, bundle, reportId: 'RPT-3', version: 2, at: '2026-01-02T00:00:00Z', performanceCriteria: [{ id: 'pc-1', description: 'Isolate safely', anchors: [{ score: 0 }, { score: 3 }] }], evidence: [] });
  snapshot.showcase = true;
  const html = reportPreviewHtml(snapshot, 'RETURNED', { userId: 'ASR-1', name: 'Demo Assessor', version: 2 }, { userId: 'REV-1', name: 'Reviewer', version: 2, decision: 'RETURNED', simulated: true }, 'hash');
  assert.match(html, /DEMONSTRATION SAMPLE — Synthetic data and simulated sign-offs/);
  assert.match(html, /Demo &lt;Holder&gt;/);
  assert.match(html, /RETURNED/);
  assert.match(html, /Reviewer/);
});

test('report submission requires assigned assessor, in-progress status, and declaration', () => {
  assert.equal(reportSubmissionError({ status: 'IN_PROGRESS', assessorId: 'ASR-1', userId: 'ASR-1', declarationAccepted: true, reportAlreadySubmitted: false }), null);
  assert.match(reportSubmissionError({ status: 'IN_PROGRESS', assessorId: 'ASR-1', userId: 'ASR-1', declarationAccepted: false, reportAlreadySubmitted: false })!, /declaration/);
  assert.match(reportSubmissionError({ status: 'IN_PROGRESS', assessorId: 'ASR-1', userId: 'ASR-2', declarationAccepted: true, reportAlreadySubmitted: false })!, /assigned assessor/);
});

test('review rejects stale or unsigned report versions and blocks provisional imported approval', () => {
  const report = { id: 'RPT-1', version: 2, status: 'SUBMITTED_FOR_REVIEW', assessorSignoff: { userId: 'ASR-1', accepted: true, version: 2 } };
  const base = { status: 'AWAITING_REVIEW', assessorId: 'ASR-1', report, snapshotIntegrityValid: true, reportId: 'RPT-1', reportVersion: 2, decision: 'APPROVED', reviewerDeclarationAccepted: true, contentClassification: 'SYNTHETIC_DEMO' };
  assert.equal(reportReviewError(base), null);
  assert.match(reportReviewError({ ...base, reportVersion: 1 })!, /version changed/);
  assert.match(reportReviewError({ ...base, report: { ...report, assessorSignoff: null } })!, /assessor sign-off/);
  assert.match(reportReviewError({ ...base, assessorId: null })!, /does not match the assessor/);
  assert.match(reportReviewError({ ...base, report: { ...report, assessorSignoff: { ...report.assessorSignoff, userId: 'ASR-2' } } })!, /does not match the assessor/);
  assert.match(reportReviewError({ ...base, snapshotIntegrityValid: false })!, /integrity hash/);
  assert.match(reportReviewError({ ...base, contentClassification: 'PROVISIONAL_IMPORTED' })!, /provisional/);
  assert.match(reportReviewError({ ...base, decision: 'RETURNED', reviewerDeclarationAccepted: false })!, /reviewer declaration/);
});

test('worker report visibility is limited to approved report statuses', () => {
  assert.equal(workerCanViewReport('APPROVED'), true);
  assert.equal(workerCanViewReport('SIGNED_OFF'), true);
  assert.equal(workerCanViewReport('SUBMITTED_FOR_REVIEW'), false);
  assert.equal(workerCanViewReport('RETURNED'), false);
});

test('PDF output wraps long recorded content across pages without truncating it', async () => {
  const snapshot = createReportSnapshot({ assessment, candidate: { id: 'CAN-1', name: 'Demo Holder', yearsExperience: 4 }, assessor: { id: 'ASR-1', displayName: 'Demo Assessor' }, bundle, reportId: 'RPT-1', version: 1, at: '2026-01-02T00:00:00Z', performanceCriteria: [{ id: 'pc-1', description: 'Isolate safely' }], evidence: [] });
  const persistedSnapshot = JSON.parse(JSON.stringify(snapshot));
  persistedSnapshot.viva = Array.from({ length: 45 }, (_, index) => ({ question: `Question ${index + 1}`, response: `Recorded response ${index + 1}. ${'Long response details '.repeat(14)}`, judgement: 'ANSWERED' }));
  const pdf = await reportPdf(persistedSnapshot, 'SUBMITTED_FOR_REVIEW', { name: 'Demo Assessor', userId: 'ASR-1', version: 1, signedAt: '2026-01-02T00:00:00Z' }, null);
  const content = pdf.toString('latin1');
  assert.match(content, /^%PDF-/);
  assert.ok(pdf.length > 4000);
  assert.ok(content.toLowerCase().includes(Buffer.from('Demo Holder', 'ascii').toString('hex')), 'PDF must render the persisted Skill Holder name');
  assert.match(content, /\/Type \/Page/);
  const pageCount = (content.match(/\/Type \/Page\n/g) || []).length;
  assert.ok(pageCount >= 2, 'long recorded content must flow onto additional pages instead of being clipped');
  assert.ok(content.includes(Buffer.from('Question 45', 'ascii').toString('hex')), 'last recorded viva question must be retained');
  assert.ok(content.includes(Buffer.from('Long response details', 'ascii').toString('hex')), 'long recorded viva responses must remain in the PDF');
  assert.match(content, /\/Info/);
  assert.match(content, /%%EOF/);
  const compact = await reportPdf(snapshot, 'IN_PROGRESS', null, null);
  assert.ok((compact.toString('latin1').match(/\/Type \/Page\n/g) || []).length <= 2);
});

test('showcase report is built from the synthetic demo catalogue and remains a separate repeatable fixture', async () => {
  const catalogue = JSON.parse(readFileSync(resolve(process.cwd(), 'database/seeds/domestic-electrician-demo.json'), 'utf8'));
  const fixture = JSON.parse(readFileSync(resolve(process.cwd(), 'database/seeds/showcase-report.json'), 'utf8'));
  const first = createShowcaseReport(catalogue, fixture), again = createShowcaseReport(catalogue, fixture);
  assert.equal(first.report.id, 'SKILLSETU-SHOWCASE-RPL-01');
  assert.equal(first.report.id, again.report.id);
  assert.equal(first.snapshot.showcase, true);
  assert.equal(first.snapshot.skillHolder.name, 'Arjun Kumar');
  assert.equal(first.snapshot.qualification.provisional, true);
  assert.equal(first.snapshot.outcome.status, 'ILLUSTRATIVE ONLY');
  assert.equal(first.assessorSignoff.simulated, true);
  assert.equal(first.reviewerSignoff?.simulated, true);
  assert.ok(first.snapshot.nosResults.length > 0);
  assert.ok(first.snapshot.evidence.every((item: any) => item.status === 'SYNTHETIC_REFERENCE_ONLY'));
  const preview = reportPreviewHtml(first.snapshot, 'DEMONSTRATION_SAMPLE', first.assessorSignoff, first.reviewerSignoff, undefined, undefined, '/api/showcase-report/download');
  const pdf = (await reportPdf(first.snapshot, 'DEMONSTRATION_SAMPLE', first.assessorSignoff, first.reviewerSignoff)).toString('latin1').toLowerCase();
  assert.match(preview, /Arjun Kumar/);
  assert.match(preview, /DEMONSTRATION SAMPLE — Synthetic data and simulated sign-offs/);
  assert.match(preview, /15 Oct 2026/);
  assert.doesNotMatch(preview, /2026-10-15T/);
  assert.match(preview, /href="\/api\/showcase-report\/download">Download PDF/);
  for (const value of ['Declared skills', 'Assessment Tests and Results', 'DEMO-PC-01', 'DEMO-NOS-DE-01', 'SHOWCASE-EVIDENCE-01', 'ILLUSTRATIVE ONLY', 'Simulated Assessor', 'Simulated Reviewer']) assert.ok(preview.includes(value), `complete preview should include ${value}`);
  assert.match(pdf, /^%pdf-/);
  assert.ok(pdf.length > 10000, 'showcase PDF should render the persisted report snapshot and both simulated sign-offs');
});

