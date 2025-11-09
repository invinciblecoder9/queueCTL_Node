// // src/jobs.js
// const { db } = require('./db');

// function nowISO() {
//   return new Date().toISOString();
// }

// /**
//  * Enqueue a job object into the jobs table.
//  * Expects job to have at least: id, command. Other fields optional.
//  * Returns the job id after successful insert.
//  */
// function enqueue(job) {
//   if (!job || !job.command) {
//     throw new Error('job must be an object with a "command" field');
//   }

//   // ensure id exists (caller may set it)
//   if (!job.id) {
//     throw new Error('job must include an "id" field');
//   }

//   const ts = nowISO();
//   const stmt = db.prepare(`
//     INSERT INTO jobs (id, command, state, attempts, max_retries, created_at, updated_at, next_run_at)
//     VALUES (@id, @command, 'pending', @attempts, @max_retries, @created_at, @updated_at, @next_run_at)
//   `);

//   try {
//     stmt.run({
//       id: job.id,
//       command: job.command,
//       attempts: job.attempts ?? 0,
//       max_retries: job.max_retries ?? 3,
//       created_at: job.created_at ?? ts,
//       updated_at: job.updated_at ?? ts,
//       next_run_at: job.next_run_at ?? ts
//     });
//   } catch (err) {
//     // provide clearer error for common cases (e.g. unique constraint)
//     if (err && err.message && err.message.includes('UNIQUE constraint failed')) {
//       throw new Error(`Job with id "${job.id}" already exists`);
//     }
//     throw err;
//   }

//   // Important: return the id so CLI can display it
//   return job.id;
// }

// function listByState(state) {
//   if (state) {
//     return db.prepare('SELECT * FROM jobs WHERE state = ? ORDER BY created_at').all(state);
//   } else {
//     return db.prepare('SELECT * FROM jobs ORDER BY created_at').all();
//   }
// }

// function getJob(id) {
//   return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
// }

// function updateJob(id, patch) {
//   const current = getJob(id);
//   if (!current) throw new Error('job not found');
//   const updated = { ...current, ...patch, updated_at: new Date().toISOString() };
//   const stmt = db.prepare(`
//     UPDATE jobs SET
//       command = @command,
//       state = @state,
//       attempts = @attempts,
//       max_retries = @max_retries,
//       updated_at = @updated_at,
//       locked_by = @locked_by,
//       locked_at = @locked_at,
//       next_run_at = @next_run_at
//     WHERE id = @id
//   `);
//   stmt.run({
//     id: id,
//     command: updated.command,
//     state: updated.state,
//     attempts: updated.attempts,
//     max_retries: updated.max_retries,
//     updated_at: updated.updated_at,
//     locked_by: updated.locked_by,
//     locked_at: updated.locked_at,
//     next_run_at: updated.next_run_at
//   });
//   return getJob(id);
// }

// // Atomically claim one job that is pending and whose next_run_at <= now
// function claimOne(workerId) {
//   const now = new Date().toISOString();
//   // Select candidate
//   const candidate = db.prepare(`
//     SELECT id FROM jobs
//     WHERE state = 'pending' AND (next_run_at IS NULL OR next_run_at <= ?)
//     ORDER BY created_at
//     LIMIT 1
//   `).get(now);

//   if (!candidate) return null;

//   const update = db.prepare(`
//     UPDATE jobs
//     SET state = 'processing', locked_by = ?, locked_at = ?, updated_at = ?
//     WHERE id = ? AND state = 'pending'
//   `);

//   const info = update.run(workerId, now, now, candidate.id);
//   if (info.changes === 0) {
//     // someone else claimed
//     return null;
//   }
//   return getJob(candidate.id);
// }

// function markCompleted(id) {
//   db.prepare(`
//     UPDATE jobs SET state = 'completed', updated_at = ?, locked_by = NULL, locked_at = NULL
//     WHERE id = ?
//   `).run(new Date().toISOString(), id);
// }

// function markFailedRetryable(id, attempts, backoffSeconds) {
//   const nextRun = new Date(Date.now() + backoffSeconds * 1000).toISOString();
//   db.prepare(`
//     UPDATE jobs SET state = 'pending', attempts = ?, next_run_at = ?, updated_at = ?, locked_by = NULL, locked_at = NULL
//     WHERE id = ?
//   `).run(attempts, nextRun, new Date().toISOString(), id);
// }

