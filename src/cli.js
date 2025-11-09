// #!/usr/bin/env node
// // src/cli.js
// const { program } = require('commander');
// const fs = require('fs');
// const path = require('path');
// const { makeId } = require('./queuectl');
// const { enqueue } = require('./jobs');
// const { startWorkers, stopWorkers, listActiveWorkerPids } = require('./worker_manager');
// const { setConfig, getConfig, allConfig } = require('./config');

// program
//   .name('queuectl')
//   .description('CLI for queuectl background job queue')
//   .version('1.0.0');

// // Helper to read stdin (returns a Promise)
// function readStdin() {
//   return new Promise((resolve, reject) => {
//     let data = '';
//     if (process.stdin.isTTY) return resolve('');
//     process.stdin.setEncoding('utf8');
//     process.stdin.on('data', chunk => { data += chunk; });
//     process.stdin.on('end', () => resolve(data));
//     process.stdin.on('error', err => reject(err));
//   });
// }

// // Parse job from multiple input sources
// async function parseJobInput(jobJsonArg, opts) {
//   // Priority:
//   // 1) --file <path>
//   // 2) jobJsonArg === '-'  -> read stdin
//   // 3) --id && --command flags
//   // 4) jobJsonArg (string) -> parse JSON
//   // 5) stdin (if any)
//   if (opts.file) {
//     const filePath = path.resolve(process.cwd(), opts.file);
//     const raw = fs.readFileSync(filePath, 'utf8');
//     return JSON.parse(raw);
//   }

//   if (jobJsonArg === '-') {
//     const raw = await readStdin();
//     if (!raw || !raw.trim()) throw new Error('No JSON on stdin');
//     return JSON.parse(raw);
//   }

//   if (opts.id && opts.command) {
//     const job = {
//       id: opts.id,
//       command: opts.command
//     };
//     if (typeof opts.maxRetries !== 'undefined') job.max_retries = opts.maxRetries;
//     if (typeof opts.priority !== 'undefined') job.priority = opts.priority;
//     if (typeof opts.runAt !== 'undefined') job.run_at = opts.runAt;
//     if (typeof opts.timeout !== 'undefined') job.timeout_seconds = opts.timeout;
//     return job;
//   }

//   if (jobJsonArg) {
//     try {
//       return JSON.parse(jobJsonArg);
//     } catch (e) {
//       // let fallback to stdin
//       // but throw if stdin empty
//       const raw = await readStdin();
//       if (raw && raw.trim()) {
//         try {
//           return JSON.parse(raw);
//         } catch (e2) {
//           throw new Error('Invalid JSON provided as argument and stdin');
//         }
//       }
//       throw new Error('Invalid JSON string provided');
//     }
//   }

//   // If no arg, try stdin
//   const raw = await readStdin();
//   if (raw && raw.trim()) {
//     return JSON.parse(raw);
//   }

//   throw new Error('No job provided. Use --file, --id/--command, a JSON string, or pipe JSON to stdin.');
// }

// // enqueue command
// program
//   .command('enqueue [jobJson]')
//   .description('Add a new job to the queue. Ways: (1) --file file.json (2) --id id --command "echo hi" (3) pipe JSON into stdin (4) JSON string arg)')
//   .option('-f, --file <path>', 'path to JSON file containing the job')
//   .option('--id <id>', 'job id (optional)')
//   .option('--command <cmd>', 'command to run (optional)')
//   .option('--max-retries <n>', 'max retries', (v) => parseInt(v, 10))
//   .option('--priority <n>', 'job priority (higher = run first)', (v) => parseInt(v, 10))
//   .option('--run-at <iso-or-epoch>', 'schedule job to run at ISO datetime or epoch seconds')
//   .option('--timeout <seconds>', 'per-job timeout in seconds', (v) => parseInt(v, 10))
//   .action(async (jobJsonArg, opts) => {
//     try {
//       const job = await parseJobInput(jobJsonArg, opts);
//       // supply id if missing
//       if (!job.id) job.id = makeId('job-');
//       if (!job.command) {
//         console.error('Job must include "command" field');
//         process.exit(2);
//       }
//       // set defaults
//       if (typeof job.attempts === 'undefined') job.attempts = 0;
//       if (typeof job.max_retries === 'undefined') job.max_retries = parseInt(getConfig('default_max_retries') || '3', 10);
//       const createdId = enqueue(job);
//       console.log(`Enqueued job ${createdId}`);
//     } catch (err) {
//       console.error('Invalid JSON or input:', err.message);
//       process.exit(2);
//     }
//   });

