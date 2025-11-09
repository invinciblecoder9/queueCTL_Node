// // src/worker.js
// const { claimOne, markCompleted, markFailedRetryable, markDead, getJob } = require('./jobs');
// const { getConfig } = require('./config');
// const { exec } = require('child_process');
// const process = require('process');

// const WORKER_ID = `worker-${process.pid}`;

// let shuttingDown = false;

// // graceful: finish current job, then exit
// process.on('SIGTERM', () => {
//   console.log(`[${WORKER_ID}] SIGTERM received — will exit after current job`);
//   shuttingDown = true;
// });

// async function sleep(ms) {
//   return new Promise((res) => setTimeout(res, ms));
// }

// function getBackoffBase() {
//   const b = getConfig('backoff_base') || '2';
//   const n = parseFloat(b);
//   return Number.isFinite(n) ? n : 2;
// }

// async function runLoop() {
//   console.log(`[${WORKER_ID}] started`);
//   while (!shuttingDown) {
//     try {
//       const job = claimOne(WORKER_ID);
//       if (!job) {
//         // nothing to do: sleep briefly
//         await sleep(1000);
//         continue;
//       }

//       console.log(`[${WORKER_ID}] claimed job ${job.id} (attempts=${job.attempts}) -> command: ${job.command}`);

//       // run the command
//       const child = exec(job.command, { timeout: 0 }); // no forced timeout for now
//       let stdout = '';
//       let stderr = '';
//       child.stdout?.on('data', (d) => { stdout += d; });
//       child.stderr?.on('data', (d) => { stderr += d; });

//       const exitCode = await new Promise((resolve) => {
//         child.on('close', (code) => {
//           resolve(code === null ? 1 : code);
//         });
//         // if process exits unexpectedly, get code
//         child.on('error', (err) => {
//           console.error(`[${WORKER_ID}] exec error`, err);
//           resolve(1);
//         });
//       });

//       if (exitCode === 0) {
//         console.log(`[${WORKER_ID}] job ${job.id} completed. stdout: ${stdout.trim()}`);
//         markCompleted(job.id);
//       } else {
//         // failure
//         const updatedJob = getJob(job.id);
//         const attempts = (updatedJob.attempts || 0) + 1;
//         const maxRetries = updatedJob.max_retries || 3;

//         if (attempts > maxRetries) {
//           console.log(`[${WORKER_ID}] job ${job.id} exceeded max_retries (${maxRetries}). Moving to DLQ.`);
//           markDead(job.id);
//         } else {
//           const base = getBackoffBase();
//           const backoffSeconds = Math.pow(base, attempts);
//           console.log(`[${WORKER_ID}] job ${job.id} failed (exit ${exitCode}). attempts=${attempts}/${maxRetries}. retrying in ${backoffSeconds}s`);
//           // increase attempts and schedule next_run_at
//           // markFailedRetryable expects attempts and backoffSeconds
//           markFailedRetryable(job.id, attempts, backoffSeconds);
//         }
//       }

//     } catch (err) {
//       console.error(`[${WORKER_ID}] loop error`, err);
//       await sleep(1000);
//     }
//   }

//   console.log(`[${WORKER_ID}] shutting down gracefully`);
//   process.exit(0);
// }

// runLoop();



// src/worker.js
const { claimOne, markCompleted, markFailedRetryable, markDead, getJob } = require('./jobs');
const { getConfig } = require('./config');
const { exec } = require('child_process');
const process = require('process');

const WORKER_ID = `worker-${process.pid}`;

let shuttingDown = false;

process.on('SIGTERM', () => {
  console.log(`[${WORKER_ID}] SIGTERM received — will exit after current job`);
  shuttingDown = true;
});

async function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function getBackoffBase() {
  const b = getConfig('backoff_base') || '2';
  const n = parseFloat(b);
  return Number.isFinite(n) ? n : 2;
}

async function runLoop() {
  console.log(`[${WORKER_ID}] started`);
  while (!shuttingDown) {
    try {
      const job = claimOne(WORKER_ID);
      if (!job) {
        await sleep(1000);
        continue;
      }

      console.log(`[${WORKER_ID}] claimed job ${job.id} (attempts=${job.attempts}) -> command: ${job.command}`);

      // execute command
      const child = exec(job.command, { timeout: 0 });

      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (d) => { stdout += d; });
      child.stderr?.on('data', (d) => { stderr += d; });

      const exitCode = await new Promise((resolve) => {
        child.on('close', (code) => {
          resolve(code === null ? 1 : code);
        });
        child.on('error', (err) => {
          console.error(`[${WORKER_ID}] exec error`, err.message || err);
          resolve(1);
        });
      });

      if (exitCode === 0) {
        console.log(`[${WORKER_ID}] job ${job.id} completed. stdout: ${stdout.trim()}`);
        // mark completed (duration is computed inside markCompleted)
        markCompleted(job.id);
      } else {
        const updatedJob = getJob(job.id) || job;
        const attempts = (updatedJob.attempts || 0) + 1;
        const maxRetries = updatedJob.max_retries || 3;

        if (attempts > maxRetries) {
          console.log(`[${WORKER_ID}] job ${job.id} exceeded max_retries (${maxRetries}). Moving to DLQ.`);
          markDead(job.id);
        } else {
          const base = getBackoffBase();
          const backoffSeconds = Math.pow(base, attempts);
          console.log(`[${WORKER_ID}] job ${job.id} failed (exit ${exitCode}). attempts=${attempts}/${maxRetries}. retrying in ${backoffSeconds}s`);
          markFailedRetryable(job.id, attempts, backoffSeconds);
        }
      }

    } catch (err) {
      console.error(`[${WORKER_ID}] loop error`, err);
      await sleep(1000);
    }
  }

  console.log(`[${WORKER_ID}] shutting down gracefully`);
  process.exit(0);
}

runLoop();


