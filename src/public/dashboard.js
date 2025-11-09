async function fetchJSON(url) {
  const res = await fetch(url);
  return res.json();
}

function renderWorkers(workers) {
  const tbody = document.querySelector("#workersTable tbody");
  tbody.innerHTML = "";

  workers.forEach((pid) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${pid}</td>`;
    tbody.appendChild(tr);
  });
}

function renderMetrics(data) {
  const div = document.querySelector("#metrics");

  div.innerHTML = `
    <strong>Total Jobs:</strong> ${data.overall.total_jobs}<br>
    <strong>Avg Attempts:</strong> ${data.overall.avg_attempts}<br>
    <strong>Dead Jobs:</strong> ${data.overall.dead_jobs}<br><br>
    <strong>Completed Jobs:</strong> ${data.durationStats.completed_count}<br>
    <strong>Avg Duration:</strong> ${data.durationStats.avg_ms || 0} ms<br>
  `;
}

function renderJobs(jobs) {
  const tbody = document.querySelector("#jobsTable tbody");
  tbody.innerHTML = "";

  jobs.forEach((j) => {
    const tr = document.createElement("tr");
    tr.classList.add(`state-${j.state}`);

    tr.innerHTML = `
      <td>${j.id}</td>
      <td>${j.state}</td>
      <td>${j.priority}</td>
      <td>${j.attempts}/${j.max_retries}</td>
      <td>${j.command}</td>
      <td>${new Date(j.created_at).toLocaleString()}</td>
      <td>${j.duration_ms ?? "-"}</td>
    `;

    tbody.appendChild(tr);
  });
}

async function refresh() {
  const [jobs, metrics, workers] = await Promise.all([
    fetchJSON("/api/jobs"),
    fetchJSON("/api/metrics"),
    fetchJSON("/api/workers"),
  ]);

  renderJobs(jobs);
  renderMetrics(metrics);
  renderWorkers(workers.workers);
}

setInterval(refresh, 2000); // auto refresh
refresh();
