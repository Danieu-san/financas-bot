param(
    [ValidateSet('Install', 'Remove', 'RunNow', 'Status')]
    [string]$Action = 'Status',
    [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [string]$Branch = 'chat/chat-codex-orchestration-20260824',
    [string]$TaskName = 'FinancasBot-ChatCodex-Orchestration'
)

$ErrorActionPreference = 'Stop'
$watcher = Join-Path $PSScriptRoot 'watchChatCodexOrchestration.js'
$node = (Get-Command node -ErrorAction Stop).Source
$codex = (Get-Command codex.ps1 -ErrorAction Stop).Source
$runtime = Join-Path $env:LOCALAPPDATA 'FinancasBot\chat-codex-orchestration'

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
        }
        $settings = New-ScheduledTaskSettingsSet @settingsParameters
        $principalParameters = @{
            UserId = $env:USERNAME
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
