# SkillSetu team integration contract

Version: **1.0** · Last updated: 2026-10-10

This document is the handoff contract for the two-person team. Domain content is authored and reviewed as data bundles. UI, API, scoring code and official standards are separate concerns. A content contributor should not need to edit React or Express source to add a trade dataset.

## Architecture and ownership

| Area | Path | Suggested owner | Contract |
|---|---|---|---|
| Skill Holder/assessor UI | `apps/web/src/` | Product/UI owner | Uses `/api/*`; never embeds official QP/NOS or rubric records in components. |
| HTTP API and workflow rules | `apps/api/src/` | API/workflow owner | Validates requests; reads active content bundle; owns state transitions and score calculations. |
| Shared request schemas | `packages/shared/src/` | Joint | Zod contracts shared by browser/API. Change with an explicit version/migration note. |
| Domain content and templates | `database/seeds/`, `database/seeds/templates/` | Domain-data contributor | Versioned JSON bundle is canonical at runtime; CSV templates are an authoring/import format. |
| Content schema | `database/schemas/` | Joint, changes require review | Stable versioned JSON Schema for bundle consumers. |
| Import/validation tool | `scripts/import-content.mjs` | Joint | Dependency-free validator; atomic apply to `database/imported/`. |
| Database persistence | `apps/api/prisma/` | API owner | Schema/migrations; API currently runs in-memory and does not yet persist to PostgreSQL. |

The domain-data contributor can work independently in `database/seeds/` and `database/seeds/templates/`, provided the bundle/schema/API contracts below remain stable. The UI owner can work in `apps/web/` against the documented API. The API owner coordinates shared type, endpoint, Prisma, or contract changes with the other contributor before merging.

## Content provenance and safety

Every bundle has a `contentSet` object containing an immutable `id`, `version`, `trade`, `classification`, `source`, and `effectiveDate`. Optional `occupationId` is a stable key shared by all versions for that occupation; when omitted, the API derives a lowercase hyphenated key from `trade`. `classification` is exactly `SYNTHETIC_DEMO` or `VERIFIED_AUTHORIZED`. Synthetic records and examples must be labeled as synthetic. Verified content must have a meaningful `approvalReference` documenting the authorization/source review; do not imply authorization merely because a file was imported. Never invent QP/NOS identifiers, NSQF levels, official thresholds, government endpoints, credits, or credential status. A SHA/hash or importer success is not a content authenticity or authorization claim.

Rubric anchors use an illustrative 0–4 format only. Do not encode a pass threshold as official. Each assessment/report must preserve its content set and rubric version. The assessor’s decision is separate from automated calculations, and no bundle or import can award official certification.

## Canonical version 1 JSON bundle

The machine-readable JSON Schema is [content-bundle-v1.schema.json](../database/schemas/content-bundle-v1.schema.json). A working complete example is [domestic-electrician-demo.json](../database/seeds/domestic-electrician-demo.json). Arrays are required even when empty. IDs are stable strings, unique within each collection, and references are exact IDs. Do not recycle IDs when content changes; increment the content set version and use a new content-set ID for immutable imports.

| Collection | Required fields and relationships |
|---|---|
| `contentSet` | `id`, `name`, `version`, `trade`, `classification`, `source`, `effectiveDate`; `approvalReference` is required when verified. |
| `qualificationPacks` (QPs) | `id`, `title`, `trade`, `description`; optional `nsqfLevel` is integer 1–10 only when verified, otherwise null. |
| `standards` (NOS) | `id`, `qpId` → QP, `title`, `description`. Never use synthetic strings that could be mistaken for official codes; prefix demo IDs with `DEMO-`. |
| `performanceCriteria` | `id`, `nosId` → NOS, `description`, boolean `safetyCritical`, `anchors` (non-empty list with integer scores 0–4 and descriptions). |
| `taskMappings` | `id`, `taskId` (stable worker-language key), `taskLabel`, `nosId` → NOS, `criterionIds` → criteria. A task may map to more than one record where justified. |
| `vivaQuestions` | `id`, `nosId`, optional `taskId`, fair `question`, `expectedFocus`, `followUps` array. Avoid trick questions or punitive fraud assumptions. |
| `candidates` (synthetic examples only) | `id`, `name`, `language`, `yearsExperience` 0–70, `taskIds` → task mappings, `synthetic: true`. Never add real personal data to seed bundles. |
| `assessmentExamples` | `id`, `candidateId`, workflow `status`, `scores` entries referencing criteria with integer score 0–4 and observation, explicit `humanSignoff` state, `synthetic: true`. |
| `calibrationCases` | `id`, `title`, `criterionId`, `expectedScore` 0–4, `synthetic: true` for demo cases. |
| `calibrationScores` | `id`, `caseId`, `assessorId`, integer `score` 0–4. Synthetic examples must remain visibly synthetic. |
| `bridgeRecommendations` | `id`, `criterionId`, `title`, `rationale`, `resourceType`, optional `resourceReference`; describe targeted practice, not unsupported official training. |

