# Assessment integrity and human decision boundaries

## Roles and workflow

- Skill Holders create their profile, consented experience declaration, and assessment request. They can see only their own reports and results.
- An `ASSESSOR` may accept, score, add evidence to, and submit only an assessment assigned to that account and an authorized occupation. The assessor records a declaration when signing a report.
- An authorized `ADMIN` or `REVIEWER` independently reviews the exact submitted report ID and version, then approves or returns it with comments. The assessing user cannot review their own assessment. Admin access does not itself grant assessor duties.
- Server routes enforce these rules; UI button visibility is not the authorization boundary.

## System assistance and human judgment

SkillSetu stores declarations and evidence, presents versioned mapping suggestions and rubric criteria, validates scores against saved rubric anchors, summarizes eligible recorded values, and prepares report snapshots. Assessors remain responsible for deciding whether evidence demonstrates competence, evaluating practical performance and viva responses, entering justified scores, and deciding whether more evidence or reassessment is needed. Reviewers independently decide whether to approve or return a submitted version.

No overall pass/fail decision is inferred without a configured approved rule. Missing or not-assessed criteria are not treated as zero. Only eligible mapped criteria contribute to NOS summaries; shared criteria are not double counted. A report's human approval is an application workflow sign-off and does not award government certification.

## Qualification provenance

Content bundles are versioned and retain their classification and source information. Synthetic demo content is fictional, not official qualification evidence. `PROVISIONAL_IMPORTED` material remains reference-only and cannot be activated for live assessment. Mapping review annotates existing relationships; it cannot create missing mappings. A `VERIFIED` relationship must be reviewed by an authorized role with a traceable source reference. Content-set approval does not make every individual relationship verified. ELE/Q5804 remains provisional and unavailable for live assessment until validated through the existing controls.

## Scores, reports, and audit records

Assessment work is validated against the saved rubric and content scope. Report generation uses persisted candidate and assessment records, labels unresolved mappings and missing rules, and snapshots the relevant qualification, rubric, evidence references, scores, viva judgments, and sign-offs. Later report workflow decisions reference the exact report version; ordinary APIs do not rewrite its snapshot. Corrections create a later version while preserving prior report history.

Audit entries include actor ID/name/role, action, entity, timestamp, and relevant version/status metadata. Score-work audit entries identify criterion IDs, before/after score state, not-assessed markers and whether reasons were recorded; they do not duplicate raw observations or viva responses. Offline conflicts are recorded once per assessment and sync ID, including compared revisions and version-change flags. Qualification reviews include reviewer and source references. Passwords and session credentials are excluded.

The current JSON store uses atomic file replacement and in-process serialized transactions. It is a local/demo persistence mechanism, not tamper-proof storage, a multi-process concurrency solution, or an enterprise audit ledger. Restrict filesystem access and protect backups. A production deployment needs a supported transactional database, durable audit retention, backup/restore procedures, and operational access controls; none are claimed here.

## Offline drafts and privacy

An assessor must be authorized online before opening an assigned assessment. Local IndexedDB drafts are scoped by assessor and assessment IDs, omit candidate personal details and evidence files, and are not encrypted by this application. Sign in again online before accessing drafts after a browser restart. Sync rechecks assignment, status, content/rubric/mapping versions and server revision, and uses an idempotency receipt. It only saves provisional work; it never submits, signs, approves, or returns. A conflict preserves the local draft for manual comparison rather than merging or overwriting. Shared-device users should use a private browser profile and remove local copies when appropriate; deletion of the local draft also deletes its unsynchronized work.

API responses are not service-worker cached. Authentication refresh, assignment, evidence upload, submission, review, and report access require the API.

## Verification

Run `npm test`, `npm run build`, and `npm run i18n` from the repository root. The workflow integration test creates an isolated temporary JSON store under `work/test-data` and removes it on completion; it does not seed or replace the development store or Phase 3 experiment dataset.
