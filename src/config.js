// src/config.js
const { db } = require('./db');

function getConfig(key) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setConfig(key, value) {
  db.prepare('INSERT INTO config(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value));
}

function allConfig() {
  return db.prepare('SELECT key, value FROM config').all();
}

module.exports = { getConfig, setConfig, allConfig };
