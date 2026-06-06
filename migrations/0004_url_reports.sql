CREATE TABLE IF NOT EXISTS reported_urls (
  id TEXT PRIMARY KEY,
  original_url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  final_url TEXT,
  domain TEXT NOT NULL,
  url_hash TEXT NOT NULL UNIQUE,
  report_type TEXT NOT NULL,
  report_count INTEGER NOT NULL DEFAULT 0,
  unique_reporters INTEGER NOT NULL DEFAULT 0,
  confidence_score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS report_events (
  id TEXT PRIMARY KEY,
  reported_url_id TEXT NOT NULL,
  report_type TEXT NOT NULL,
  description TEXT NOT NULL,
  reporter_ip_hash TEXT NOT NULL,
  reporter_user_id TEXT,
  evidence_image_url TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (reported_url_id) REFERENCES reported_urls(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reported_urls_url_hash ON reported_urls (url_hash);
CREATE INDEX IF NOT EXISTS idx_reported_urls_normalized_url ON reported_urls (normalized_url);
CREATE INDEX IF NOT EXISTS idx_reported_urls_final_url ON reported_urls (final_url);
CREATE INDEX IF NOT EXISTS idx_reported_urls_domain ON reported_urls (domain);
CREATE INDEX IF NOT EXISTS idx_reported_urls_status ON reported_urls (status);
CREATE INDEX IF NOT EXISTS idx_report_events_reported_url_id ON report_events (reported_url_id);
CREATE INDEX IF NOT EXISTS idx_report_events_reporter_ip_hash ON report_events (reporter_ip_hash);
CREATE INDEX IF NOT EXISTS idx_report_events_created_at ON report_events (created_at);
