param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Install', 'Uninstall', 'Start', 'Stop', 'Status', 'ObjectiveStart', 'ObjectiveStop', 'Summary')]
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
$intervalsPath = Join-Path $storageRoot 'objective-intervals.jsonl'
$pidPath = Join-Path $storageRoot 'collector.pid'
$stdoutPath = Join-Path $storageRoot 'collector.stdout.log'
$stderrPath = Join-Path $storageRoot 'collector.stderr.log'
$installStatePath = Join-Path $storageRoot 'install-state.json'
$configPath = if ([string]::IsNullOrWhiteSpace($CodexConfigPath)) {
    Join-Path $HOME '.codex\config.toml'
} else {
    [System.IO.Path]::GetFullPath($CodexConfigPath)
}
$node = (Get-Command node -ErrorAction Stop).Source
$otelBlock = @'

# FinancasBot: telemetria local sanitizada. O receptor descarta conteudo bruto.
[otel]
environment = "financasbot-local"
exporter = { otlp-http = { endpoint = "http://127.0.0.1:4318/v1/logs", protocol = "json" } }
metrics_exporter = { otlp-http = { endpoint = "http://127.0.0.1:4318/v1/metrics", protocol = "json" } }
trace_exporter = "none"
log_user_prompt = false
'@

& $node $collector storage-check --path $storageRoot | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Raiz de telemetria insegura.' }

function Ensure-StorageRoot {
    [System.IO.Directory]::CreateDirectory($storageRoot) | Out-Null
}

function Write-InstallState {
    param(
        [string]$BackupPath,
        [string]$Status,
        [string]$OriginalSha256
    )
    Ensure-StorageRoot
    $payload = [ordered]@{
        schema_version = 1
        status = $Status
        config_path = $configPath
        backup_path = $BackupPath
        original_sha256 = $OriginalSha256
        updated_at = (Get-Date).ToUniversalTime().ToString('o')
    } | ConvertTo-Json -Compress
    $temporary = "$installStatePath.$PID.tmp"
    [System.IO.File]::WriteAllText($temporary, "$payload`n", [System.Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporary -Destination $installStatePath -Force
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
            if (-not $config.EndsWith($otelBlock, [System.StringComparison]::Ordinal)) {
                throw 'A secao [otel] existente nao corresponde ao bloco gerenciado.'
            }
            $originalText = $config.Substring(0, $config.Length - $otelBlock.Length)
            $directory = Split-Path -Parent $configPath
            $fileName = Split-Path -Leaf $configPath
            $matches = @(Get-ChildItem -LiteralPath $directory -Filter "$fileName.before-financasbot-otel-*.bak" -File |
                Where-Object { (Get-Content -Raw -LiteralPath $_.FullName) -ceq $originalText })
            if ($matches.Count -ne 1) {
                throw 'Nao foi possivel identificar um unico backup original para o bloco existente.'
            }
            $backupPath = $matches[0].FullName
            $originalSha256 = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant()
            Write-InstallState -BackupPath $backupPath -Status 'installed' -OriginalSha256 $originalSha256
            Write-Output ([ordered]@{
                ok = $true
                adopted_existing = $true
                config = $configPath
                backup = $backupPath
                restart_required = $false
            } | ConvertTo-Json -Compress)
            break
        }
        $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $backupPath = "$configPath.before-financasbot-otel-$timestamp.bak"
        Copy-Item -LiteralPath $configPath -Destination $backupPath
        $originalSha256 = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant()
        [System.IO.File]::AppendAllText($configPath, $otelBlock, [System.Text.UTF8Encoding]::new($false))
        Write-InstallState -BackupPath $backupPath -Status 'installed' -OriginalSha256 $originalSha256
        Write-Output ([ordered]@{
            ok = $true
            config = $configPath
            backup = $backupPath
            restart_required = $true
        } | ConvertTo-Json -Compress)
    }
    'Uninstall' {
        if (-not (Test-Path -LiteralPath $installStatePath)) {
            throw 'Estado de instalacao ausente; nenhuma alteracao foi feita.'
        }
        $installState = Get-Content -Raw -LiteralPath $installStatePath | ConvertFrom-Json
        if ($installState.status -ne 'installed') {
            throw 'A telemetria gerenciada nao esta marcada como instalada.'
        }
        if (-not [string]::Equals(
            [System.IO.Path]::GetFullPath([string]$installState.config_path),
            [System.IO.Path]::GetFullPath($configPath),
            [System.StringComparison]::OrdinalIgnoreCase
        )) {
            throw 'O estado de instalacao pertence a outro arquivo de configuracao.'
        }
        $backupPath = [System.IO.Path]::GetFullPath([string]$installState.backup_path)
        if (-not (Test-Path -LiteralPath $backupPath)) {
            throw 'Backup original ausente; nenhuma alteracao foi feita.'
        }
        $config = Get-Content -Raw -LiteralPath $configPath
        if (-not $config.EndsWith($otelBlock, [System.StringComparison]::Ordinal)) {
            throw 'O bloco gerenciado foi alterado; rollback automatico recusado.'
        }
        $originalText = Get-Content -Raw -LiteralPath $backupPath
        $currentPrefix = $config.Substring(0, $config.Length - $otelBlock.Length)
        $backupHash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($currentPrefix -cne $originalText -or $backupHash -cne [string]$installState.original_sha256) {
            throw 'A configuracao preexistente divergiu do backup; rollback recusado.'
        }
        $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $preUninstallBackup = "$configPath.before-financasbot-otel-uninstall-$timestamp.bak"
        Copy-Item -LiteralPath $configPath -Destination $preUninstallBackup
        Copy-Item -LiteralPath $backupPath -Destination $configPath -Force
        Write-InstallState -BackupPath $backupPath -Status 'uninstalled' -OriginalSha256 $backupHash
        Write-Output ([ordered]@{
            ok = $true
            config = $configPath
            restored_from = $backupPath
            pre_uninstall_backup = $preUninstallBackup
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
        $arguments = @(
            $collector,
            'serve',
            '--host', '127.0.0.1',
            '--port', '4318',
            '--output', $eventsPath,
            '--state', $statePath,
            '--intervals', $intervalsPath,
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
        & $node $collector objective start --state $statePath --intervals $intervalsPath --objective-id $ObjectiveId --category $Category --risk $Risk --authorized-outcome-scope $AuthorizedOutcomeScope
        if ($LASTEXITCODE -ne 0) { throw 'Falha ao iniciar objetivo.' }
    }
    'ObjectiveStop' {
        & $node $collector objective stop --state $statePath --intervals $intervalsPath
        if ($LASTEXITCODE -ne 0) { throw 'Falha ao encerrar objetivo.' }
    }
    'Summary' {
        & $node $collector summary --output $eventsPath
        if ($LASTEXITCODE -ne 0) { throw 'Falha ao resumir telemetria.' }
    }
}
