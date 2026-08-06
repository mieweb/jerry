-- Jerry event model schema
-- This migration creates the tables for sessions, events, messages,
-- activity events, and summaries.

-- Sessions: one per agent conversation
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  conversation_id TEXT,
  continuation TEXT,  -- JSON: ContinuationState for suspend/resume
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Events: lifecycle log for the session
-- Types: user_message, agent_message, external, scheduled_wake,
--        waiting_for_user, waiting_for_approval, resumed, error
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT,  -- JSON
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Messages: conversation history for local/byo-cloud runtime
-- (On ozwell runtime, Ozwell owns the conversation)
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,  -- user, assistant, system, tool
  content TEXT,  -- JSON: message content
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Activity events: raw events from collector (AW, folder, screenshots)
CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,  -- aw, folder, screenshot
  payload TEXT,  -- JSON: raw event data
  occurred_at TEXT NOT NULL,
  ingested_at TEXT NOT NULL
);

-- Summaries: AW rollup output and computed summaries
CREATE TABLE IF NOT EXISTS summaries (
  id TEXT PRIMARY KEY,
  session_id TEXT,  -- nullable: some summaries are background rollups
  range_start TEXT NOT NULL,
  range_end TEXT NOT NULL,
  summary TEXT,  -- JSON: AwActivitySummary or similar
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_occurred ON activity_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_activity_source ON activity_events(source);
CREATE INDEX IF NOT EXISTS idx_summaries_session ON summaries(session_id);
CREATE INDEX IF NOT EXISTS idx_summaries_range ON summaries(range_start, range_end);