// // worker commands (start and stop)
// const workerCmd = program.command('worker').description('Worker management');

// workerCmd
//   .command('start')
//   .description('Start one or more workers in separate processes (detached)')
//   .option('--count <n>', 'number of worker processes', '1')
//   .action((opts) => {
//     const n = parseInt(opts.count || '1', 10);
//     startWorkers(n);
//   });

// workerCmd
//   .command('stop')
//   .description('Stop running workers gracefully')
//   .action(() => {
//     stopWorkers();
//   });

// // status
// program
//   .command('status')
//   .description('Show summary of job states & active workers')
//   .action(() => {
//     // lazy require to avoid cycles
//     const { listByState } = require('./jobs');
//     const all = listByState();
//     const counts = all.reduce((acc, j) => {
//       acc[j.state] = (acc[j.state] || 0) + 1;
//       return acc;
//     }, {});
//     console.log('Job counts by state:', counts);
//     const pids = listActiveWorkerPids();
//     console.log('Active workers (PIDs):', pids);
//   });

// // list
// program
//   .command('list')
//   .description('List jobs (optionally by state)')
//   .option('--state <state>', 'pending|processing|completed|failed|dead')
//   .action((opts) => {
//     const { listByState } = require('./jobs');
//     const rows = listByState(opts.state);
//     // print minimal table
//     console.table(rows.map(r => ({
//       id: r.id,
//       command: r.command,
//       state: r.state,
//       attempts: r.attempts,
//       max_retries: r.max_retries,
//       created_at: r.created_at,
//       next_run_at: r.next_run_at
//     })));
//   });

// // dlq
// const dlq = program.command('dlq').description('DLQ operations');

// dlq
//   .command('list')
//   .description('List jobs in Dead Letter Queue (state=dead)')
//   .action(() => {
//     const { listByState } = require('./jobs');
//     const rows = listByState('dead');
//     console.table(rows.map(r => ({
//       id: r.id, command: r.command, state: r.state, attempts: r.attempts, max_retries: r.max_retries, updated_at: r.updated_at
//     })));
//   });

// dlq
//   .command('retry <id>')
//   .description('Retry a DLQ job by id')
//   .action((id) => {
//     const { getJob, updateJob } = require('./jobs');
//     const j = getJob(id);
//     if (!j) {
//       console.error('job not found:', id);
//       process.exit(2);
//     }
//     if (j.state !== 'dead') {
//       console.error('job is not in DLQ (state != dead)');
//       process.exit(2);
//     }
//     updateJob(id, { attempts: 0, state: 'pending', next_run_at: new Date().toISOString() });
//     console.log('Retried job:', id);
//   });

// // config subcommands
// const cfg = program.command('config').description('Config management');

// cfg
//   .command('set <key> <value>')
//   .description('Set a config key')
//   .action((key, value) => {
//     setConfig(key, value);
//     console.log(`Config ${key} = ${value}`);
//   });

// cfg
//   .command('get <key>')
//   .description('Get a config value')
//   .action((key) => {
//     const v = getConfig(key);
//     console.log(v === null ? '(null)' : v);
//   });

// cfg
//   .command('list')
//   .description('List all config')
//   .action(() => {
//     console.table(allConfig());
//   });

// program.parse(process.argv);
// if (!process.argv.slice(2).length) {
//   program.help();
// }



// src/cli.js
const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const { makeId } = require('./queuectl');
const { enqueue } = require('./jobs');
const { startWorkers, stopWorkers, listActiveWorkerPids } = require('./worker_manager');
const { setConfig, getConfig, allConfig } = require('./config');