The corresponding CSV headers and JSON-in-cell columns are provided in `database/seeds/templates/`. Complex fields use JSON arrays in CSV cells (`anchorsJson`, `criterionIdsJson`, `followUpsJson`, `taskIdsJson`, `scoresJson`). CSV booleans are the lowercase literal `true` or `false`; numeric columns are base-10 numbers. Keep UTF-8 encoding and include the header row. `content-set.json` supplies folder-level provenance for a CSV directory.

## Import, validation, and loading

From the repository root:

```powershell
# Validate the complete JSON bundle without writing anything
node scripts/import-content.mjs database/seeds/domestic-electrician-demo.json

# Validate all template CSVs as one joined dataset
node scripts/import-content.mjs database/seeds/templates

# Validate and import an immutable, versioned bundle file
node scripts/import-content.mjs path/to/my-content-bundle.json --apply
```

The importer checks schema version, required fields, per-collection duplicate IDs, classification/authorization metadata, score ranges, allowed workflow states, QP→NOS→criterion relationships, task mappings, candidate declarations, assessment scores, calibration references, and bridge recommendation references. It prints validation errors with collection and record IDs. Imports are atomic: if any validation error exists, zero records are written. `--apply` refuses to overwrite an existing content-set ID and writes to `database/imported/<content-set-id>.json`. A successful import means schema/relationship validation passed; it does not certify the data as official.

The default active bundle is `database/seeds/domestic-electrician-demo.json`. At startup the API also discovers JSON files in `database/imported/`; `SKILLSETU_CONTENT_FILES` can add explicit comma- or semicolon-separated bundle paths. Every loaded bundle is keyed by its immutable content-set ID. `/api/catalogue` returns the active occupation bundle by default and accepts `?occupationId=<stable-id>` or `?contentSetId=<bundle-id>` for a particular occupation/version. The API exposes the available occupation summaries in that response. Validate and import data before loading it. Runtime profiles, users, declarations, assessments, and reports persist in the configured local JSON store, not PostgreSQL. Do not point runtime at an unvalidated file. This file-loader seam can be replaced with versioned DB records without changing the response contract.

## Stable API contracts

Base path is `/api`; JSON is UTF-8. The Vite dev server proxies `/api` to `http://localhost:4000`.

| Endpoint | Contract |
|---|---|
| `GET /health` | `{ ok, mode, contentSet, contentFile, database }`. `database` explicitly identifies demo/in-memory mode. |
| `GET /dashboard` | `{ stats, candidates, events, synthetic }`; stats/events are demo summary values until persisted workflows exist. |
| `GET /candidates` | `{ items, synthetic }`. |
| `POST /candidates` | Request `{ name, phone?, language, yearsExperience, tasks: string[] (taskId values), consent }`; returns candidate projection with human-readable `tasks` plus stable `taskIds`, or HTTP 400 with field errors. Consent must be true for registration. |
| `GET /catalogue?occupationId=` | `{ contentSet, occupationId, occupations, qualificationPacks, standards, performanceCriteria, tasks, candidates, vivaQuestions, assessmentExamples, calibrationCases, calibrationScores, bridgeRecommendations, synthetic }`. `contentSetId` may select a particular retained version. A `tasks` item is `{ id, label, nosId, criterionIds }`; example candidate, assessment and calibration records are synthetic. |
| `POST /worker/profile` | Request includes `{ name, yearsExperience, language, occupationId }`; updates the authenticated Skill Holder's existing candidate record and stores it in the JSON persistence layer. |
| `POST /admin/users` | Admin-only staff provisioning accepts `authorizedOccupationIds`; assessor list/assignment/catalogue access is checked against those IDs server-side. |
| `POST /admin/occupations/:id/availability` | Admin/reviewer enables or disables an occupation backed by a loaded bundle. Active assessments prevent disabling that occupation. |
| `POST /mapping/preview` | Request `{ taskIds: string[] }`; returns `{ matches, contentVersion, classification, explanation }`. Percentages are deterministic task overlap only, not competence scores. |
| `GET /catalogue/viva?nosId=&taskId=` | `{ items, contentVersion }`; filters the active bundle’s fair question bank. |
| `POST /score/draft` | Request `{ scores: number[], safetyFailure: boolean }`; returns illustrative average, draft label, rule explanation and `requiresHumanSignoff: true`. This is demo logic, not an official pass rule. |

