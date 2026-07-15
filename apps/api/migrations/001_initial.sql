CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('source', 'preview', 'artifact', 'result', 'export')),
  original_name TEXT,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  relative_path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_files_sha256 ON files(sha256);

CREATE TABLE IF NOT EXISTS motion_artifacts (
  id TEXT PRIMARY KEY,
  source_file_id TEXT NOT NULL REFERENCES files(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('template', 'user')),
  schema_version TEXT NOT NULL,
  artifact_file_id TEXT NOT NULL REFERENCES files(id),
  artifact_sha256 TEXT NOT NULL,
  shooting_hand TEXT NOT NULL CHECK (shooting_hand IN ('left', 'right')),
  view_type TEXT NOT NULL,
  status TEXT NOT NULL,
  model_version TEXT NOT NULL,
  pipeline_version TEXT NOT NULL,
  threshold_snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_file_id TEXT NOT NULL REFERENCES files(id),
  current_artifact_id TEXT REFERENCES motion_artifacts(id),
  shooting_hand TEXT NOT NULL CHECK (shooting_hand IN ('left', 'right')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'ready', 'rejected', 'failed')),
  rejection_code TEXT,
  error_json TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS comparisons (
  id TEXT PRIMARY KEY,
  user_source_file_id TEXT NOT NULL REFERENCES files(id),
  user_artifact_id TEXT REFERENCES motion_artifacts(id),
  template_id TEXT NOT NULL REFERENCES templates(id),
  template_artifact_id TEXT REFERENCES motion_artifacts(id),
  result_id TEXT,
  shooting_hand TEXT NOT NULL CHECK (shooting_hand IN ('left', 'right')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'ready', 'rejected', 'failed')),
  rejection_code TEXT,
  error_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS comparison_results (
  id TEXT PRIMARY KEY,
  comparison_id TEXT NOT NULL REFERENCES comparisons(id),
  schema_version TEXT NOT NULL,
  result_file_id TEXT NOT NULL REFERENCES files(id),
  result_sha256 TEXT NOT NULL,
  template_preview_file_id TEXT NOT NULL REFERENCES files(id),
  user_preview_file_id TEXT NOT NULL REFERENCES files(id),
  algorithm_version TEXT NOT NULL,
  threshold_snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('template', 'comparison')),
  entity_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'ready', 'rejected', 'failed')),
  stage TEXT,
  completed_stages_json TEXT NOT NULL DEFAULT '[]',
  attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  error_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, created_at);

CREATE TABLE IF NOT EXISTS job_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  stage TEXT,
  attempt INTEGER NOT NULL,
  error_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id, id);

