CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  sprint_days INTEGER NOT NULL,
  start_ts INTEGER,            -- set when the guest accepts
  end_ts INTEGER,
  ext_days INTEGER,            -- pending extension proposal
  ext_by TEXT,                 -- member id who proposed
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  tz TEXT NOT NULL,
  role TEXT NOT NULL,          -- host | guest
  book_path TEXT,
  book_doc TEXT,
  baseline_bp INTEGER,
  target_bp INTEGER,
  bp INTEGER NOT NULL DEFAULT 0,
  finished_ts INTEGER,
  nudged_ts INTEGER,           -- partner nudged me, not yet seen
  fav_quote INTEGER,
  last_updated INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS members_room ON members(room_id);
CREATE TABLE IF NOT EXISTS daily (
  member_id TEXT NOT NULL,
  day TEXT NOT NULL,
  max_bp INTEGER NOT NULL,
  seconds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (member_id, day)
);
CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT NOT NULL,
  text TEXT NOT NULL,
  page TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS seen_events (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS devices (
  token TEXT PRIMARY KEY,      -- written into the plugin's config.json, never changes
  member_id TEXT,              -- current room membership (NULL = not in a room)
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS highlights (
  member_id TEXT NOT NULL,
  clip_id TEXT NOT NULL,
  doc TEXT NOT NULL,
  text TEXT NOT NULL,
  chapter TEXT,
  created_at INTEGER NOT NULL,
  share_ts INTEGER NOT NULL,   -- auto: upload time; raised when picked in the menu
  deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (member_id, clip_id)
);
CREATE INDEX IF NOT EXISTS highlights_member ON highlights(member_id, share_ts);
