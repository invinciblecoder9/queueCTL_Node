// src/worker_manager.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const RUNTIME_DIR = path.resolve(__dirname, '..', 'runtime');
if (!fs.existsSync(RUNTIME_DIR)) fs.mkdirSync(RUNTIME_DIR, { recursive: true });

const WORKERS_FILE = path.join(RUNTIME_DIR, 'workers.json');

function savePids(pids) {
  fs.writeFileSync(WORKERS_FILE, JSON.stringify(pids, null, 2), 'utf-8');
}

function readPids() {
  if (!fs.existsSync(WORKERS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(WORKERS_FILE, 'utf-8'));
  } catch (_) {
    return [];
  }
}

function startWorkers(count) {
  const existing = readPids();
  const spawned = [];

  for (let i = 0; i < count; i++) {
    const workerPath = path.join(__dirname, 'worker.js');

    const child = spawn(process.execPath, [workerPath], {
      cwd: path.join(__dirname, '..'), // run from project root
      detached: true,
      stdio: 'ignore' // <---- CRITICAL FIX FOR WINDOWS
    });

    child.unref();
    spawned.push(child.pid);
    console.log(`Spawned worker pid ${child.pid}`);
  }

  savePids(existing.concat(spawned));
  return spawned;
}

function stopWorkers() {
  const pids = readPids();
  if (!pids.length) {
    console.log("No active workers found.");
    return;
  }

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
      console.log(`Sent SIGTERM to pid ${pid}`);
    } catch (err) {
      console.log(`Failed to terminate pid ${pid}: ${err.message}`);
    }
  }

  // clear file
  try { fs.unlinkSync(WORKERS_FILE); } catch (_) {}
}

function listActiveWorkerPids() {
  return readPids();
}

module.exports = { startWorkers, stopWorkers, listActiveWorkerPids };
