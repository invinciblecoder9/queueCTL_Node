// src/dashboard.js
const express = require("express");
const { db } = require("./db");
const path = require("path");

const app = express();
app.use(express.static(path.join(__dirname, "public"))); // serve frontend files

// --- API ROUTES ---------------------------------------------------------

// Jobs (latest 200)
app.get("/api/jobs", (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, command, state, attempts, max_retries, created_at,
              started_at, finished_at, duration_ms, priority, next_run_at
       FROM jobs ORDER BY created_at DESC LIMIT 200`
    )
    .all();
  res.json(rows);
});

// Metrics
app.get("/api/metrics", (req, res) => {
  const counts = db
    .prepare("SELECT state, COUNT(*) AS cnt FROM jobs GROUP BY state")
    .all();

  const durationStats = db
    .prepare(
      `SELECT COUNT(*) AS completed_count,
              ROUND(AVG(duration_ms),2) AS avg_ms,
              MIN(duration_ms) AS min_ms,
              MAX(duration_ms) AS max_ms
       FROM jobs
       WHERE state = 'completed' AND duration_ms IS NOT NULL`
    )
    .get();

  const overall = db
    .prepare(
      `SELECT COUNT(*) AS total_jobs,
              ROUND(AVG(attempts),2) AS avg_attempts,
              SUM(CASE WHEN state='dead' THEN 1 ELSE 0 END) AS dead_jobs
       FROM jobs`
    )
    .get();

  res.json({ counts, durationStats, overall });
});

// Workers
app.get("/api/workers", (req, res) => {
  const fs = require("fs");
  const runtimeFile = path.join(__dirname, "..", "runtime", "workers.json");
  let pids = [];

  try {
    if (fs.existsSync(runtimeFile)) {
      pids = JSON.parse(fs.readFileSync(runtimeFile, "utf8"));
    }
  } catch (_) {}

  res.json({ workers: pids });
});

// -----------------------------------------------------------------------

// Serve dashboard UI
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server
const PORT = 8080;
app.listen(PORT, () =>
  console.log(`Dashboard running at http://localhost:${PORT}`)
);
