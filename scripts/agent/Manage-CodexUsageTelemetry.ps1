param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Install', 'Start', 'Stop', 'Status', 'ObjectiveStart', 'ObjectiveStop', 'Summary')]
    [string]$Action,

    [string]$ObjectiveId,
    [string]$Category,
    [string]$Risk,
    [string]$AuthorizedOutcomeScope,
    [string]$CodexConfigPath,
    [string]$TelemetryStorageRoot
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$collector = Join-Path $repoRoot 'scripts\agent\codexTelemetryCollector.js'
$storageRoot = if ([string]::IsNullOrWhiteSpace($TelemetryStorageRoot)) {
    Join-Path $env:LOCALAPPDATA 'FinancasBot\codex-usage-calibration'
} else {
    [System.IO.Path]::GetFullPath($TelemetryStorageRoot)
}
$eventsPath = Join-Path $storageRoot 'events.jsonl'
$statePath = Join-Path $storageRoot 'active-objective.json'
$pidPath = Join-Path $storageRoot 'collector.pid'
$stdoutPath = Join-Path $storageRoot 'collector.stdout.log'
$stderrPath = Join-Path $storageRoot 'collector.stderr.log'
$configPath = if ([string]::IsNullOrWhiteSpace($CodexConfigPath)) {
    Join-Path $HOME '.codex\config.toml'
} else {
    [System.IO.Path]::GetFullPath($CodexConfigPath)
}

function Ensure-StorageRoot {
    [System.IO.Directory]::CreateDirectory($storageRoot) | Out-Null
}

function Get-CollectorProcess {
    if (-not (Test-Path -LiteralPath $pidPath)) { return $null }
    $rawPid = (Get-Content -Raw -LiteralPath $pidPath).Trim()
    if ($rawPid -notmatch '^\d+$') { return $null }
    $candidate = Get-CimInstance Win32_Process -Filter "ProcessId = $rawPid" -ErrorAction SilentlyContinue
    if ($null -eq $candidate) { return $null }
    $expected = [System.IO.Path]::GetFullPath($collector)
    if ([string]$candidate.CommandLine -notlike "*$expected*") { return $null }
    return $candidate
}

function Test-Health {
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:4318/health' -TimeoutSec 2
        return ($health.ok -eq $true)
    } catch {
        return $false
    }
}

switch ($Action) {
    'Install' {
        Ensure-StorageRoot
        if (-not (Test-Path -LiteralPath $configPath)) {
            throw "Config do Codex nao encontrado: $configPath"
        }
        $config = Get-Content -Raw -LiteralPath $configPath
        if ($config -match '(?m)^\s*\[otel\]\s*$') {
            throw 'A secao [otel] ja existe; nenhuma alteracao foi feita.'
        }
        $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $backupPath = "$configPath.before-financasbot-otel-$timestamp.bak"
        Copy-Item -LiteralPath $configPath -Destination $backupPath
        $block = @'

# FinancasBot: telemetria local sanitizada. O receptor descarta conteudo bruto.
[otel]
environment = "financasbot-local"
exporter = { otlp-http = { endpoint = "http://127.0.0.1:4318/v1/logs", protocol = "json" } }
metrics_exporter = { otlp-http = { endpoint = "http://127.0.0.1:4318/v1/metrics", protocol = "json" } }
trace_exporter = "none"
log_user_prompt = false
'@
        [System.IO.File]::AppendAllText($configPath, $block, [System.Text.UTF8Encoding]::new($false))
        Write-Output ([ordered]@{
            ok = $true
            config = $configPath
            backup = $backupPath
            restart_required = $true
        } | ConvertTo-Json -Compress)
    }
    'Start' {
        Ensure-StorageRoot
        $existing = Get-CollectorProcess
        if ($null -ne $existing -and (Test-Health)) {
            Write-Output ([ordered]@{ ok = $true; already_running = $true; pid = $existing.ProcessId } | ConvertTo-Json -Compress)
            break
        }
        $node = (Get-Command node -ErrorAction Stop).Source
        $arguments = @(
            $collector,
            'serve',
            '--host', '127.0.0.1',
            '--port', '4318',
            '--output', $eventsPath,
            '--state', $statePath,
            '--pid-file', $pidPath
        )
        $process = Start-Process -FilePath $node -ArgumentList $arguments -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
        $deadline = (Get-Date).AddSeconds(8)
        do {
            Start-Sleep -Milliseconds 200
            if (Test-Health) { break }
        } while ((Get-Date) -lt $deadline -and -not $process.HasExited)
        if (-not (Test-Health)) {
            throw "Coletor nao ficou saudavel. Consulte $stderrPath"
        }
        Write-Output ([ordered]@{ ok = $true; pid = $process.Id; health = $true } | ConvertTo-Json -Compress)
    }
    'Stop' {
        $process = Get-CollectorProcess
        if ($null -eq $process) {
            Write-Output ([ordered]@{ ok = $true; already_stopped = $true } | ConvertTo-Json -Compress)
            break
        }
        Stop-Process -Id $process.ProcessId
        Write-Output ([ordered]@{ ok = $true; stopped_pid = $process.ProcessId } | ConvertTo-Json -Compress)
    }
    'Status' {
        $process = Get-CollectorProcess
        $otelConfigured = $false
        if (Test-Path -LiteralPath $configPath) {
            $otelConfigured = [bool](Select-String -LiteralPath $configPath -Pattern '^\s*\[otel\]\s*$' -Quiet)
        }
        Write-Output ([ordered]@{
            ok = $true
            configured = $otelConfigured
            running = ($null -ne $process)
            healthy = (Test-Health)
            pid = if ($null -ne $process) { $process.ProcessId } else { $null }
            events_present = (Test-Path -LiteralPath $eventsPath)
            storage = $storageRoot
        } | ConvertTo-Json -Compress)
    }
    'ObjectiveStart' {
        if ([string]::IsNullOrWhiteSpace($ObjectiveId) -or
            [string]::IsNullOrWhiteSpace($Category) -or
            [string]::IsNullOrWhiteSpace($Risk) -or
            [string]::IsNullOrWhiteSpace($AuthorizedOutcomeScope)) {
            throw 'ObjectiveId, Category, Risk e AuthorizedOutcomeScope sao obrigatorios.'
        }
        & node $collector objective start --state $statePath --objective-id $ObjectiveId --category $Category --risk $Risk --authorized-outcome-scope $AuthorizedOutcomeScope
        if ($LASTEXITCODE -ne 0) { throw 'Falha ao iniciar objetivo.' }
    }
    'ObjectiveStop' {
        & node $collector objective stop --state $statePath
        if ($LASTEXITCODE -ne 0) { throw 'Falha ao encerrar objetivo.' }
    }
    'Summary' {
        & node $collector summary --output $eventsPath
        if ($LASTEXITCODE -ne 0) { throw 'Falha ao resumir telemetria.' }
    }
}
