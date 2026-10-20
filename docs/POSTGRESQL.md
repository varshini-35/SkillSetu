# PostgreSQL persistence and safe import

## What the API stores

The API previously had Prisma schema and migration artifacts, but the running server used `JsonStore`; it did not use PostgreSQL. The API now selects persistence explicitly. The local `dev-server.ts` entry point opts into JSON for convenience; setting `SKILLSETU_STORAGE=postgres` in `.env` overrides that choice:

- `SKILLSETU_STORAGE=json` selects the existing JSON store for local development and isolated tests.
- `SKILLSETU_STORAGE=postgres` selects Neon/PostgreSQL. `NODE_ENV=production` defaults to PostgreSQL and never falls back to JSON.
- A missing URL, unavailable database, or unapplied schema prevents API startup. No credentials are printed in errors or startup logs.

The PostgreSQL adapter stores the complete existing `StoreData` object as JSONB in append-only snapshots. This retains the existing IDs, nested report snapshots, signatures, history, notifications, mapping reviews, role fields, and offline sync receipts without guessing fields currently typed as `any`. A single revision head points at the current snapshot. Each persisted change inserts a new snapshot and atomically advances the head; API reads refresh the head, and stale API instances receive a conflict instead of overwriting newer state. Previous snapshots are retained.

This is a compatibility persistence layer, not a normalized relational redesign. Cross-record IDs remain in the JSON data; the explicit JSON importer validates known references before writing. API authorization and workflow rules remain in the existing routes.

## Schema migration

`database/migrations/001_postgres_state_store.sql` only creates the migration ledger, snapshot, head, and import-history tables. It contains no drop, truncate, or data-copy statements. The migration runner is idempotent and uses a PostgreSQL advisory lock.

Set `DATABASE_URL` in a local ignored `.env` file or the process environment. Do not paste the connection string into chat or commit `.env`. Neon connections are set to TLS (`sslmode=require`) for remote hosts.

```powershell
npm run db:migrate
```

The API does not run schema migrations during startup. Apply this schema before selecting PostgreSQL storage.

## Local PostgreSQL verification

In `.env`, set `SKILLSETU_STORAGE=postgres` and add the private `DATABASE_URL`. Then run:

```powershell
npm run db:migrate
npm run dev:api
```

The API health response should report PostgreSQL versioned JSONB snapshots and a connected database. To return to the local JSON store, set `SKILLSETU_STORAGE=json`; the `npm run dev` entry point explicitly selects JSON unless `.env` already selects a backend.

## Optional JSON import — never automatic

Import is a separate command. It prints only the chosen path, SHA-256 of the source file, and collection counts. A dry run does not connect to or write to PostgreSQL:

```powershell
npm run db:import-json -- --source data/skillsetu-demo-store.json
```

Only after deciding that this exact file is trusted, apply it with:

```powershell
npm run db:import-json -- --source data/skillsetu-demo-store.json --apply
```

The apply command refuses to import over a non-empty store. Re-running the same file is a no-op recorded by its SHA-256. It imports JSON metadata only. It does not copy evidence bytes, discover reports, or recover missing files. Choose the source file explicitly; no source is selected on startup.

## Production rollout blockers and limits

- The migration and initial JSON import to the team's Neon project are complete. The imported dataset came from an explicitly selected local safe-copy; this does not establish that the source is a recoverable production backup.
- This is a single-state JSONB compatibility store, not normalized per-entity tables or database-enforced foreign keys. The importer checks known IDs and links; application authorization remains in the API. Snapshots are intentionally retained, so define an archival/retention policy before substantial production volume.
- The migration is additive and does not convert older Prisma tables. Inspect for those tables before applying any future schema migration that targets them.
- Evidence bytes stay outside PostgreSQL in `SKILLSETU_EVIDENCE_DIR`. Render Free filesystems are ephemeral, so production evidence needs durable object storage or another approved durable filesystem before uploads can be promised across restarts.
- Phase 3 assessor experiments still use their separate JSON store and are not covered by this migration.
- The existing older Prisma schema/migration describes a different model and is not used by this adapter. `npm run db:migrate` invokes the additive SQL migration in `database/migrations`; do not run `prisma migrate dev` against Neon for this adapter.
- Importing a local JSON file is a deliberate data-recovery decision. Local files are not presumed to be production backups.
