CREATE TABLE platform_connections (
  traffic_source_id TEXT PRIMARY KEY REFERENCES traffic_sources(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('adcash','propellerads','richads','trafficstars')),
  credential_sealed TEXT,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  allow_writes INTEGER NOT NULL DEFAULT 0 CHECK (allow_writes IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE platform_operations (
  traffic_source_id TEXT NOT NULL REFERENCES traffic_sources(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  action TEXT NOT NULL,
  request_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  result_json TEXT,
  PRIMARY KEY (traffic_source_id, operation_id)
);
CREATE INDEX idx_platform_operations_source ON platform_operations(traffic_source_id, created_at DESC);
