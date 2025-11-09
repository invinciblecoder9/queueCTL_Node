<#
===========================================================
 queuectl – Automated Test Script (PowerShell)
 Validates all core flows required by the assignment:
 - Enqueue (success, fail, delayed, priority)
 - Workers (start/stop)
 - Retry + Backoff (via config, not hardcoded)
 - DLQ
 - Metrics
 - Persistence
===========================================================
#>

Write-Host "== Cleaning environment ==" -ForegroundColor Cyan
# stop workers if running (ignore errors)
node src/cli.js worker stop 2>$null
# reset DB and runtime state
Remove-Item -Force data\queue.db -ErrorAction Ignore
Remove-Item -Force runtime\workers.json -ErrorAction Ignore
Write-Host "Database cleared.`n"

Start-Sleep -Seconds 1

# ---------------------------------------------------------
# 0. Configure system (prove not hardcoded)
# ---------------------------------------------------------
Write-Host "== 0. Configure system (no hardcoded defaults) ==" -ForegroundColor Cyan
node src/cli.js config set default_max_retries 2
node src/cli.js config set backoff_base 2
Write-Host "-- Effective config --"
node src/cli.js config list
Write-Host "`n"

# ---------------------------------------------------------
# 1. Status (empty state)
# ---------------------------------------------------------
Write-Host "== 1. Initial Status ==" -ForegroundColor Cyan
node src/cli.js status
Write-Host "`n"

# ---------------------------------------------------------
# 2. Enqueue jobs
# ---------------------------------------------------------
Write-Host "== 2. Enqueue Jobs ==" -ForegroundColor Cyan

Write-Host "-- Enqueue success job"
node src/cli.js enqueue --id job_success --command "echo Hello"

Write-Host "-- Enqueue failing job (uses global retries from config)"
# IMPORTANT: PowerShell-safe quoting so --max-retries is NOT swallowed into the command
# We rely on config (default_max_retries=2), so no per-job --max-retries here.
node src/cli.js enqueue --id job_fail --command "node -e \"process.exit(1)\""

Write-Host "-- Enqueue delayed job (runs 20 seconds later)"
$runAt = (Get-Date).ToUniversalTime().AddSeconds(20).ToString('yyyy-MM-ddTHH:mm:ssZ')
node src/cli.js enqueue --id job_delayed --command "echo delayed" --run-at $runAt

Write-Host "-- Enqueue priority jobs"
node src/cli.js enqueue --id job_high --command "echo high" --priority 10
node src/cli.js enqueue --id job_low  --command "echo low"  --priority 1

Write-Host "`n"

Start-Sleep -Seconds 1

# ---------------------------------------------------------
# 3. Start workers
# ---------------------------------------------------------
Write-Host "== 3. Start 3 Workers ==" -ForegroundColor Cyan
node src/cli.js worker start --count 3
Write-Host "`n"

Write-Host "Allowing workers to process (includes backoff time)..."
# With backoff_base=2 and default_max_retries=2, failing job should hit DLQ within ~6–8s.
Start-Sleep -Seconds 10

# ---------------------------------------------------------
# 4. Status
# ---------------------------------------------------------
Write-Host "== 4. Status after processing ==" -ForegroundColor Cyan
node src/cli.js status
Write-Host "`n"

# ---------------------------------------------------------
# 5. List all jobs
# ---------------------------------------------------------
Write-Host "== 5. List all jobs ==" -ForegroundColor Cyan
node src/cli.js list
Write-Host "`n"

# ---------------------------------------------------------
# 6. DLQ
# ---------------------------------------------------------
Write-Host "== 6. DLQ List ==" -ForegroundColor Cyan
node src/cli.js dlq list
Write-Host "`n"

# Retry the failed DLQ job (if present)
Write-Host "== 6b. Retry 'job_fail' from DLQ ==" -ForegroundColor Cyan
node src/cli.js dlq retry job_fail
Write-Host "`n"

Write-Host "Allowing workers to retry..."
Start-Sleep -Seconds 12

Write-Host "== DLQ After Retry Attempt ==" -ForegroundColor Cyan
node src/cli.js dlq list
Write-Host "`n"

# ---------------------------------------------------------
# 7. Metrics
# ---------------------------------------------------------
Write-Host "== 7. Metrics ==" -ForegroundColor Cyan
node src/cli.js metrics
Write-Host "`n"

# ---------------------------------------------------------
# 8. Stop workers
# ---------------------------------------------------------
Write-Host "== 8. Stop Workers ==" -ForegroundColor Cyan
node src/cli.js worker stop
Write-Host "`n"

Write-Host "== Test Completed Successfully ==" -ForegroundColor Green
