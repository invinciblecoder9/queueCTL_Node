// src/worker_manager.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const RUNTIME_DIR = path.resolve(__dirname, '..', 'runtime');
if (!fs.existsSync(RUNTIME_DIR)) fs.mkdirSync(RUNTIME_DIR);

const WORKERS_FILE = path.join(RUNTIME_DIR, 'workers.json');

function savePids(pids) {
  fs.writeFileSync(WORKERS_FILE, JSON.stringify(pids, null, 2), 'utf-8');
}

function readPids() {
  if (!fs.existsSync(WORKERS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(WORKERS_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}

function startWorkers(count) {
  const pids = readPids();
  const spawned = [];
  for (let i = 0; i < count; i++) {
    const workerPath = path.join(__dirname, 'worker.js');
    const node = process.execPath;
    const child = spawn(node, [workerPath], {
      detached: true,
      stdio: ['ignore', 'inherit', 'inherit']
    });
    child.unref();
    spawned.push(child.pid);
    console.log(`Spawned worker pid ${child.pid}`);
  }
  const all = pids.concat(spawned);
  savePids(all);
  return spawned;
}

function stopWorkers() {
  const pids = readPids();
  if (!pids.length) {
    console.log('No workers PID file found (no workers running?)');
    return;
  }
  pids.forEach((pid) => {
    try {
      process.kill(pid, 'SIGTERM');
      console.log(`Sent SIGTERM to pid ${pid}`);
    } catch (e) {
      console.log(`Failed to send SIGTERM to pid ${pid}: ${e.message}`);
    }
  });
  // remove file
  try { fs.unlinkSync(WORKERS_FILE); } catch (e) {}
}

function listActiveWorkerPids() {
  return readPids();
}

module.exports = { startWorkers, stopWorkers, listActiveWorkerPids };
