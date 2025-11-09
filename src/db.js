// // src/db.js
// const Database = require('better-sqlite3');
// const fs = require('fs');
// const path = require('path');

// const DATA_DIR = path.resolve(__dirname, '..', 'data');
// if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// const DB_PATH = path.join(DATA_DIR, 'queue.db');

// const db = new Database(DB_PATH);

// // Migrations - create tables if missing
// db.exec(`
//   PRAGMA journal_mode=WAL;

//   CREATE TABLE IF NOT EXISTS jobs (
//     id TEXT PRIMARY KEY,
//     command TEXT NOT NULL,
//     state TEXT NOT NULL DEFAULT 'pending',
//     attempts INTEGER NOT NULL DEFAULT 0,
//     max_retries INTEGER NOT NULL DEFAULT 3,
//     created_at TEXT NOT NULL,
//     updated_at TEXT NOT NULL,
//     locked_by TEXT,
//     locked_at TEXT,
//     next_run_at TEXT,
//     priority INTEGER DEFAULT 0
//   );

//   CREATE TABLE IF NOT EXISTS config (
//     key TEXT PRIMARY KEY,
//     value TEXT
//   );

//   CREATE TABLE IF NOT EXISTS meta (
//     k TEXT PRIMARY KEY,
//     v TEXT
//   );
// `);

// // default config
// const setIfMissing = db.prepare(`INSERT OR IGNORE INTO config (key, value) VALUES (?, ?);`);
// setIfMissing.run('backoff_base', '2');
// setIfMissing.run('default_max_retries', '3');

// module.exports = {
//   db,
//   DB_PATH
// };


// src/db.js
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'queue.db');

const db = new Database(DB_PATH);

// Ensure WAL for concurrency
db.pragma('journal_mode = WAL');

// Base migrations - create tables if missing
db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    command TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    locked_by TEXT,
    locked_at TEXT,
    next_run_at TEXT
    -- additional columns (started_at, finished_at, duration_ms, priority) may be added below via ALTER
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS meta (
    k TEXT PRIMARY KEY,
    v TEXT
  );
`);

// Set default config values if missing
const setIfMissing = db.prepare(`INSERT OR IGNORE INTO config (key, value) VALUES (?, ?);`);
setIfMissing.run('backoff_base', '2');
setIfMissing.run('default_max_retries', '3');

// Migration: ensure columns started_at, finished_at, duration_ms, priority exist
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  const found = cols.some(c => c.name === column);
  if (!found) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl};`);
  }
}

ensureColumn('jobs', 'started_at', 'started_at TEXT');
ensureColumn('jobs', 'finished_at', 'finished_at TEXT');
ensureColumn('jobs', 'duration_ms', 'duration_ms INTEGER DEFAULT NULL');
ensureColumn('jobs', 'priority', 'priority INTEGER DEFAULT 0');

module.exports = {
  db,
  DB_PATH
};
