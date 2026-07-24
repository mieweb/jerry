-- Tool approvals: pending and granted tool calls requiring user approval
-- Used by the "ask" egress disposition flow.

CREATE TABLE IF NOT EXISTS tool_approvals (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  args_json TEXT,  -- JSON: tool arguments at time of request
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, granted, expired
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_tool_approvals_session ON tool_approvals(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_approvals_status ON tool_approvals(status);
CREATE INDEX IF NOT EXISTS idx_tool_approvals_tool ON tool_approvals(tool_name);
