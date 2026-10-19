import { randomBytes } from 'node:crypto';
import PDFDocument from 'pdfkit';
import {buildAssessmentMappingSnapshot,summarizeNosScores} from './mapping-engine';

const text = (value: unknown) => String(value ?? '').trim();

export function createReportSnapshot(input: {
  assessment: any; candidate: any; assessor: any; bundle: any; reportId: string; version: number; at: string;
  performanceCriteria: any[]; evidence: any[]; declaration?: any; assessmentEvents?: any[];
}): any {
  const { assessment: a, candidate: c, assessor, bundle } = input;
  const qp = (bundle.qualificationPacks || []).find((item: any) => item.id === a.qualificationPackId) || null;
  const taskIds = new Set<string>((a.scopeTaskIds || []).map(String));
  const mappingSnapshot=a.mappingSnapshot||buildAssessmentMappingSnapshot(bundle,String(a.qualificationPackId||qp?.id||''),[...taskIds],[]);
  const mappings = mappingSnapshot.taskMappings?.length?mappingSnapshot.taskMappings.map((m:any)=>({...m,nosId:m.nosId,criterionIds:m.criterionIds||[],mappingStatus:m.status})):((bundle.taskMappings || []).filter((m: any) => taskIds.has(String(m.taskId)) && (!qp || (bundle.standards || []).some((n: any) => n.id === m.nosId && n.qpId === qp.id))));
  const nosIds = new Set(mappings.map((m: any) => String(m.nosId)));
  const scoreByCriterion = new Map((a.scores || []).map((score: any) => [String(score.criterionId), score]));
  const pcIds = new Set(mappings.flatMap((m: any) => Array.isArray(m.criterionIds) ? m.criterionIds.map(String) : []));
  const frozenCriteria = mappingSnapshot.performanceCriteria || [];
  const criteria = frozenCriteria.length ? frozenCriteria : input.performanceCriteria.filter((criterion: any) => pcIds.has(String(criterion.id)));
  const criteriaResults = criteria.map((criterion: any) => {
    const score: any = scoreByCriterion.get(String(criterion.id));
    const anchors = Array.isArray(criterion.anchors) ? criterion.anchors : [];
    const maxScore = anchors.reduce((max: number, anchor: any) => Number.isInteger(anchor.score) ? Math.max(max, anchor.score) : max, -1);
    const awardedAnchor = anchors.find((anchor: any) => anchor.score === score?.score);
    return { id: criterion.id, description: criterion.description, safetyCritical: criterion.safetyCritical === true, score: Number.isInteger(score?.score) ? score.score : null, maxScore: maxScore >= 0 ? maxScore : null, rating: awardedAnchor?.description || null, notAssessed: score?.notAssessed === true, observation: text(score?.observation), reason: text(score?.reason), evidenceIds: input.evidence.filter((e: any) => e.criterionId === criterion.id).map((e: any) => e.id) };
  });
  const scoreSummary=summarizeNosScores(bundle,a);
  const scopedNos = mappingSnapshot.nos?.length ? mappingSnapshot.nos : (bundle.standards || []).filter((nos: any) => nosIds.has(String(nos.id)));
  const nosResults = scopedNos.map((nos: any) => {
    const linked = mappings.filter((mapping: any) => mapping.nosId === nos.id);
    const linkedPcIds = new Set(linked.flatMap((mapping: any) => Array.isArray(mapping.criterionIds) ? mapping.criterionIds.map(String) : []));
    const summary=scoreSummary.find((item:any)=>String(item.id)===String(nos.id));
    return { id: nos.id, code: nos.code, title: nos.title, mappingStatus: summary?.mappingStatus||nos.status||nos.mappingStatus||'UNMAPPED', scoreObtained:summary?.scoreObtained??null,maxScore:summary?.maxScore??null,result:summary?.result||'NOT_DETERMINED',limitation:summary?.limitation||'No approved scoring rule is configured.',criteria: criteriaResults.filter((criterion: any) => linkedPcIds.has(String(criterion.id))) };
  });
  const sourceVerified = mappingSnapshot.classification !== 'SYNTHETIC_DEMO' && bundle.contentSet?.productionApproved === true && bundle.contentSet?.assessmentReady === true && bundle.contentSet?.passThresholdVerified === true;
  const assignedEvent = (input.assessmentEvents || []).find((event: any) => event.action === 'assessment.assigned' || event.action === 'assessment.started');
  const recordedTaskIds = new Set<string>();
  for (const mapping of mappings) if ((mapping.criterionIds || []).some((id: string) => scoreByCriterion.has(String(id)))) recordedTaskIds.add(String(mapping.taskId));
  for (const entry of a.viva || []) {
    const question = (mappingSnapshot.vivaQuestions||[]).find((item:any)=>String(item.id)===String(entry.questionId))||(bundle.vivaQuestions || []).find((item: any) => String(item.id) === String(entry.questionId));
    if (question?.taskId && taskIds.has(String(question.taskId))) recordedTaskIds.add(String(question.taskId));
  }
  const practicalTasks = [...recordedTaskIds].map((id) => {
    const mapping = mappings.find((item: any) => String(item.taskId) === id);
    const task = (bundle.practicalAssessmentTasks || []).find((item: any) => String(item.id) === id);
    const linked = (mapping?.criterionIds || []).map((criterionId: string) => criteriaResults.find((item: any) => String(item.id) === String(criterionId))).filter(Boolean);
    return { id, label: mapping?.taskLabel || task?.label || id, nosId: mapping?.nosId || null, mappingStatus: mapping?.mappingStatus || 'NOT_VERIFIED', status: linked.length && linked.every((item: any) => item.score !== null || item.notAssessed) ? 'ASSESSMENT_RECORDED' : 'PARTIAL', criteria: linked, observation: linked.map((item: any) => item.observation).filter(Boolean).join('; '), evidenceIds: [...new Set(linked.flatMap((item: any) => item.evidenceIds))] };
  });
  const activities = criteriaResults.filter((item: any) => item.score !== null || item.notAssessed).map((item: any) => {
    const mapping = mappings.find((candidate: any) => (candidate.criterionIds || []).includes(item.id));
    return { id: item.id, type: 'RUBRIC_CRITERION', label: item.description, taskId: mapping?.taskId || null, taskLabel: mapping?.taskLabel || mapping?.taskId || 'Task not mapped', method: a.preferredMethod || 'Not recorded', nosId: mapping?.nosId || null, criterionId: item.id, result: item.notAssessed ? 'NOT_ASSESSED' : Number.isInteger(item.score) ? 'RAW_SCORE_RECORDED' : 'INCOMPLETE', score: item.score, maxScore: item.maxScore, rating: item.rating, observation: item.observation, reason: item.reason, safetyCritical: item.safetyCritical, evidenceIds: item.evidenceIds };
  });
  const viva = (a.viva || []).filter((entry: any) => String(entry.response || '').trim() || (entry.judgement === 'NOT_ASSESSED' && String(entry.reason || '').trim())).map((entry: any) => {
    const question = (mappingSnapshot.vivaQuestions||[]).find((item:any)=>String(item.id)===String(entry.questionId))||(bundle.vivaQuestions || []).find((item: any) => String(item.id) === String(entry.questionId));
    return { questionId: entry.questionId, question: question?.question || entry.question || '', expectedFocus: question?.expectedFocus || entry.expectedFocus || null, taskId: question?.taskId || null, nosId: question?.nosId || null, response: entry.response || '', judgement: entry.judgement || 'NOT_RECORDED', result: entry.judgement === 'NOT_ASSESSED' ? 'NOT_ASSESSED' : entry.response ? 'RESPONSE_RECORDED' : 'INCOMPLETE', reason: entry.reason || '' };
  });
  const activitiesRequired = criteriaResults.length + viva.length;
  const activitiesCompleted = activities.filter((item: any) => item.result === 'RAW_SCORE_RECORDED').length + viva.filter((item: any) => item.result === 'RESPONSE_RECORDED').length;
  return {
    id: input.reportId, version: input.version, generatedAt: input.at,
    assessment: { id: a.id, requestId: a.id, method: a.preferredMethod || 'Not recorded', methods: [a.preferredMethod].filter(Boolean), status: 'SUBMITTED_FOR_REVIEW', startedAt: assignedEvent?.at || a.startedAt || null, submittedAt: input.at, observations: a.draftResult?.observation || '', contentSetId: a.contentSetId, contentVersion: a.contentVersion, rubricVersion: a.rubricVersion },
    qualification: { title: mappingSnapshot.qualificationPackTitle||qp?.title || bundle.contentSet?.trade || 'Qualification not recorded', code: sourceVerified ? (mappingSnapshot.qualificationPackCode||qp?.code || qp?.id || null) : null, nsqfLevel: sourceVerified ? (mappingSnapshot.nsqfLevel??qp?.nsqfLevel??null) : null, awardingBody: sourceVerified ? (mappingSnapshot.awardingBody||qp?.awardingBody||null) : null, source: mappingSnapshot.qualificationSource||bundle.contentSet?.source || 'Not supplied', classification: mappingSnapshot.classification||bundle.contentSet?.classification || 'UNVERIFIED', provisional: !sourceVerified },
    skillHolder: { id: c.id, name: text(c.canonicalName || c.name), yearsExperience: c.yearsExperience, experienceSource: c.experienceSource || null, experienceSummary: c.experienceSummary || null, occupation: c.occupation || bundle.contentSet?.trade || null, declaredSkills: (input.declaration?.taskIds || c.taskIds || a.scopeTaskIds || []).map((id: string) => ({ id, label: (bundle.taskMappings || []).find((task: any) => String(task.taskId) === String(id))?.taskLabel || id })) },
    declaration: { id: input.declaration?.id || a.declarationId || null, submittedAt: input.declaration?.submittedAt || input.declaration?.updatedAt || input.declaration?.createdAt || null, description: input.declaration?.description || c.description || '', tasks: (input.declaration?.taskIds || c.taskIds || []).map((id: string) => (bundle.taskMappings || []).find((task: any) => String(task.taskId) === String(id))?.taskLabel || id) },
    assessor: { id: assessor.id, name: assessor.displayName, role: assessor.role || 'ASSESSOR', assessmentId: a.id, assignedToAssessment: a.assessorId === assessor.id },
    mappingSnapshot, nosResults, criteriaResults,
    practicalTasks, activities, viva,
    evidence: input.evidence.map((e: any) => ({ id: e.id, fileName: e.fileName || e.metadata?.description || 'Evidence reference', description: e.description || e.metadata?.description || '', sha256: e.sha256 || null, criterionId: e.criterionId || null, status: e.status || 'METADATA_ONLY' })),
    rubricVersion: a.rubricVersion, summary: { activitiesRequired, activitiesCompleted, passed: null, notPassed: null, incompleteOrNotAssessed: Math.max(0, activitiesRequired - activitiesCompleted), calculation: 'Passed/not-passed counts are unavailable because no approved outcome decision rule is configured.' }, recommendations: { status: 'NOT_RECORDED', items: [], limitation: 'Skill gaps and remediation recommendations are not stored separately by the current assessment workflow; none are inferred.' }, outcome: { status: 'NOT_DETERMINED', explanation: sourceVerified ? 'No approved outcome decision rule is configured for this content version. This report records assessment evidence and human review only.' : 'The qualification or assessment standard is provisional or unverified. No competency or certification outcome can be determined.' },
    assessorSignoff: null, reviewerSignoff: null, reviewComments: [], legacySnapshot: false,
  };
}

