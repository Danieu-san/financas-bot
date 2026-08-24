param(
    [ValidateSet('Install', 'Remove', 'RunNow', 'Status')]
    [string]$Action = 'Status',
    [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [string]$Branch = 'chat/chat-codex-orchestration-20260824',
    [string]$TaskName = 'FinancasBot-ChatCodex-Orchestration',
    [string]$RunAsUser
)

$ErrorActionPreference = 'Stop'
$watcher = Join-Path $PSScriptRoot 'watchChatCodexOrchestration.js'
$node = (Get-Command node -ErrorAction Stop).Source

if (-not $RunAsUser) {
    $RunAsUser = (Get-CimInstance Win32_ComputerSystem -ErrorAction Stop).UserName
}
if (-not $RunAsUser) { throw 'Nenhum usuario interativo foi encontrado.' }
$accountName = ($RunAsUser -split '\\')[-1]
$interactiveProfile = Get-CimInstance Win32_UserProfile -ErrorAction Stop |
    Where-Object { $_.Loaded -and (Split-Path $_.LocalPath -Leaf) -eq $accountName } |
    Select-Object -First 1
if (-not $interactiveProfile) { throw "Perfil carregado nao encontrado para $RunAsUser." }
$codex = Join-Path $interactiveProfile.LocalPath 'AppData\Roaming\npm\codex.ps1'
if (-not (Test-Path -LiteralPath $codex -PathType Leaf)) {
    throw "Codex CLI nao encontrado para $RunAsUser em $codex."
}
$runtime = Join-Path $interactiveProfile.LocalPath 'AppData\Local\FinancasBot\chat-codex-orchestration'
$lockPath = Join-Path $runtime 'watcher-state.json.lock'

function Quote-Argument([string]$Value) {
    if ($Value.Contains('"')) { throw 'Argumento contem aspas nao suportadas.' }
    return '"' + $Value + '"'
}

$arguments = @(
    (Quote-Argument $watcher),
    '--repo', (Quote-Argument $RepositoryRoot),
    '--branch', (Quote-Argument $Branch),
    '--codex', (Quote-Argument $codex),
    '--runtime', (Quote-Argument $runtime)
) -join ' '

switch ($Action) {
    'Install' {
        Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
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
        if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
            Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        }
        Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
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
