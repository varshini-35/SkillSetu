# SkillSetu — SIH26242 demo

An RPL workflow prototype for multiple occupations, beginning with Domestic Electrician. Skill Holders declare experience, assessors record structured observations, and authorized reviewers sign off provisional outcomes. The bundled QP/NOS-like catalogue and example records are synthetic. This software does not award official certification, issue official credits, or connect to government systems.

## Requirements and local run

- Node.js 20+ and npm 10+
- PostgreSQL is not required for this local demo; it is not currently connected to the API.

```powershell
cd work/skillsetu
npm install
Copy-Item .env.example .env
npm run dev
```

Open http://localhost:5173. The API runs at http://localhost:4000. The API persists demo records in `data/skillsetu-demo-store.json` (excluded from source control); set `SKILLSETU_STORE_FILE` to choose another file. This is local file persistence, not PostgreSQL or a production database. Back up or delete this file to preserve or reset demo records.

## Skill Holder and staff access

- **Skill Holder:** enter a mobile number, request a code, and use the code displayed by the local UI. The code is generated for that request, expires after five minutes, and is labelled **SIMULATED DEMO OTP**. No SMS is sent and this flow does not verify real phone ownership. Returning Skill Holders use the same phone and receive access to the linked candidate record. A username and password can be linked later.
- **Local demo identifiers:** `0000000000` is the existing Skill Holder account; `0000000001` is a separate fresh-profile account. A new simulated OTP is generated on each request. Assessor credentials are `assessor1` / `Assess@123`; admin credentials are `admin` / `Admin@123`. These identities exist only when `DEMO_MODE=true` outside production. No credentials are displayed on the login page. Never use demo credentials outside a local demo.
- **Assessor / reviewer / admin:** there is no public staff registration. Local demo mode seeds the credentials above. Outside demo mode, provision the initial admin through `.env`:

  ```dotenv
  DEMO_MODE=true
  BOOTSTRAP_ADMIN_USERNAME=admin
  BOOTSTRAP_ADMIN_PASSWORD=replace-with-a-long-local-demo-password
  BOOTSTRAP_ADMIN_NAME=Workspace administrator
  ```

  Restart the API after setting these values, then sign in using those credentials. The admin dashboard can provision assessor and reviewer accounts with passwords of at least 10 characters. Remove bootstrap secrets from `.env` after the initial account is created. Do not reuse demo credentials.

Role sessions use HTTP-only same-site cookies. Staff passwords are scrypt-hashed. Auth attempts are rate-limited in process memory. Do not expose this demo API to the public internet.

The login UI and key dashboard controls support English, Kannada, and Hindi. Catalogue labels and much assessor-entered content may remain English; the UI identifies this fallback. A built-in voice help panel uses browser speech recognition and speech synthesis when available, with text input as a fallback. It answers from the current role's loaded records and cannot change scores or sign off assessments.

## Shared workflow

1. Skill Holder verifies a simulated phone code, selects an available occupation, and saves a profile and consented experience declaration.
2. The Skill Holder requests an assessment. The declaration and request become available in the authorized assessor queue.
3. The assigned assessor records rubric scores, observations, viva notes, and evidence metadata, then submits the provisional result.
4. A reviewer or admin reviews the result and may approve it or return it. The original assessor cannot sign off their own assessment.
5. After approval, the Skill Holder sees the reviewed status and report record. A draft score is never displayed as an approved result.

The screens refresh from the API periodically, including when changes are made in another browser session. For role-isolated testing, use separate browser profiles; tabs in one profile share the same login cookie.

### Occupations and content bundles

Domestic Electrician is the only occupation currently bundled and enabled. The API discovers validated bundles imported to `database/imported/` in addition to the configured default bundle. Additional files can be explicitly loaded with `SKILLSETU_CONTENT_FILES` (comma- or semicolon-separated paths). Each bundle's `contentSet.occupationId` is its stable occupation key. Worker profiles and assessments retain this key and the selected content-set ID/version. Assessors are limited to the occupation IDs provisioned on their account; the demo assessor is authorized for Domestic Electrician. Admin/reviewer dashboards can inspect loaded QP/NOS/rubric/viva counts and enable or disable available bundles. Importing and revising content remains a validated, versioned data workflow; do not invent official records.

