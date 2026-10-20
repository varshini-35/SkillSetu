CREATE TABLE IF NOT EXISTS skillsetu_schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS skillsetu_store_snapshots (
  id BIGSERIAL PRIMARY KEY,
  state JSONB NOT NULL,
  previous_id BIGINT NULL REFERENCES skillsetu_store_snapshots(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS skillsetu_store_head (
  singleton_key TEXT PRIMARY KEY CHECK (singleton_key = 'main'),
  revision BIGINT NOT NULL CHECK (revision > 0),
  snapshot_id BIGINT NOT NULL UNIQUE REFERENCES skillsetu_store_snapshots(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS skillsetu_import_history (
  source_sha256 CHAR(64) PRIMARY KEY,
  snapshot_id BIGINT NOT NULL REFERENCES skillsetu_store_snapshots(id) ON DELETE RESTRICT,
  record_counts JSONB NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