Keep these response shapes stable when changing the content source. If a contract must change, update `packages/shared`, this document, importer, API, and UI in the same pull request. Do not make the frontend assume an official identifier or content status not present in the response.

## Local setup and integration workflow

```powershell
cd work/skillsetu
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:5173`; API health is at `http://localhost:4000/api/health`. Node.js 20+ and npm 10+ are expected. PostgreSQL/Prisma files are present, but the current runtime is demo/in-memory; the importer does not require a database.

Suggested two-person workflow:

1. Agree on a content-set ID/version and mark the classification and source before authoring.
2. The domain-data teammate edits a bundle in `database/seeds/` or uses all CSV templates plus `content-set.json` in a separate dataset folder. They do not edit application source to add content.
3. Run the validator. Fix all errors and review source, permissions, identifiers, safety criteria, and rubric anchors with the domain owner.
4. In the shared Git repository, branch from the current `main`, commit only the dataset/templates and its version note, then open a PR targeting `main`. Include provenance, changed IDs, classification, sample validation output, and assessor review needed. Example commands (replace the branch suffix with the content version):
   ```powershell
   git switch main
   git pull --ff-only
   git switch -c data/domestic-electrician-v0-2
   git add database/seeds
   git commit -m "Add Domestic Electrician content v0.2"
   git push -u origin data/domestic-electrician-v0-2
   ```
5. The application teammate reviews bundle/API compatibility and reruns both validators. The domain owner confirms source, permissions, mappings, safety criteria and rubric language. Resolve review comments on the same branch and update the PR. Merge into `main` only after both content and application review; never merge synthetic content under an authorized label. Preserve old content-set IDs/files for report provenance.
6. After merge, load the new bundle with `--apply`, set `SKILLSETU_CONTENT_FILE` to that version, restart the API, and confirm `/api/catalogue` reports the intended version and classification.

### Example: add a viva set without changing the application

Copy `database/seeds/domestic-electrician-demo.json` to a new file, assign a new `contentSet.id` and increment `version`, then add question objects to `vivaQuestions`. Each question must reference an existing `standards[].id`; an optional `taskId` must be present in `taskMappings[].taskId`. Keep the demo classification if the content is synthetic. Run the validator, then import with `--apply`, point `SKILLSETU_CONTENT_FILE` at the imported bundle, restart the server, and inspect `GET /api/catalogue` or the assessment page. No React/Express file edit is needed.

The same flow applies to adding QPs/NOS/criteria/mappings or calibration cases/scores: add referenced parent records first, use unique IDs, validate the entire bundle, review provenance, then import. For a *new* content-set ID/version, preserve the old file so earlier reports can continue to identify their source version.

## Added workflow fields and endpoints

The runtime JSON store adds optional `Candidate.experienceSource` and `Candidate.experienceSummary`, optional `Assessment.preferredMethod` and `Assessment.previousAssessmentId`, score-draft `Assessment.revisions`, and top-level `calibrationRatings`. Existing records remain readable; defaults are additive, and profile requests from older clients do not clear the optional experience fields. No PostgreSQL migration was performed because the API still uses JSON persistence.

- `POST /api/worker/assessments` accepts optional `preferredMethod` (`IN_PERSON`, `VIDEO`, or `PORTFOLIO`) and links a prior assessment when creating a later attempt.
- `POST /api/assessments/:id/resume` allows only the originally assigned assessor to resume a returned assessment.
- `POST /api/assessments/:id/evidence` accepts base64 file bytes, filename, media type, and optional criterion ID. Allowed media are JPEG, PNG, WebP, PDF, MP4, and WebM; maximum decoded size is 8 MB. SHA-256 is computed over bytes. `GET /api/assessments/:id/evidence/:evidenceId` enforces assessment access.
- `GET /api/reports/:id/download` downloads a signed-off, application-generated HTML report; it is not an official certificate.
- `GET /api/calibration?occupationId=...` returns cases with reference scores withheld from assessors. `POST /api/calibration/cases/:caseId/score` stores an assessor's immutable first rating. Reviewer/admin responses include live pairwise weighted Cohen's kappa for shared cases.
- `PUT /api/worker/declaration` accepts optional `expectedUpdatedAt` for local-draft conflict detection. The declaration upsert remains idempotent by candidate; stale local drafts receive HTTP 409 and remain on the device.

Evidence files live beside the configured JSON store under `evidence/`. Back up and protect that directory with the JSON store. The service worker caches only the same-origin app shell/static assets and never caches `/api/*`. IndexedDB drafts are device-local and do not confer offline authorization.
