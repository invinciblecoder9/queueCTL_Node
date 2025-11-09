// src/jobs.js
const { db } = require('./db');

// Normalize ISO timestamps (remove milliseconds so SQLite compares correctly)
// function cleanISO(dt = new Date()) {
//   return new Date(dt.getTime() - (dt.getMilliseconds())).toISOString().replace(/\.\d+Z$/, "Z");
// }

function cleanISO(dt = new Date()) {
  const ms = dt.getTime();
  const truncated = Math.floor(ms / 1000) * 1000;   // remove milliseconds safely
  return new Date(truncated).toISOString();
}

function nowISO() {
  return cleanISO(new Date());
}

// -------------------- ENQUEUE --------------------
function enqueue(job) {
  const ts = nowISO();
  // next_run_at: if provided use that, otherwise make job immediately runnable
  const nextRun = job.next_run_at
  ? cleanISO(new Date(job.next_run_at))
  : cleanISO(new Date(Date.now() - 1)); // FIXED: immediate eligibility
 // force job to be immediately eligible

  const stmt = db.prepare(`
    INSERT INTO jobs (
      id, command, state, attempts, max_retries,
      created_at, updated_at, next_run_at, priority,
      locked_by, locked_at,
      started_at, finished_at, duration_ms,
      timeout_seconds
    ) VALUES (
      @id, @command, 'pending', @attempts, @max_retries,
      @created_at, @updated_at, @next_run_at, @priority,
      NULL, NULL,
      NULL, NULL, NULL,
      @timeout_seconds
    )
  `);

  stmt.run({
    id: job.id,
    command: job.command,
    attempts: job.attempts ?? 0,
    max_retries: job.max_retries ?? 3,
    created_at: job.created_at ?? ts,
    updated_at: job.updated_at ?? ts,
    next_run_at: nextRun,
    priority: job.priority ?? 0,
    timeout_seconds: job.timeout_seconds ?? null
  });

  return job.id;
}

// -------------------- QUERIES --------------------
function listByState(state) {
  if (state) {
    return db.prepare(`
      SELECT * FROM jobs
      WHERE state = ?
      ORDER BY created_at ASC
    `).all(state);
  }
  return db.prepare(`SELECT * FROM jobs ORDER BY created_at ASC`).all();
}

function getJob(id) {
  return db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id);
}

function updateJob(id, patch) {
  const current = getJob(id);
  if (!current) throw new Error('job not found');

  const updated = { ...current, ...patch, updated_at: nowISO() };

  db.prepare(`
    UPDATE jobs SET
      command = @command,
      state = @state,
      attempts = @attempts,
      max_retries = @max_retries,
      updated_at = @updated_at,
      locked_by = @locked_by,
      locked_at = @locked_at,
      next_run_at = @next_run_at,
      started_at = @started_at,
      finished_at = @finished_at,
      duration_ms = @duration_ms,
      priority = @priority,
      timeout_seconds = @timeout_seconds
    WHERE id = @id
  `).run(updated);

  return getJob(id);
}

// -------------------- CLAIM --------------------
function claimOne(workerId) {
  const now = nowISO(); // ISO, e.g., 2025-11-09T11:08:15Z

  const candidate = db.prepare(`
    SELECT id FROM jobs
    WHERE state = 'pending'
      AND (next_run_at IS NULL OR next_run_at <= ?)
    ORDER BY 
    priority DESC,
    next_run_at ASC,
    created_at ASC

    LIMIT 1
  `).get(now);

  if (!candidate) return null;

  const info = db.prepare(`
    UPDATE jobs
    SET state = 'processing',
        locked_by = ?, locked_at = ?, started_at = ?, updated_at = ?
    WHERE id = ? AND state = 'pending'
  `).run(workerId, now, now, now, candidate.id);

  if (info.changes === 0) return null;

  return getJob(candidate.id);
}

// -------------------- COMPLETE / FAIL / DLQ --------------------
function markCompleted(id) {
  const job = getJob(id);
  if (!job) return;

  const finish = nowISO();
  let duration = null;

  if (job.started_at) {
    const s = Date.parse(job.started_at);
    if (!Number.isNaN(s)) duration = Date.now() - s;
  }

  db.prepare(`
    UPDATE jobs
    SET state='completed',
        finished_at=?, duration_ms=?,
        updated_at=?, locked_by=NULL, locked_at=NULL
    WHERE id=?
  `).run(finish, duration, nowISO(), id);
}

function markFailedRetryable(id, attempts, backoffSeconds) {
  const nextRun = cleanISO(new Date(Date.now() + backoffSeconds * 1000));

  db.prepare(`
    UPDATE jobs
    SET state='pending',
        attempts=?, next_run_at=?,
        updated_at=?, locked_by=NULL, locked_at=NULL
    WHERE id=?
  `).run(attempts, nextRun, nowISO(), id);
}

function markDead(id) {
  db.prepare(`
    UPDATE jobs
    SET state='dead',
        updated_at=?, locked_by=NULL, locked_at=NULL
    WHERE id=?
  `).run(nowISO(), id);
}

// -------------------- CLEAR --------------------
function clearAllJobs() {
  return db.prepare(`DELETE FROM jobs`).run().changes || 0;
}

module.exports = {
  enqueue,
  listByState,
  getJob,
  updateJob,
  claimOne,
  markCompleted,
  markFailedRetryable,
  markDead,
  clearAllJobs
};