program
  .name('queuectl')
  .description('CLI for queuectl background job queue')
  .version('1.0.0');

// Helper to read stdin (returns a Promise)
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    if (process.stdin.isTTY) return resolve('');
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', err => reject(err));
  });
}

// Parse job from multiple input sources
async function parseJobInput(jobJsonArg, opts) {
  // Priority:
  // 1) --file <path>
  // 2) jobJsonArg === '-'  -> read stdin
  // 3) --id && --command flags
  // 4) jobJsonArg (string) -> parse JSON
  // 5) stdin (if any)
  if (opts.file) {
    const filePath = path.resolve(process.cwd(), opts.file);
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  }

  if (jobJsonArg === '-') {
    const raw = await readStdin();
    if (!raw || !raw.trim()) throw new Error('No JSON on stdin');
    return JSON.parse(raw);
  }

  if (opts.id && opts.command) {
    const job = {
      id: opts.id,
      command: opts.command
    };
    if (typeof opts.maxRetries !== 'undefined') job.max_retries = opts.maxRetries;
    if (typeof opts.priority !== 'undefined') job.priority = opts.priority;
    if (typeof opts.runAt !== 'undefined') job.run_at = opts.runAt;
    if (typeof opts.timeout !== 'undefined') job.timeout_seconds = opts.timeout;
    return job;
  }

  if (jobJsonArg) {
    try {
      return JSON.parse(jobJsonArg);
    } catch (e) {
      // let fallback to stdin
      // but throw if stdin empty
      const raw = await readStdin();
      if (raw && raw.trim()) {
        try {
          return JSON.parse(raw);
        } catch (e2) {
          throw new Error('Invalid JSON provided as argument and stdin');
        }
      }
      throw new Error('Invalid JSON string provided');
    }
  }

  // If no arg, try stdin
  const raw = await readStdin();
  if (raw && raw.trim()) {
    return JSON.parse(raw);
  }

  throw new Error('No job provided. Use --file, --id/--command, a JSON string, or pipe JSON to stdin.');
}

// enqueue command
program
  .command('enqueue [jobJson]')
  .description('Add a new job to the queue. Ways: (1) --file file.json (2) --id id --command "echo hi" (3) pipe JSON into stdin (4) JSON string arg)')
  .option('-f, --file <path>', 'path to JSON file containing the job')
  .option('--id <id>', 'job id (optional)')
  .option('--command <cmd>', 'command to run (optional)')
  .option('--max-retries <n>', 'max retries', (v) => parseInt(v, 10))
  .option('--priority <n>', 'job priority (higher = run first)', (v) => parseInt(v, 10))
  .option('--run-at <iso-or-epoch>', 'schedule job to run at ISO datetime or epoch seconds')
  .option('--timeout <seconds>', 'per-job timeout in seconds', (v) => parseInt(v, 10))
  .action(async (jobJsonArg, opts) => {
    try {
      const job = await parseJobInput(jobJsonArg, opts);
      // supply id if missing
      if (!job.id) job.id = makeId('job-');
      if (!job.command) {
        console.error('Job must include "command" field');
        process.exit(2);
      }
      // set defaults
      if (typeof job.attempts === 'undefined') job.attempts = 0;
      if (typeof job.max_retries === 'undefined') job.max_retries = parseInt(getConfig('default_max_retries') || '3', 10);
      const createdId = enqueue(job);
      console.log(`Enqueued job ${createdId}`);
    } catch (err) {
      console.error('Invalid JSON or input:', err.message);
      process.exit(2);
    }
  });

// worker commands (start and stop)
const workerCmd = program.command('worker').description('Worker management');

workerCmd
  .command('start')
  .description('Start one or more workers in separate processes (detached)')
  .option('--count <n>', 'number of worker processes', '1')
  .action((opts) => {
    const n = parseInt(opts.count || '1', 10);
    startWorkers(n);
  });

workerCmd
  .command('stop')
  .description('Stop running workers gracefully')
  .action(() => {
    stopWorkers();
  });

