# 🚀 queuectl — A Lightweight Background Job Queue with Workers, Retries & DLQ

`queuectl` is a **production-grade, CLI-controlled background job queue** built in Node.js.  
It supports **parallel workers**, **durable job storage**, **exponential backoff retries**, **Dead Letter Queue handling**, **priorities**, **delayed jobs**, **configuration management**, and powerful **metrics**.

This project is structured to replicate systems like Sidekiq, Celery, and BullMQ — but in a clean, minimal, file-based implementation suitable for interviews and small deployments.

---

# 📦 Features

- ✅ CLI based job queue  
- ✅ SQLite persistent storage  
- ✅ Multi-process workers  
- ✅ Exponential retry + backoff  
- ✅ Dead Letter Queue (DLQ)  
- ✅ Graceful shutdown  
- ✅ Scheduled / delayed jobs (`run_at`)  
- ✅ Priority queue (higher priority → earlier execution)  
- ✅ Duration tracking & metrics  
- ✅ Configurable retry/backoff via CLI  
- ✅ Zero external dependencies (SQLite only)  

---

# 1. ⚙️ Setup Instructions

### **Prerequisites**
- Node.js ≥ 16  
- SQLite (optional: automatically handled)  
- Linux / macOS / WSL recommended  

### **Clone & Install**
```bash
git clone https://github.com/<your-username>/queuectl.git
cd queuectl
npm install
node src/cli.js
```
---
# Directory Structure
```
src/
  cli.js             – main CLI tool (queuectl)
  db.js              – SQLite DB layer
  jobs.js            – job model & helpers
  worker.js          – worker process logic
  worker_manager.js  – start/stop multiple workers
  config.js          – config management
  queuectl.js        – utils (ID generator)
data/
  queue.db           – SQLite database
runtime/
  workers.json       – tracks running worker PIDs
```
---

# 2. 💻 Usage Examples

Below are the exact commands (with flags) to test each feature.
---

# ▶️ Enqueue Jobs
# Successful job
```
node src/cli.js enqueue --id job_success --command "echo 'Hello Success'" --max-retries 2
```

# Failing job
```
node src/cli.js enqueue --id job_fail --command "node -e \"process.exit(1)\"" --max-retries 2
```

# Scheduled job (runs in 30s)
```
node src/cli.js enqueue --id job_delayed --command "echo delayed" --run-at "$(date -u -d '+30 seconds' +%Y-%m-%dT%H:%M:%SZ)"
```

# Priority jobs
```
node src/cli.js enqueue --id job_high --command "echo high" --priority 10
node src/cli.js enqueue --id job_low  --command "echo low"  --priority 1
```

# 🏃‍♂️ Start & Stop Workers
```
node src/cli.js worker start --count 3
node src/cli.js worker stop
```

# 📋 List Jobs
```
node src/cli.js list
node src/cli.js list --state pending
node src/cli.js list --state completed
node src/cli.js list --state dead
```

# ⚰️ Dead Letter Queue
```
node src/cli.js dlq list
node src/cli.js dlq retry job_fail
```

# 🧩 Configuration
```
node src/cli.js config set backoff_base 2
node src/cli.js config get backoff_base
node src/cli.js config list
```

# 📊 Metrics
```
node src/cli.js metrics
```


Example output:
```
Job counts by state:
┌───────────┬─────┐
│ state     │ cnt │
└───────────┴─────┘

Completed jobs duration:
┌──────────────────┬─────────┬───────────┬───────────┐
│ completed_count  │ avg_ms  │ min_ms    │ max_ms    │
```
# 🧹 Clear all jobs (dev only)
```
node src/cli.js clear
```
---

# 3. 🏗 Architecture Overview

```queuectl``` is designed around durability, atomicity, and simplicity.
---
# Job Lifecycle
```
pending → processing → completed
                 ↘
                   failed → retry → retry → dead
```
---
# 1. Job Storage

Jobs are stored in SQLite ```(data/queue.db)``` with fields:
```
{
  "id": "job1",
  "command": "echo Hello",
  "state": "pending",
  "attempts": 0,
  "max_retries": 3,
  "priority": 10,
  "next_run_at": "2025-11-04T10:30:00Z",
  "started_at": "...",
  "finished_at": "...",
  "duration_ms": 123
}
```

# Why SQLite?

-Fast & reliable

-Zero configuration

-Perfect for single-node queues

-Atomic row locking prevents duplicate execution
---
# 2. Worker Execution Model

Each worker process:

-Polls for ```"pending"``` jobs

-Atomically claims a job (```UPDATE … WHERE state='pending'```)

-Executes shell command via ```child_process.exec```

-Records start/finish times

-Moves job to:

  -✅ ```completed```

  -⚠️ ```failed → retry → backoff```

  -❌ ```dead ```after ```max_retries```

Workers support:

 -Graceful shutdown (```SIGTERM```)

 -Timeouts (per job)

 -Exponential backoff
---
# 3. Dead Letter Queue (DLQ)

Jobs exceeding retry attempts automatically move to dead.
DLQ jobs can be inspected and retried manually:
```
queuectl dlq list
queuectl dlq retry <id>
```

# 4. Priority & Scheduling

Jobs are executed based on:
```
ORDER BY priority DESC, created_at ASC
```

Scheduled jobs are ignored until:
```
next_run_at <= now
```
---
# 5. Config System

Config values stored in DB:
```
default_max_retries
backoff_base
```


Editable at runtime:
```
queuectl config set backoff_base 3
queuectl config list
```
---
# 4. ⚖️ Assumptions & Trade-offs
✔️ Assumptions

-Single-machine execution (SQLite local store)

-Worker processes run on the same machine

-Commands are POSIX-compatible

-Backoff uses base^attempts

⚖️ Trade-offs

-SQLite is not suitable for multi-node clustering

-No recurring/scheduled cron jobs (only one-time run_at)

-No job cancellation or job pause

-Worker polling instead of push-based
---
#5. 🧪 Testing Instructions
#✅ 1. Test successful job
```
node src/cli.js clear
node src/cli.js enqueue --id ok1 --command "echo hi"
node src/cli.js worker start --count 1
sleep 2
node src/cli.js list --state completed
```

#✅ 2. Test failing job → retry → DLQ
```
node src/cli.js enqueue --id fail1 --command "node -e \"process.exit(1)\"" --max-retries 2
sleep 10
node src/cli.js dlq list
```

#✅ 3. Test priority ordering
```
node src/cli.js enqueue --id p1 --command "echo low" --priority 1
node src/cli.js enqueue --id p2 --command "echo high" --priority 10
node src/cli.js list --state pending
```

#✅ 4. Test delayed run
```
node src/cli.js enqueue --id d1 --command "echo delay" --run-at "$(date -u -d '+20 seconds' +%Y-%m-%dT%H:%M:%SZ)"
node src/cli.js worker start --count 1
```

#✅ 5. Test duplicate execution protection
```
rm -f /tmp/dup.log
node src/cli.js enqueue --id dup --command "bash -c 'echo run >> /tmp/dup.log'"
node src/cli.js worker start --count 5
sleep 3
node src/cli.js worker stop
wc -l /tmp/dup.log
```

Should output 1.

#✅ 6. Test metrics
```
node src/cli.js metrics
```

# 🏁 Conclusion

```queuectl``` is a complete, durable, and extendable background job queue with:

-multi-worker processing

-exponential retry & backoff

-DLQ

-config-driven behavior

-metrics

-priorities

-delayed jobs

-persistence

Designed to mimic real-world queue systems while remaining minimal and easy to understand.
