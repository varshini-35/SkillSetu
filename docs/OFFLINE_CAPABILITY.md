# SkillSetu offline assessment capability

## Supported workflow

The assessor must first sign in and open an assessment that is already assigned to them. **Save offline copy on this device** stores that assessment's rubric/content snapshot, scores, viva responses and observation in IndexedDB, scoped to the signed-in assessor ID and assessment ID. The copy survives refreshes and browser restarts on the same browser profile. Local drafts do not include candidate names, phone numbers, evidence files or session credentials.

When the API is reachable again, select **Sync draft**. Synchronization updates the existing assessment's provisional work only. It never submits a report, signs, approves, or uploads evidence. An authorized assessor must still review the request, complete required rubric/viva items, upload evidence online when needed, and submit the report through the normal workflow.

The server checks that the same assessor still owns an in-progress assessment and that its assignment/status, content version, rubric version, mapping snapshot and last saved revision still match the offline draft. A changed server revision is returned as a conflict. The local copy is retained and marked **CONFLICT** so the assessor can inspect it; SkillSetu does not silently merge or overwrite either version. Network or persistence errors retain the local copy for retry. A sync ID and payload hash make a repeated request idempotent, including after an API restart.

## Offline boundaries and shared devices

- Offline use requires a previously loaded application and an assessment opened while authorized online. Sign-in, authorization refresh, assessment assignment, review/sign-off, report access, calibration, catalogue changes and evidence upload require the API.
- After an offline browser restart, the app does not restore a staff identity from cached credentials. Sign in again when the API is reachable before opening assessor drafts. This prevents a cached role from being treated as current authorization.
- IndexedDB is local to the browser profile and is not encrypted by this application. Use a private device profile on shared computers, sign out, and remove local copies when finished. Deleting a local copy does not delete the server assessment.
- Offline app shell caching is limited to the public shell and static assets. `/api/` responses, including authentication, candidates, reports and assessment data, are never service-worker cached.
- Worker declaration drafts continue to use the existing local draft store; their server submission remains online-only.

## Install and test locally

Run the usual API and Vite development commands (`npm run dev`). Service-worker/PWA installation is enabled in a production preview/build, not Vite development mode. Build with `npm run build`, serve the generated app over HTTPS or `localhost`, then use the browser's Install action or browser menu. Load the app and open an assigned assessment while online; save an offline copy, switch DevTools network to Offline, edit and save again, then reconnect and sync. Confirm that a forced server-side work update produces a retained conflict instead of silently overwriting the server.

The web app reports API reachability from the uncached `/api/health` endpoint; `navigator.onLine` alone is not considered proof that the API is available.