// function markDead(id) {
//   db.prepare(`
//     UPDATE jobs SET state = 'dead', updated_at = ?, locked_by = NULL, locked_at = NULL
//     WHERE id = ?
//   `).run(new Date().toISOString(), id);
// }

// module.exports = {
//   enqueue,
//   listByState,
//   getJob,
//   updateJob,
//   claimOne,
//   markCompleted,
//   markFailedRetryable,
//   markDead
// };



// src/jobs.js
const { db } = require('./db');

function nowISO() {
  return new Date().toISOString();
}

function enqueue(job) {
  const ts = nowISO();
  const stmt = db.prepare(`
    INSERT INTO jobs (id, command, state, attempts, max_retries, created_at, updated_at, next_run_at, priority)
    VALUES (@id, @command, 'pending', @attempts, @max_retries, @created_at, @updated_at, @next_run_at, @priority)
  `);
  stmt.run({
    id: job.id,
    command: job.command,
    attempts: job.attempts ?? 0,
    max_retries: job.max_retries ?? 3,
    created_at: job.created_at ?? ts,
    updated_at: job.updated_at ?? ts,
    next_run_at: job.next_run_at ?? ts,
    priority: job.priority ?? 0
  });
  return job.id;
}

function listByState(state) {
  if (state) {
    return db.prepare('SELECT * FROM jobs WHERE state = ? ORDER BY created_at').all(state);
  } else {
    return db.prepare('SELECT * FROM jobs ORDER BY created_at').all();
  }
}

function getJob(id) {
  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
}

// updateJob: set many fields; include started_at, finished_at, duration_ms
function updateJob(id, patch) {
  const current = getJob(id);
  if (!current) throw new Error('job not found');
  const updated = {
    ...current,
    ...patch,
    updated_at: new Date().toISOString()
  };

  const stmt = db.prepare(`
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
      priority = @priority
    WHERE id = @id
  `);

  stmt.run(updated);
  return getJob(id);
}

// Atomically claim one job that is pending and whose next_run_at <= now
function claimOne(workerId) {
  const now = new Date().toISOString();
  const candidate = db.prepare(`
    SELECT id FROM jobs
    WHERE state = 'pending' AND (next_run_at IS NULL OR next_run_at <= ?)
    ORDER BY priority DESC, created_at
    LIMIT 1
  `).get(now);

  if (!candidate) return null;

  // Set state processing and record locked_by and started_at (claim time)
  const update = db.prepare(`
    UPDATE jobs
    SET state = 'processing', locked_by = ?, locked_at = ?, started_at = ?, updated_at = ?
    WHERE id = ? AND state = 'pending'
  `);

  const info = update.run(workerId, now, now, now, candidate.id);
  if (info.changes === 0) {
    return null;
  }
  return getJob(candidate.id);
}

function markCompleted(id) {
  const job = getJob(id);
  if (!job) return;
  const finishedAt = new Date().toISOString();
  let duration = null;
  if (job.started_at) {
    const s = Date.parse(job.started_at);
    if (!Number.isNaN(s)) {
      duration = Date.now() - s;
    }
  }
  db.prepare(`
    UPDATE jobs SET state = 'completed', finished_at = ?, duration_ms = ?, updated_at = ?, locked_by = NULL, locked_at = NULL
    WHERE id = ?
  `).run(finishedAt, duration, new Date().toISOString(), id);
}

function markFailedRetryable(id, attempts, backoffSeconds) {
  const nextRun = new Date(Date.now() + backoffSeconds * 1000).toISOString();
  db.prepare(`
    UPDATE jobs SET state = 'pending', attempts = ?, next_run_at = ?, updated_at = ?, locked_by = NULL, locked_at = NULL
    WHERE id = ?
  `).run(attempts, nextRun, new Date().toISOString(), id);
}

function markDead(id) {
  db.prepare(`
    UPDATE jobs SET state = 'dead', updated_at = ?, locked_by = NULL, locked_at = NULL
    WHERE id = ?
  `).run(new Date().toISOString(), id);
}

module.exports = {
  enqueue,
  listByState,
  getJob,
  updateJob,
  claimOne,
  markCompleted,
  markFailedRetryable,
  markDead
};