// status
program
  .command('status')
  .description('Show summary of job states & active workers')
  .action(() => {
    // lazy require to avoid cycles
    const { listByState } = require('./jobs');
    const all = listByState();
    const counts = all.reduce((acc, j) => {
      acc[j.state] = (acc[j.state] || 0) + 1;
      return acc;
    }, {});
    console.log('Job counts by state:', counts);
    const pids = listActiveWorkerPids();
    console.log('Active workers (PIDs):', pids);
  });

// list
program
  .command('list')
  .description('List jobs (optionally by state)')
  .option('--state <state>', 'pending|processing|completed|failed|dead')
  .action((opts) => {
    const { listByState } = require('./jobs');
    const rows = listByState(opts.state);
    // print minimal table
    console.table(rows.map(r => ({
      id: r.id,
      command: r.command,
      state: r.state,
      attempts: r.attempts,
      max_retries: r.max_retries,
      created_at: r.created_at,
      next_run_at: r.next_run_at
    })));
  });

// dlq
const dlq = program.command('dlq').description('DLQ operations');

dlq
  .command('list')
  .description('List jobs in Dead Letter Queue (state=dead)')
  .action(() => {
    const { listByState } = require('./jobs');
    const rows = listByState('dead');
    console.table(rows.map(r => ({
      id: r.id, command: r.command, state: r.state, attempts: r.attempts, max_retries: r.max_retries, updated_at: r.updated_at
    })));
  });

dlq
  .command('retry <id>')
  .description('Retry a DLQ job by id')
  .action((id) => {
    const { getJob, updateJob } = require('./jobs');
    const j = getJob(id);
    if (!j) {
      console.error('job not found:', id);
      process.exit(2);
    }
    if (j.state !== 'dead') {
      console.error('job is not in DLQ (state != dead)');
      process.exit(2);
    }
    updateJob(id, { attempts: 0, state: 'pending', next_run_at: new Date().toISOString() });
    console.log('Retried job:', id);
  });

// config subcommands
const cfg = program.command('config').description('Config management');

cfg
  .command('set <key> <value>')
  .description('Set a config key')
  .action((key, value) => {
    setConfig(key, value);
    console.log(`Config ${key} = ${value}`);
  });

cfg
  .command('get <key>')
  .description('Get a config value')
  .action((key) => {
    const v = getConfig(key);
    console.log(v === null ? '(null)' : v);
  });

cfg
  .command('list')
  .description('List all config')
  .action(() => {
    console.table(allConfig());
  });

/**
 * Metrics command
 * - job counts by state
 * - completed jobs: avg/min/max duration_ms
 * - overall: total jobs, avg attempts, dead jobs
 */
program
  .command('metrics')
  .description('Show metrics: job counts by state, and duration stats for completed jobs')
  .action(() => {
    const { db } = require('./db');
    // counts by state
    const counts = db.prepare('SELECT state, COUNT(*) AS cnt FROM jobs GROUP BY state').all();
    console.log('Job counts by state:');
    console.table(counts);

    // average/min/max duration for completed jobs (ms)
    const dur = db.prepare(`
      SELECT
        COUNT(*) AS completed_count,
        ROUND(AVG(duration_ms), 2) AS avg_ms,
        MIN(duration_ms) AS min_ms,
        MAX(duration_ms) AS max_ms
      FROM jobs
      WHERE state = 'completed' AND duration_ms IS NOT NULL
    `).get();

    console.log('Completed jobs duration (ms):');
    console.table([dur]);

    // overall stats: total jobs, avg attempts
    const overall = db.prepare(`
      SELECT COUNT(*) AS total_jobs, ROUND(AVG(attempts), 2) AS avg_attempts, SUM(CASE WHEN state='dead' THEN 1 ELSE 0 END) AS dead_jobs
      FROM jobs
    `).get();

    console.log('Overall:');
    console.table([overall]);
  });

program.parse(process.argv);
if (!process.argv.slice(2).length) {
  program.help();
}
