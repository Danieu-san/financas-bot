param(
    [ValidateSet('Install', 'Remove', 'RunNow', 'Status')]
    [string]$Action = 'Status',
    [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [string]$TaskName = 'FinancasBot-ChatCodex-Orchestration',
    [string]$RunAsUser,
    [string]$AppThreadId,
    [string]$ChatUrl,
    [string]$AppWakeRequestPath,
    [string]$StatePath = 'docs/agent-memory/workstreams/chat-codex-channel.state.json'
)

$ErrorActionPreference = 'Stop'
$node = (Get-Command node -ErrorAction Stop).Source
$git = (Get-Command git -ErrorAction Stop).Source
$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source

if (-not $RunAsUser) {
    $RunAsUser = (Get-CimInstance Win32_ComputerSystem -ErrorAction Stop).UserName
}
if (-not $RunAsUser) { throw 'Nenhum usuario interativo foi encontrado.' }
$accountName = ($RunAsUser -split '\\')[-1]
$interactiveProfile = Get-CimInstance Win32_UserProfile -ErrorAction Stop |
    Where-Object { $_.Loaded -and (Split-Path $_.LocalPath -Leaf) -eq $accountName } |
    Select-Object -First 1
if (-not $interactiveProfile) { throw "Perfil carregado nao encontrado para $RunAsUser." }
$codexPackage = Join-Path $interactiveProfile.LocalPath 'AppData\Roaming\npm\node_modules\@openai\codex'
$codexCandidates = @(Get-ChildItem -LiteralPath $codexPackage -Recurse -Filter 'codex.exe' -File -ErrorAction Stop)
if ($codexCandidates.Count -ne 1) {
    throw "Esperado exatamente um Codex nativo para $RunAsUser; encontrados $($codexCandidates.Count)."
}
$codex = $codexCandidates[0].FullName
$runtime = Join-Path $interactiveProfile.LocalPath 'AppData\Local\FinancasBot\chat-codex-orchestration'
$lockPath = Join-Path $runtime 'watcher-state.json.lock'
$profilePath = Join-Path $interactiveProfile.LocalPath '.codex\chat-codex-orchestration.config.toml'
$profileContent = "[windows]`nsandbox = `"unelevated`"`n"
$expectedRepositoryRoot = [IO.Path]::GetFullPath((Join-Path $interactiveProfile.LocalPath `
    'AppData\Local\FinancasBot\chat-codex-orchestration-repo')).TrimEnd('\')
$watcher = Join-Path $RepositoryRoot 'scripts\agent\watchChatCodexOrchestration.js'
$repositoryValidator = Join-Path $PSScriptRoot 'validateChatCodexWatcherRepository.js'
$expectedOrigin = 'https://github.com/Danieu-san/financas-bot.git'
$branch = 'chat/chat-codex-orchestration-20260824'

function Assert-OrchestrationProfileSafe {
    if (-not (Test-Path -LiteralPath $profilePath -PathType Leaf)) { return }
    $actual = (Get-Content -LiteralPath $profilePath -Raw).Replace("`r`n", "`n")
    if ($actual -ne $profileContent) {
        throw "Perfil existente nao pertence a este instalador: $profilePath"
    }
}

function Assert-WatcherLifecycleSafe {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($task -and $task.State -eq 'Running') {
        throw "O watcher $TaskName esta em execucao; aguarde o encerramento antes de instalar ou remover."
    }

    if (-not (Test-Path -LiteralPath $lockPath -PathType Leaf)) { return }

    try {
        $lock = Get-Content -LiteralPath $lockPath -Raw | ConvertFrom-Json -ErrorAction Stop
        $lockPid = [int]$lock.pid
    } catch {
        throw "Lock malformado em $lockPath; remocao automatica recusada."
    }
    if ($lockPid -le 0) {
        throw "Lock sem PID valido em $lockPath; remocao automatica recusada."
    }
    if (Get-Process -Id $lockPid -ErrorAction SilentlyContinue) {
        throw "Lock pertence ao processo vivo $lockPid; remocao automatica recusada."
    }
    Remove-Item -LiteralPath $lockPath -Force
}

function Quote-Argument([string]$Value) {
    if ($Value.Contains('"')) { throw 'Argumento contem aspas nao suportadas.' }
    return '"' + $Value + '"'
}

$arguments = @(
    (Quote-Argument $watcher),
    '--repo', (Quote-Argument $RepositoryRoot),
    '--branch', (Quote-Argument $branch),
    '--codex', (Quote-Argument $codex),
    '--git', (Quote-Argument $git),
    '--powershell', (Quote-Argument $powershell),
    '--runtime', (Quote-Argument $runtime),
    '--state-path', (Quote-Argument $StatePath)
)
if ($StatePath -notmatch '^[A-Za-z0-9._/-]+$' -or
    $StatePath.Contains('..') -or [System.IO.Path]::IsPathRooted($StatePath)) {
    throw 'StatePath deve ser um caminho relativo seguro.'
}

function Assert-WatcherRepositorySafe {
    if (-not (Test-Path -LiteralPath $repositoryValidator -PathType Leaf)) {
        throw "Validador do clone dedicado ausente: $repositoryValidator"
    }
    $validationOutput = & $node $repositoryValidator `
        '--repo' $RepositoryRoot `
        '--expected-repo' $expectedRepositoryRoot `
        '--runtime' $runtime `
        '--git' $git `
        '--branch' $branch `
        '--expected-origin' $expectedOrigin 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Clone dedicado recusado: $($validationOutput -join ' ')"
    }
}
if ($AppThreadId -and -not $ChatUrl) {
    throw 'AppThreadId exige ChatUrl.'
}
if ($ChatUrl -and -not $AppThreadId) {
    throw 'ChatUrl exige AppThreadId.'
}
if ($AppWakeRequestPath -and $AppThreadId) {
    throw 'AppWakeRequestPath e exclusivo de AppThreadId.'
}
if ($ChatUrl) {
    $parsedChatUrl = $null
    if (-not [Uri]::TryCreate($ChatUrl, [UriKind]::Absolute, [ref]$parsedChatUrl) -or
        $parsedChatUrl.Scheme -ne 'https' -or
        $parsedChatUrl.Host -ne 'chatgpt.com' -or
        $parsedChatUrl.Query -or
        $parsedChatUrl.Fragment -or
        $parsedChatUrl.AbsolutePath -notmatch '^/(?:g/[^/]+/)?c/[0-9a-fA-F-]+/?$') {
        throw 'ChatUrl deve apontar para uma conversa HTTPS do chatgpt.com.'
    }
    $arguments += @('--chat-url', (Quote-Argument $ChatUrl))
}
if ($AppThreadId) {
    if ($AppThreadId -notmatch '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') {
        throw 'AppThreadId invalido.'
    }
    $arguments += @('--app-thread-id', (Quote-Argument $AppThreadId))
}
if ($AppWakeRequestPath) {
    if (-not [System.IO.Path]::IsPathRooted($AppWakeRequestPath)) {
        throw 'AppWakeRequestPath deve ser absoluto.'
    }
    $requestParent = Split-Path -Parent $AppWakeRequestPath
    if (-not (Test-Path -LiteralPath $requestParent -PathType Container)) {
        throw 'Diretorio de AppWakeRequestPath nao existe.'
    }
    $arguments += @('--app-wake-request', (Quote-Argument $AppWakeRequestPath))
}
$arguments = $arguments -join ' '

switch ($Action) {
    'Install' {
        Assert-WatcherLifecycleSafe
        Assert-OrchestrationProfileSafe
        Assert-WatcherRepositorySafe
        $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
        [System.IO.File]::WriteAllText($profilePath, $profileContent, $utf8NoBom)
        $taskAction = New-ScheduledTaskAction -Execute $node -Argument $arguments
        $triggerParameters = @{
            Once = $true
            At = (Get-Date).AddMinutes(1)
            RepetitionInterval = (New-TimeSpan -Minutes 1)
            RepetitionDuration = (New-TimeSpan -Days 3650)
        }
        $trigger = New-ScheduledTaskTrigger @triggerParameters
        $settingsParameters = @{
            MultipleInstances = 'IgnoreNew'
            ExecutionTimeLimit = (New-TimeSpan -Minutes 35)
            StartWhenAvailable = $true
            AllowStartIfOnBatteries = $true
            DontStopIfGoingOnBatteries = $true
        }
        $settings = New-ScheduledTaskSettingsSet @settingsParameters
        $principalParameters = @{
            UserId = $RunAsUser
            LogonType = 'Interactive'
            RunLevel = 'Limited'
        }
        $principal = New-ScheduledTaskPrincipal @principalParameters
        $registerParameters = @{
            TaskName = $TaskName
            Action = $taskAction
            Trigger = $trigger
            Settings = $settings
            Principal = $principal
            Force = $true
        }
        Register-ScheduledTask @registerParameters | Out-Null
        Write-Output "INSTALLED $TaskName"
    }
    'Remove' {
        Assert-WatcherLifecycleSafe
        Assert-OrchestrationProfileSafe
        if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
            Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        }
        if (Test-Path -LiteralPath $profilePath -PathType Leaf) {
            Remove-Item -LiteralPath $profilePath -Force
        }
        Write-Output "REMOVED $TaskName"
    }
    'RunNow' {
        Start-ScheduledTask -TaskName $TaskName
        Write-Output "STARTED $TaskName"
    }
    'Status' {
        $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        if (-not $task) { Write-Output 'NOT_INSTALLED'; exit 0 }
        $info = Get-ScheduledTaskInfo -TaskName $TaskName
        [pscustomobject]@{
            TaskName = $TaskName
            State = $task.State
            LastRunTime = $info.LastRunTime
            LastTaskResult = $info.LastTaskResult
            NextRunTime = $info.NextRunTime
        } | ConvertTo-Json -Compress
    }
}