export function reportPdf(snapshot: any, status: string, assessorSignoff: any, reviewerSignoff: any, documentHash?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 42, left: 42, right: 42 }, bufferPages: true, compress: false, info: { Title: `SkillSetu RPL Assessment Report ${snapshot.id} v${snapshot.version}`, Author: 'SkillSetu', Subject: 'Assessment report' } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    const left = doc.page.margins.left, right = doc.page.width - doc.page.margins.right, width = right - left;
    const pageLimit = () => doc.page.height - doc.page.margins.bottom;
    const date = (value: unknown) => {
      const raw = text(value);
      if (!raw) return 'Not recorded';
      const parsed = new Date(raw);
      return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
    };
    const clean = (value: unknown, fallback = 'Not recorded') => text(value).replace(/\s+/g, ' ') || fallback;
    const header = () => {
      doc.save(); doc.fillColor('#123b58').font('Helvetica-Bold').fontSize(9).text('SkillSetu', left, 19, { lineBreak: false });
      doc.fillColor('#49636b').font('Helvetica').fontSize(8).text(`RPL Assessment Report · v${snapshot.version} · ${status.replaceAll('_', ' ')}`, left + 61, 20, { width: width - 61, lineBreak: false });
      doc.strokeColor('#cad9d9').moveTo(left, 34).lineTo(right, 34).stroke(); doc.restore(); doc.y = 43; doc.x = left;
    };
    const ensure = (height: number) => { if (doc.y + height > pageLimit()) doc.addPage(); };
    const paragraph = (value: unknown, size = 8, color = '#263b43') => {
      const rendered = clean(value); doc.font('Helvetica').fontSize(size);
      const h = doc.heightOfString(rendered, { width, lineGap: 1 });
      ensure(h + 5); doc.fillColor(color).font('Helvetica').fontSize(size).text(rendered, left, doc.y, { width, lineGap: 1 }); doc.moveDown(0.2);
    };
    const section = (title: string) => {
      ensure(25); const y = doc.y + 2; doc.fillColor('#087e78').font('Helvetica-Bold').fontSize(9.5).text(title, left, y, { width, lineBreak: false });
      doc.moveTo(left, y + 13).lineTo(right, y + 13).strokeColor('#d6e3e2').stroke(); doc.y = y + 17;
    };
    const table = (headers: string[], rows: string[][], ratios: number[], fontSize = 7.5) => {
      const widths = ratios.map((ratio) => width * ratio);
      const rowHeight = (cells: string[], isHeader: boolean) => Math.max(isHeader ? 18 : 16, ...cells.map((cell, index) => {
        doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(isHeader ? 7.2 : fontSize);
        return doc.heightOfString(clean(cell), { width: widths[index] - 10, lineGap: 0.5 }) + 8;
      }));
      const draw = (cells: string[], isHeader: boolean) => {
        const h = rowHeight(cells, isHeader); ensure(h);
        const y = doc.y; let x = left;
        cells.forEach((cell, index) => {
          doc.save().fillColor(isHeader ? '#eaf3f2' : '#ffffff').strokeColor('#d0dddd').rect(x, y, widths[index], h).fillAndStroke();
          doc.fillColor('#233b43').font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(isHeader ? 7.2 : fontSize).text(clean(cell), x + 5, y + 4, { width: widths[index] - 10, lineGap: 0.5 });
          doc.restore(); x += widths[index];
        });
        doc.y = y + h;
      };
      draw(headers, true);
      rows.forEach((row) => {
        const h = rowHeight(row, false);
        if (doc.y + h > pageLimit()) { doc.addPage(); draw(headers, true); }
        draw(row, false);
      });
      doc.moveDown(0.25);
    };

    header(); doc.on('pageAdded', header);
    doc.fillColor('#123c59').font('Helvetica-Bold').fontSize(14).text('Recognition of Prior Learning Assessment Report', left, doc.y, { width });
    doc.moveDown(0.15);
    paragraph(`Report ID ${snapshot.id} · Version ${snapshot.version} · Status ${status.replaceAll('_', ' ')} · Generated ${date(snapshot.generatedAt)}`, 7.6);
    if (snapshot.showcase) {
      ensure(32); const y = doc.y; doc.save().fillColor('#fff2d5').strokeColor('#e8cd91').roundedRect(left, y, width, 30, 4).fillAndStroke(); doc.restore();
      doc.fillColor('#634c13').font('Helvetica-Bold').fontSize(8).text('DEMONSTRATION SAMPLE — SYNTHETIC DATA', left + 7, y + 5, { width: width - 14 });
      doc.fillColor('#634c13').font('Helvetica').fontSize(7).text('Simulated sign-offs. Not an official assessment, competency decision or certification.', left + 7, y + 17, { width: width - 14 }); doc.y = y + 35;
    } else if (snapshot.profileNameRecovered) {
      paragraph('Profile name restored from the linked saved profile. The original report snapshot omitted the name; obtain a newly signed version to bind the corrected display.', 7);
    }
    if (snapshot.qualification?.provisional) paragraph('PROVISIONAL / UNVERIFIED qualification content. No official competency or certification outcome is established.', 7);

    section('A. Skill Holder Details');
    doc.fillColor('#123b58').font('Helvetica-Bold').fontSize(11).text(clean(snapshot.skillHolder?.name), left, doc.y, { width }); doc.moveDown(0.12);
    table(['Skill Holder ID', 'Trade / qualification', 'Experience', 'Assessment date'], [[clean(snapshot.skillHolder?.id), `${clean(snapshot.skillHolder?.occupation || snapshot.qualification?.title)} / ${clean(snapshot.qualification?.title)}${snapshot.qualification?.provisional ? ' (provisional)' : ''}`, `${snapshot.skillHolder?.yearsExperience ?? 'Not recorded'} years · ${clean(snapshot.skillHolder?.experienceSummary || snapshot.skillHolder?.experienceSource)}`, date(snapshot.assessment?.startedAt)]], [0.19, 0.31, 0.31, 0.19], 7.2);
    paragraph(`Declared skills: ${(snapshot.skillHolder?.declaredSkills || []).map((item: any) => item.label).join('; ') || 'Not recorded'} · Method: ${clean(snapshot.assessment?.method)} · Content / rubric: ${clean(snapshot.assessment?.contentVersion, '—')} / ${clean(snapshot.rubricVersion, '—')}`, 7.3);
    paragraph(`Qualification source: ${clean(snapshot.qualification?.source)} · Classification: ${clean(snapshot.qualification?.classification)} · Code / NSQF / awarding body: ${clean(snapshot.qualification?.code, 'Unverified')} / ${snapshot.qualification?.nsqfLevel ?? 'Unverified'} / ${clean(snapshot.qualification?.awardingBody, 'Unverified')}`, 7);
    paragraph(`Declaration ${clean(snapshot.declaration?.id)} · Submitted ${date(snapshot.declaration?.submittedAt)} · ${clean(snapshot.declaration?.description)}`, 7);

    section('B. Assessment Results');
    const entries = [
      ...(snapshot.activities || []).map((item: any) => ({ label: `${item.taskLabel || 'Task'} · ${item.id}: ${item.label}`, score: item.score === null ? (item.notAssessed ? `Not assessed${item.reason ? `: ${item.reason}` : ''}` : 'Not recorded') : `${item.score} / ${item.maxScore ?? 'max unavailable'}`, result: `${item.result === 'RAW_SCORE_RECORDED' ? 'Raw score recorded' : item.result.replaceAll('_', ' ')}${item.rating ? ` · ${item.rating}` : ''}`, observation: item.observation || item.reason || 'No observation recorded' })),
      ...(snapshot.viva || []).map((item: any) => ({ label: `Viva · ${item.questionId}: ${item.question}`, score: '—', result: item.judgement === 'NOT_ASSESSED' ? 'Not assessed' : item.response ? 'Response recorded' : 'Incomplete', observation: item.response || item.reason || 'No response recorded' })),
    ];
    table(['Task / test actually recorded', 'Score', 'Result', 'Observation / viva response'], entries.map((item: any) => [item.label, item.score, item.result, item.observation]), [0.32, 0.12, 0.18, 0.38], 7.2);
    if (!entries.length) paragraph('No practical or viva activity has been recorded.', 7.5);

    section('C. Assessed Tasks and Mapping');
    const taskRows = (snapshot.practicalTasks || []).map((task: any) => [task.label || task.id, task.nosId || 'NOS not mapped', task.mappingStatus || 'NOT_VERIFIED', task.status || 'Not recorded', task.observation || 'No task-level observation recorded']);
    table(['Task', 'NOS reference', 'Mapping status', 'Assessment record', 'Task observation'], taskRows, [0.24, 0.15, 0.16, 0.16, 0.31], 7.1);
    if (!taskRows.length) paragraph('No task-level records are available; no additional task mapping is inferred.', 7.2);

    section('D. Rubric / NOS Summary');
    const nosRows = (snapshot.nosResults || []).map((nos: any) => {
      const scores = (nos.criteria || []).map((criterion: any) => `${criterion.id} ${criterion.notAssessed ? 'NA' : criterion.score === null ? 'NR' : `${criterion.score}/${criterion.maxScore ?? '?'}`}${criterion.safetyCritical ? '*' : ''}`).join(', ');
      const finding = (nos.criteria || []).map((criterion: any) => criterion.observation || criterion.reason).filter(Boolean).join('; ');
      return [`${nos.code || nos.id} · ${nos.title || 'NOS'}`, nos.scoreObtained===null||nos.scoreObtained===undefined?'Unavailable':String(nos.scoreObtained),nos.maxScore===null||nos.maxScore===undefined?'Unavailable':String(nos.maxScore),nos.result||'NOT_DETERMINED',nos.mappingStatus||'UNMAPPED',scores||nos.limitation||'No rubric scores',finding||'No finding recorded'];
    });
    table(['NOS', 'Score obtained', 'Maximum', 'Result', 'Mapping status', 'Criterion scores / limitation', 'Findings'], nosRows, [0.19, 0.09, 0.08, 0.12, 0.12, 0.2, 0.2], 6.8);
    if (!nosRows.length) paragraph('No reliable NOS mapping is available; relationships are not inferred.', 7.5);
    paragraph('Scores are raw rubric records. No aggregate or pass/fail is calculated without an approved decision rule.', 7);
    paragraph(`Assessment summary: required ${snapshot.summary?.activitiesRequired ?? 'Not available'} · recorded ${snapshot.summary?.activitiesCompleted ?? 'Not available'} · passed ${snapshot.summary?.passed ?? 'Unavailable — no approved rule'} · not passed ${snapshot.summary?.notPassed ?? 'Unavailable — no approved rule'} · incomplete / not assessed ${snapshot.summary?.incompleteOrNotAssessed ?? 'Not available'}. ${clean(snapshot.summary?.calculation, 'No approved aggregation rule is configured; no overall score or competency outcome is inferred.')}`, 6.9);

    section('E. Evidence References');
    const evidenceRows = (snapshot.evidence || []).map((item: any) => [item.id || 'Reference', item.fileName || item.description || 'Evidence reference', item.status || 'Not recorded', item.sha256 || 'Hash unavailable', item.description || 'No description recorded']);
    table(['Evidence ID', 'File / reference', 'Integrity status', 'SHA-256', 'Description'], evidenceRows, [0.13, 0.2, 0.16, 0.22, 0.31], 6.8);
    if (!evidenceRows.length) paragraph('No evidence references were recorded.', 7.2);
    paragraph('Evidence details are references to stored records; synthetic references are not actual uploaded or verified evidence.', 6.8);

    section('F. Final Outcome');
    paragraph(`${snapshot.outcome?.status || 'NOT_DETERMINED'} · ${snapshot.outcome?.explanation || 'No supported outcome rationale is recorded.'}`, 7.5);
    const recommendations = (snapshot.recommendations?.items || []).map((item: any) => typeof item === 'string' ? item : item.label || item.description || '').filter(Boolean);
    paragraph(recommendations.length ? `Recommendations: ${recommendations.join('; ')}` : snapshot.recommendations?.limitation || 'No separately recorded skill-gap or training recommendation; none inferred.', 7);
    paragraph(`Report approval is not an official certification decision.${documentHash && !snapshot.profileNameRecovered ? ` Snapshot SHA-256 ${documentHash}.` : ''}`, 6.8);

    section('G. Signatures');
    const signatureGap = 10, sigWidth = (width - signatureGap) / 2;
    const signatureBlock = (x: number, title: string, item: any, pending: string, y: number, h: number) => {
      doc.save().fillColor('#f8fbfb').strokeColor('#cbd8d8').roundedRect(x, y, sigWidth, h, 3).fillAndStroke(); doc.restore();
      doc.fillColor('#087e78').font('Helvetica-Bold').fontSize(7.5).text(title, x + 6, y + 5, { width: sigWidth - 12 });
      const lines = item ? `${clean(item.name)} · ${clean(item.role || title)}\n${date(item.signedAt)} · Version ${item.version ?? snapshot.version} · ${clean(item.decision, 'SIGNED')}\n${clean(item.declarationText, 'No sign-off declaration supplied.')}` : pending;
      doc.fillColor('#263b43').font('Helvetica').fontSize(7).text(lines, x + 6, y + 18, { width: sigWidth - 12, lineGap: 1 });
      doc.fillColor('#526b70').font('Helvetica-Bold').fontSize(6.3).text(item ? (item.simulated ? 'SIMULATED SIGN-OFF · NOT AUTHENTICATED' : 'APPLICATION SIGN-OFF · NOT A DIGITAL CERTIFICATE') : 'PENDING', x + 6, y + h - 14, { width: sigWidth - 12 });
    };
    const signatureHeight = Math.max(82, ...[assessorSignoff, reviewerSignoff].map((item: any) => {
      const content = item ? `${clean(item.name)} · ${clean(item.role)}\n${date(item.signedAt)} · Version ${item.version ?? snapshot.version} · ${clean(item.decision, 'SIGNED')}\n${clean(item.declarationText, 'No sign-off declaration supplied.')}` : 'Sign-off pending';
      doc.font('Helvetica').fontSize(7); return doc.heightOfString(content, { width: sigWidth - 12, lineGap: 1 }) + 36;
    })); ensure(signatureHeight + 4); const sigY = doc.y;
    signatureBlock(left, 'ASSESSOR', assessorSignoff, 'Assessor sign-off pending', sigY, signatureHeight);
    signatureBlock(left + sigWidth + signatureGap, 'ADMIN / REVIEWER', reviewerSignoff, 'Reviewer decision and sign-off pending', sigY, signatureHeight);
    doc.y = sigY + signatureHeight + 4;
    if (snapshot.reviewComments?.length) paragraph(`Latest reviewer note: ${snapshot.reviewComments[snapshot.reviewComments.length - 1].text}`, 6.8);
    const range = doc.bufferedPageRange();
    for (let page = range.start; page < range.start + range.count; page++) {
      doc.switchToPage(page);
      doc.save().fillColor('#718187').font('Helvetica').fontSize(6.5)
        .text(`SkillSetu · ${snapshot.id} · Page ${page - range.start + 1} of ${range.count}`, left, doc.page.height - 60, { width, align: 'center', lineBreak: false });
      doc.restore();
    }
    doc.end();
  });
}