## Storage and deployment limitations

`DATABASE_URL` and the Prisma schema are not used by this API yet. The API currently writes a local JSON file and keeps sessions, OTPs, and rate-limit counters in process memory. That is suitable only for a single-process local demo: sessions end on restart, concurrent instances are unsafe, and the JSON file lacks database transactions and operational backup controls. Before deployment, connect PostgreSQL, migrate authentication/session storage, configure a real SMS provider, HTTPS, secrets management, monitoring, retention, and authorized content. Do not represent the simulated OTP as phone verification.

Run `npm run build` for API type checking, frontend type checking, and the Vite production build. API health reports the active file store and explicitly states that PostgreSQL is not connected.

## Domain data

See [`docs/TEAM_INTEGRATION.md`](docs/TEAM_INTEGRATION.md) for the versioned bundle schemas, templates, ownership boundaries, and import workflow. Validate bundled data from the repository root:

```powershell
node scripts/import-content.mjs database/seeds/domestic-electrician-demo.json
node scripts/import-content.mjs database/seeds/templates
```

Mappings are deterministic and suggestions require assessor review. Only synthetic demo content is bundled; load verified official data only when its source and usage permissions have been confirmed.

## Safety and trust

- Assessment results remain provisional until authorized human review and sign-off.
- Synthetic catalogue content and thresholds are not official QP/NOS data or approved pass standards.
- Evidence hashes identify byte changes after hashing; they do not establish authenticity or custody.
- Do not use the prototype to instruct unqualified people to work on live electrical systems.

## Assessment workflow improvements (local phase)

- Profiles can record an optional experience pathway and summary; omitted fields from older clients do not erase saved values.
- Assessment requests save a preferred method (`IN_PERSON`, `VIDEO`, or `PORTFOLIO`). Assessors see this preference and decide whether the evidence is sufficient.
- Assessor submission requires every content-version criterion to have a 0–4 score or an explicit not-assessed reason. Returned work can be resumed by its assigned assessor; each saved correction preserves the earlier score/viva draft in the same assessment record. New attempts link to the previous assessment.
- Image, PDF, MP4, and WebM evidence uploads are limited to 8 MB, checked against media signatures, stored under `data/evidence/`, and recorded with SHA-256 over the uploaded bytes. Downloads require an authorized role and assessment access. Local uploads are not backed up automatically; apply retention and backup policy before production use.
- A signed-off report can be downloaded as an application-generated HTML file. It identifies itself as non-official and includes the assessment version, rubric results, sign-off, and evidence references.
- Assessors can submit one initial calibration score per synthetic/loaded reference case. The admin view reports pairwise quadratically weighted Cohen’s kappa only for common cases (minimum two paired cases); it reports agreement, not accuracy. Reference expectations are hidden from assessors during scoring.
- Phase 3 adds a separate assessor scoring-consistency experiment with locked manual and SkillSetu-assisted attempts. Its three-case synthetic dataset and versioned storage are isolated from the normal assessment JSON store. See [`docs/PHASE3_EXPERIMENT.md`](docs/PHASE3_EXPERIMENT.md) for local use, versioning, and metric limitations.
- A service worker caches the app shell in production. Skill Holders may explicitly save a declaration draft in IndexedDB and send it after reconnecting. Server version conflicts are returned without deleting the local draft. This is a limited draft-recovery phase: authenticated assessment work, approved content caching, offline assessor actions, queued media uploads, and complete reload-while-offline workflows are not implemented.
- The startup splash is a simple wordmark/tagline fade with reduced-motion handling. No approved standalone logo artwork was present in the repository, so it does not invent or animate a replacement logo mark.

Set `SKILLSETU_ALLOWED_ORIGINS` to a comma-separated list of exact HTTPS origins for a hosted frontend. The API retains the two localhost development origins by default and rejects other origins. Do not set a wildcard. Sessions, OTPs, and rate-limit counters remain process-memory state; the JSON file and local evidence directory are intended for a single-process local demo only.

Run these checks from the repository root:

```powershell
npm test
npm run i18n:check
npm run content:validate:demo
npm run content:validate:templates
npm run build
```

The translation check verifies keyed dictionary parity only; it does not detect English literals left in dashboard components. Most dashboard copy and imported technical content still need reviewed Kannada/Hindi translations.
