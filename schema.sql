-- Cloudflare D1 数据库架构

-- 管理员凭证表
CREATE TABLE IF NOT EXISTS admin_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 插入默认管理员密码 (admin123 的 SHA-256 hash)
INSERT OR IGNORE INTO admin_credentials (id, password_hash)
VALUES (1, 'JAvlGPq9JyTdtvBO6x2llnRI1+gxwIyPqCKAn3THIKk=');

-- 监控配置表
CREATE TABLE IF NOT EXISTS monitors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  check_interval INTEGER NOT NULL DEFAULT 5,
  check_type TEXT NOT NULL DEFAULT 'http',
  check_method TEXT NOT NULL DEFAULT 'GET',
  check_timeout INTEGER NOT NULL DEFAULT 30,
  expected_status_codes TEXT DEFAULT '200,201,204,301,302',
  expected_keyword TEXT,
  forbidden_keyword TEXT,
  komari_offline_threshold INTEGER DEFAULT 3,
  webhook_url TEXT,
  webhook_content_type TEXT DEFAULT 'application/json',
  webhook_headers TEXT,
  webhook_body TEXT,
  webhook_username TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 监控检查记录表
CREATE TABLE IF NOT EXISTS monitor_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('up', 'down')),
  response_time INTEGER NOT NULL,
  status_code INTEGER,
  error_message TEXT,
  checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE
);

-- 故障事件表
CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  duration_seconds INTEGER,
  notified INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE
);

-- 创建索引以提升查询性能
CREATE INDEX IF NOT EXISTS idx_monitor_checks_monitor_id ON monitor_checks(monitor_id);
CREATE INDEX IF NOT EXISTS idx_monitor_checks_checked_at ON monitor_checks(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_monitor_id ON incidents(monitor_id);
CREATE INDEX IF NOT EXISTS idx_incidents_unresolved ON incidents(monitor_id, resolved_at) WHERE resolved_at IS NULL;

-- 迁移脚本：为现有表添加 komari_offline_threshold 字段
-- 如果字段不存在，执行以下 SQL（在 D1 控制台中手动执行）
-- ALTER TABLE monitors ADD COLUMN komari_offline_threshold INTEGER DEFAULT 3;