export const reportId = () => `RPT-${randomBytes(5).toString('hex').toUpperCase()}`;

const html = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const reportDate = (value: unknown) => {
  const raw = text(value);
  if (!raw) return 'Not recorded';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
};
const cells = (values: unknown[]) => `<tr>${values.map((value) => `<td>${html(value || '—')}</td>`).join('')}</tr>`;
export function reportPreviewHtml(snapshot: any, status: string, assessorSignoff: any, reviewerSignoff: any, documentHash?: string, evidenceBase?: string, downloadUrl?: string) {
  const criteria = snapshot.criteriaResults || [];
  const evidence = snapshot.evidence || [];
  const evidenceRows = evidence.map((item: any) => `<tr><td>${html(item.id)}</td><td>${evidenceBase ? `<a href="${html(evidenceBase)}${encodeURIComponent(item.id)}">${html(item.fileName)}</a>` : html(item.fileName)}</td><td>${html(item.status)}</td><td>${html(item.sha256 || 'Hash unavailable')}</td><td>${html(item.description)}</td></tr>`);
  const rubricRows = criteria.map((item: any) => cells([`${item.id} · ${item.description}${item.safetyCritical ? ' · Safety-critical' : ''}`, item.notAssessed ? `Not assessed: ${item.reason}` : item.score === null ? 'Not recorded' : `${item.score} / ${item.maxScore ?? 'maximum unavailable'}`, item.rating || 'Not defined', item.observation || item.reason || 'Not recorded', item.evidenceIds?.join(', ') || 'None']));
  const taskRows = (snapshot.practicalTasks || []).map((item: any) => cells([item.id, item.label, item.nosId || 'NOS not mapped', item.mappingStatus || 'NOT_VERIFIED', item.status, item.observation || 'No observation recorded', item.evidenceIds?.join(', ') || 'None']));
  const testRows = [
    ...(snapshot.activities || []).map((item: any) => cells([item.id, item.label, item.method, `NOS ${item.nosId || 'not mapped'} · criterion ${item.criterionId}`, `${item.observation || item.reason || 'No observation recorded'}${item.score !== null ? ` · ${item.score}/${item.maxScore ?? 'max unavailable'}` : ''}`, item.result, item.evidenceIds?.join(', ') || 'None'])),
    ...(snapshot.viva || []).map((item: any) => cells([item.questionId, item.question || 'Question text unavailable', snapshot.assessment.method, `Task ${item.taskId || 'not mapped'} · NOS ${item.nosId || 'not mapped'}`, `${item.response || 'No response recorded'}${item.reason ? ` · ${item.reason}` : ''}`, `${item.judgement} · ${item.result}`, 'See evidence references'])),
  ];
  const nosScoreRows=(snapshot.nosResults||[]).map((nos:any)=>cells([`${nos.code||nos.id} · ${nos.title||'NOS'}`,nos.mappingStatus||'UNMAPPED',nos.scoreObtained===null||nos.scoreObtained===undefined?'Unavailable':nos.scoreObtained,nos.maxScore===null||nos.maxScore===undefined?'Unavailable':nos.maxScore,nos.result||'NOT_DETERMINED',nos.limitation||'No result rule supplied.']));
  const nosSections = (snapshot.nosResults || []).map((nos: any) => `<h3>${html(nos.code || nos.id)} · ${html(nos.title || 'NOS title not supplied')} <small>Mapping: ${html(nos.mappingStatus || 'NOT_VERIFIED')}</small></h3><table><thead><tr><th>Performance criterion</th><th>Score / max</th><th>Finding</th></tr></thead><tbody>${(nos.criteria || []).map((item: any) => cells([`${item.id} · ${item.description}${item.safetyCritical ? ' · Safety-critical' : ''}`, item.notAssessed ? `Not assessed: ${item.reason}` : item.score === null ? 'Not recorded' : `${item.score} / ${item.maxScore ?? 'maximum unavailable'}`, `${item.rating ? `${item.rating} · ` : ''}${item.observation || item.reason || 'Not recorded'}`])).join('') || '<tr><td colspan="3">No criterion records.</td></tr>'}</tbody></table>`).join('');
  const signoff = (title: string, item: any, pending: string) => `<article><h2>${title}</h2><p>${html(item?.declarationText || pending)}</p><p>${item ? `${html(item.name)} (${html(item.userId)}) · ${html(item.role || 'Reviewer') } · ${html(reportDate(item.signedAt))} · Report version ${html(item.version)} · ${html(item.decision || 'SUBMITTED')}` : 'No sign-off recorded.'}</p><small>${item?.simulated ? 'SIMULATED SIGN-OFF — not authenticated.' : item ? 'Authenticated electronic sign-off; not a digital certificate.' : 'Pending.'}</small></article>`;
  const warning = snapshot.showcase ? 'DEMONSTRATION SAMPLE — Synthetic data and simulated sign-offs. Not an official assessment, competency decision or certification.' : snapshot.profileNameRecovered ? 'Candidate name restored from the linked saved profile. The original report snapshot omitted the name; a newly signed version is required.' : snapshot.legacySnapshot ? 'Legacy record reconstructed from retained data; version and signatures are not verified.' : `${status.replaceAll('_', ' ')} · Application report; not an official certificate or government credential.`;
  const taskTable = taskRows.length ? `<table><thead><tr><th>Task ID</th><th>Task</th><th>NOS</th><th>Mapping status</th><th>Assessment record</th><th>Observation</th><th>Evidence</th></tr></thead><tbody>${taskRows.join('')}</tbody></table>` : '<p>No task-level activity is recorded separately. See actual criterion/viva activities below.</p>';
  const htmlText = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>SkillSetu report ${html(snapshot.id)}</title><style>body{font:14px/1.55 system-ui,sans-serif;max-width:1000px;margin:28px auto;padding:0 22px;color:#20333b}h1,h2,h3{color:#155d57}h2{margin-top:26px}table{border-collapse:collapse;width:100%;margin:14px 0;break-inside:auto}tr{break-inside:avoid}td,th{border:1px solid #cbd6d7;text-align:left;padding:7px;vertical-align:top;overflow-wrap:anywhere}th{background:#edf5f4}.warning{padding:14px;background:#fff4dc;border:1px solid #ecd4a5}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:16px}.signatures article{border:1px solid #ccd8d8;padding:14px;break-inside:avoid}.toolbar{margin-bottom:20px;display:flex;gap:12px;align-items:center}.toolbar a,.toolbar button,.download-report{margin:0}.download-report{display:inline-block;padding:8px 12px;border-radius:8px;background:#087e78;color:white;text-decoration:none;font:inherit}@media print{body{margin:0;max-width:none}.toolbar{display:none}}@media(max-width:640px){.signatures{grid-template-columns:1fr}table{font-size:12px}}</style><div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button>${downloadUrl ? `<a class="download-report" href="${html(downloadUrl)}">Download PDF</a>` : ""}</div><h1>SkillSetu · Recognition of Prior Learning (RPL) Assessment Report</h1><p class="warning"><b>${html(warning)}</b></p><p>Report ${html(snapshot.id)} · Version ${html(snapshot.version)} · Assessment request ${html(snapshot.assessment.requestId || snapshot.assessment.id)} · Generated ${html(reportDate(snapshot.generatedAt))} · Assessment date ${html(reportDate(snapshot.assessment.startedAt))} · SHA-256 ${html(documentHash || 'not available')}</p><h2>Skill Holder and self-declaration</h2><p>${html(snapshot.skillHolder.name)} · Skill Holder ID ${html(snapshot.skillHolder.id)} · ${html(snapshot.skillHolder.yearsExperience ?? 'Not recorded')} years declared experience · Source ${html(snapshot.skillHolder.experienceSource || 'Not recorded')}</p><p>Occupation: ${html(snapshot.skillHolder.occupation || 'Not recorded')} · Experience: ${html(snapshot.skillHolder.experienceSummary || 'Not recorded')}</p><p>Declaration ${html(snapshot.declaration?.id || 'Not recorded')} · Submitted ${html(reportDate(snapshot.declaration?.submittedAt))} · ${html(snapshot.declaration?.description || 'No declaration description recorded.')}</p><p>Declared skills: ${html((snapshot.skillHolder.declaredSkills || []).map((x: any) => x.label).join('; ') || 'Not recorded')}</p><p>Declared tasks: ${html((snapshot.declaration?.tasks || []).join('; ') || 'Not recorded')}. These are self-declarations and are not independently verified by this report unless evidence status says otherwise.</p><h2>Qualification and assessment details</h2><p>${html(snapshot.qualification.title)} · Code ${html(snapshot.qualification.code || 'Not verified')} · NSQF ${html(snapshot.qualification.nsqfLevel ?? 'Not verified')} · Awarding body ${html(snapshot.qualification.awardingBody || 'Not verified')} · ${html(snapshot.qualification.provisional ? 'PROVISIONAL / UNVERIFIED' : 'Source verified')}</p><p>Source ${html(snapshot.qualification.source)} · Classification ${html(snapshot.qualification.classification)} · Content ${html(snapshot.assessment.contentVersion)} · Rubric ${html(snapshot.rubricVersion)} · Method ${html(snapshot.assessment.method)} · Status ${html(snapshot.assessment.status)} · Assessor ${html(snapshot.assessor.name)} (${html(snapshot.assessor.id)}) · Role ${html(snapshot.assessor.role || 'ASSESSOR')} · Assigned ${snapshot.assessor.assignedToAssessment ? 'Yes' : 'Not verified'}</p><h2>Skills and Tasks Assessed</h2>${taskTable}<h2>Assessment Tests and Results</h2><table><thead><tr><th>Activity ID</th><th>Test / question</th><th>Method</th><th>Skill / mapping</th><th>Recorded result / observation</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${testRows.join('') || '<tr><td colspan="7">No practical or viva activity was recorded.</td></tr>'}</tbody></table><h2>Rubric-Based Scoring Summary</h2><p>Rubric version: ${html(snapshot.rubricVersion)}. Scores are shown as recorded. No overall score is calculated unless an approved aggregation rule is configured.</p><table><thead><tr><th>Criterion</th><th>Score / maximum</th><th>Rubric level</th><th>Observation / reason</th><th>Evidence references</th></tr></thead><tbody>${rubricRows.join('') || '<tr><td colspan="5">No rubric scores are recorded.</td></tr>'}</tbody></table><h2>NOS-wise Score Summary</h2><p>Only explicit verified mappings and applicable scoring rules contribute to NOS totals. No overall score is inferred.</p><table><thead><tr><th>NOS</th><th>Mapping</th><th>Score obtained</th><th>Maximum</th><th>Result</th><th>Limitation</th></tr></thead><tbody>${nosScoreRows.join('')||'<tr><td colspan="6">No NOS summary is available.</td></tr>'}</tbody></table><h2>NOS-wise findings</h2>${nosSections || '<p>No NOS mapping is available; relationships are not inferred.</p>'}<h2>Assessment summary</h2><p>Activities required: ${html(snapshot.summary?.activitiesRequired ?? 'Not available')} · Recorded: ${html(snapshot.summary?.activitiesCompleted ?? 'Not available')} · Passed: ${html(snapshot.summary?.passed ?? 'Not available — no approved decision rule')} · Not passed: ${html(snapshot.summary?.notPassed ?? 'Not available — no approved decision rule')} · Incomplete or not assessed: ${html(snapshot.summary?.incompleteOrNotAssessed ?? 'Not available')}</p><p>${html(snapshot.summary?.calculation || 'No approved aggregation rule is configured; no overall score or competency outcome is inferred.')}</p><h2>Evidence references</h2><table><thead><tr><th>ID</th><th>File/reference</th><th>Status</th><th>Integrity hash</th><th>Description</th></tr></thead><tbody>${evidenceRows.join('') || '<tr><td colspan="5">No evidence references recorded.</td></tr>'}</tbody></table><h2>Strengths, gaps and recommendations</h2><p>No independently confirmed strengths, skill gaps or remediation recommendation are recorded separately. ${html(snapshot.recommendations?.limitation || 'No recommendation data.')}</p><h2>Assessment outcome and limitations</h2><p><b>${html(snapshot.outcome.status)}.</b> ${html(snapshot.outcome.explanation)}</p><p>Assessment result, reviewer approval, and any official certification decision are separate. Reviewer approval does not itself establish competency or grant certification.</p>${(snapshot.reviewComments || []).map((x: any) => `<p>Reviewer comment (${html(reportDate(x.at))}): ${html(x.text)}</p>`).join('')}<section class="signatures">${signoff('Assessor declaration and sign-off', assessorSignoff, 'Assessor sign-off is pending.')}${signoff('Admin/reviewer decision and sign-off', reviewerSignoff, 'Reviewer sign-off is pending.')}</section></html>`;
  return htmlText;
}

export function createShowcaseReport(bundle: any, fixture: any) {
  if (bundle.contentSet?.classification !== 'SYNTHETIC_DEMO') throw new Error('The showcase report fixture may only use a SYNTHETIC_DEMO content bundle.');
  const qp = (bundle.qualificationPacks || []).find((item: any) => item.id === fixture.qualificationPackId);
  if (!qp) throw new Error(`Showcase report references unavailable qualification pack ${fixture.qualificationPackId}.`);
  const scopedTasks = new Set((fixture.declaration?.taskIds || []).map(String));
  const mappings = (bundle.taskMappings || []).filter((item: any) => scopedTasks.has(String(item.taskId)) && (bundle.standards || []).some((nos: any) => nos.id === item.nosId && nos.qpId === qp.id));
  const mappedCriteria = new Set(mappings.flatMap((item: any) => Array.isArray(item.criterionIds) ? item.criterionIds.map(String) : []));
  const scores = new Map((fixture.scores || []).map((item: any) => [String(item.criterionId), item]));
  const performanceCriteria = (bundle.performanceCriteria || []).filter((item: any) => mappedCriteria.has(String(item.id)));
  for (const score of fixture.scores || []) {
    const criterion = performanceCriteria.find((item: any) => item.id === score.criterionId);
    if (!criterion || !Number.isInteger(score.score) || score.score < 0 || score.score > 4) throw new Error(`Invalid synthetic showcase score for ${score.criterionId}.`);
  }
  const viva = (fixture.vivaResponses || []).map((response: any) => {
    const question = (bundle.vivaQuestions || []).find((item: any) => item.id === response.questionId);
    if (!question || !scopedTasks.has(String(question.taskId))) throw new Error(`Showcase viva response ${response.questionId} is not in the declared task scope.`);
    return { questionId: question.id, question: question.question, expectedFocus: question.expectedFocus, response: response.response, judgement: response.judgement };
  });
  const assessment = { id: fixture.assessmentId, candidateId: fixture.candidate.id, assessorId: fixture.simulatedAssessor.id, status: 'DEMONSTRATION_SAMPLE', declarationId: fixture.declaration.id, contentSetId: bundle.contentSet.id, qualificationPackId: qp.id, scopeTaskIds: [...scopedTasks], contentVersion: bundle.contentSet.version, rubricVersion: `${bundle.contentSet.version}-rubric-demo`, preferredMethod: fixture.assessment.method, startedAt: fixture.assessment.startedAt, createdAt: fixture.assessment.startedAt, updatedAt: fixture.generatedAt, scores: [...scores.values()], viva, draftResult: { observation: fixture.assessment.observations } };
  const candidate = { ...fixture.candidate, taskIds: [...scopedTasks], description: fixture.declaration.description };
  const snapshot = createReportSnapshot({ assessment, candidate, assessor: { id: fixture.simulatedAssessor.id, displayName: fixture.simulatedAssessor.name }, bundle, reportId: fixture.id, version: fixture.version, at: fixture.generatedAt, performanceCriteria, evidence: (fixture.evidence || []).map((item: any) => ({ ...item, status: 'SYNTHETIC_REFERENCE_ONLY', sha256: null })), declaration: fixture.declaration });
  snapshot.showcase = true;
  snapshot.qualification.provisional = true;
  snapshot.outcome = fixture.outcome;
  snapshot.recommendations = { status: 'NOT_RECORDED', items: [], limitation: 'No real competency gaps are inferred from this synthetic demonstration.' };
  snapshot.assessment.status = 'DEMONSTRATION_SAMPLE';
  snapshot.assessment.requestId = 'No real assessment request exists — synthetic sample only';
  snapshot.audit = [
    { at: fixture.generatedAt, action: 'Synthetic assessment report fixture loaded for demonstration' },
    { at: fixture.simulatedAssessor.signedAt, action: 'Simulated assessor sign-off — not a real assessment' },
    ...(fixture.simulatedReviewer ? [{ at: fixture.simulatedReviewer.signedAt, action: 'Simulated reviewer sign-off — not a real approval' }] : []),
  ];
  const assessorSignoff = { userId: fixture.simulatedAssessor.id, name: fixture.simulatedAssessor.name, role: 'ASSESSOR (SIMULATED)', declarationText: 'Synthetic sample only: this simulated assessor sign-off is illustrative and does not attest to a real assessment.', signedAt: fixture.simulatedAssessor.signedAt, version: fixture.version, accepted: true, simulated: true, decision: 'SAMPLE' };
  const reviewerSignoff = fixture.simulatedReviewer ? { userId: fixture.simulatedReviewer.id, name: fixture.simulatedReviewer.name, role: 'REVIEWER (SIMULATED)', declarationText: 'Synthetic sample only: this simulated reviewer sign-off is illustrative and does not approve a real assessment.', signedAt: fixture.simulatedReviewer.signedAt, version: fixture.version, accepted: true, simulated: true, decision: 'ILLUSTRATIVE ONLY' } : null;
  const reviewComments = fixture.simulatedReviewer ? [{ userId: fixture.simulatedReviewer.id, name: fixture.simulatedReviewer.name, text: fixture.simulatedReviewer.comment, at: fixture.simulatedReviewer.signedAt, version: fixture.version }] : [];
  const report: any = { id: fixture.id, version: fixture.version, status: 'DEMONSTRATION_SAMPLE', candidateId: fixture.candidate.id, assessmentId: fixture.assessmentId, decision: fixture.simulatedReviewer ? 'ILLUSTRATIVE' : null, createdAt: fixture.generatedAt, updatedAt: fixture.simulatedReviewer?.signedAt || fixture.generatedAt, simulated: true, reviewComments };
  snapshot.reviewComments = report.reviewComments;
  return { report, snapshot, assessorSignoff, reviewerSignoff };
}
