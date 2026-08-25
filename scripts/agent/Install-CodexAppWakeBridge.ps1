param(
    [ValidateSet('Install', 'Remove', 'RunNow', 'Status')]
    [string]$Action = 'Status',
    [string]$TaskName = 'FinancasBot-CodexApp-Wake-Bridge',
    [string]$AppUser,
    [string]$RequestWriterUser,
    [string]$AppThreadId,
    [string]$ChatUrl
)

$ErrorActionPreference = 'Stop'
$bridgeRoot = Join-Path $env:ProgramData 'FinancasBot\chat-codex-app-wake'
$binPath = Join-Path $bridgeRoot 'bin'
$inboxPath = Join-Path $bridgeRoot 'inbox'
$statePath = Join-Path $bridgeRoot 'state'
$configPath = Join-Path $bridgeRoot 'config.json'
$requestPath = Join-Path $inboxPath 'request.json'
$resultPath = Join-Path $statePath 'result.json'
$workerSource = Join-Path $PSScriptRoot 'processCodexAppWakeRequest.js'
$helperSource = Join-Path $PSScriptRoot 'wakeCodexAppViaIpc.js'
$workerInstalled = Join-Path $binPath 'processCodexAppWakeRequest.js'
$helperInstalled = Join-Path $binPath 'wakeCodexAppViaIpc.js'
$node = (Get-Command node.exe -ErrorAction Stop).Source

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Execute este instalador com privilegio administrativo.'
    }
}

function Assert-Account([string]$Account, [string]$Name) {
    if (-not $Account) { throw "$Name deve ser informado." }
    try {
        [void]([Security.Principal.NTAccount]::new($Account).Translate(
            [Security.Principal.SecurityIdentifier]))
    } catch {
        throw "$Name nao existe: $Account"
    }
}

function New-AccessRule([string]$Identity, [Security.AccessControl.FileSystemRights]$Rights) {
    return [Security.AccessControl.FileSystemAccessRule]::new(
        $Identity,
        $Rights,
        [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',
        [Security.AccessControl.PropagationFlags]::None,
        [Security.AccessControl.AccessControlType]::Allow
    )
}

function Set-BridgeAcl([string]$Path, [bool]$WriterCanModify) {
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    [void]$acl.AddAccessRule((New-AccessRule $AppUser 'FullControl'))
    [void]$acl.AddAccessRule((New-AccessRule 'NT AUTHORITY\SYSTEM' 'FullControl'))
    $writerRights = if ($WriterCanModify) { 'Modify' } else { 'ReadAndExecute' }
    [void]$acl.AddAccessRule((New-AccessRule $RequestWriterUser $writerRights))
    Set-Acl -LiteralPath $Path -AclObject $acl
}

function Assert-Inputs {
    Assert-Account $AppUser 'AppUser'
    Assert-Account $RequestWriterUser 'RequestWriterUser'
    if ($AppThreadId -notmatch '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') {
        throw 'AppThreadId invalido.'
    }
    $parsed = $null
    if (-not [Uri]::TryCreate($ChatUrl, [UriKind]::Absolute, [ref]$parsed) -or
        $parsed.Scheme -ne 'https' -or $parsed.Host -ne 'chatgpt.com' -or
        $parsed.Query -or $parsed.Fragment -or
        $parsed.AbsolutePath -notmatch '^/(?:g/[^/]+/)?c/[0-9a-fA-F-]+/?$') {
        throw 'ChatUrl deve apontar para uma conversa HTTPS do chatgpt.com.'
    }
}

function Assert-TaskIdle {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($task -and $task.State -eq 'Running') {
        throw "A ponte $TaskName esta em execucao; aguarde antes de instalar ou remover."
    }
}

function Quote-Argument([string]$Value) {
    if ($Value.Contains('"')) { throw 'Argumento contem aspas nao suportadas.' }
    return '"' + $Value + '"'
}

switch ($Action) {
    'Install' {
        Assert-Administrator
        Assert-Inputs
        Assert-TaskIdle
        foreach ($path in @($bridgeRoot, $binPath, $inboxPath, $statePath)) {
            [void](New-Item -ItemType Directory -Path $path -Force)
        }
        Copy-Item -LiteralPath $workerSource -Destination $workerInstalled -Force
        Copy-Item -LiteralPath $helperSource -Destination $helperInstalled -Force
        $config = [ordered]@{
            schema = 'financasbot-codex-app-wake-bridge-config-v2'
            thread_id = $AppThreadId
            chat_url = $ChatUrl
        } | ConvertTo-Json
        [IO.File]::WriteAllText($configPath, "$config`n", [Text.UTF8Encoding]::new($false))
        Set-BridgeAcl $bridgeRoot $false
        Set-BridgeAcl $binPath $false
        Set-BridgeAcl $inboxPath $true
        Set-BridgeAcl $statePath $false

        $arguments = @(
            (Quote-Argument $workerInstalled), '--config', (Quote-Argument $configPath),
            '--request', (Quote-Argument $requestPath), '--result', (Quote-Argument $resultPath),
            '--helper', (Quote-Argument $helperInstalled)
        ) -join ' '
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
            ExecutionTimeLimit = (New-TimeSpan -Seconds 30)
            StartWhenAvailable = $true
            AllowStartIfOnBatteries = $true
            DontStopIfGoingOnBatteries = $true
        }
        $settings = New-ScheduledTaskSettingsSet @settingsParameters
        $principal = New-ScheduledTaskPrincipal -UserId $AppUser -LogonType S4U -RunLevel Limited
        $registerParameters = @{
            TaskName = $TaskName
            Action = $taskAction
            Trigger = $trigger
            Settings = $settings
            Principal = $principal
            Force = $true
        }
        Register-ScheduledTask @registerParameters | Out-Null
        [pscustomobject]@{ Status = 'INSTALLED'; TaskName = $TaskName; RequestPath = $requestPath }
    }
    'Remove' {
        Assert-Administrator
        Assert-TaskIdle
        if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
            Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        }
        $expected = [IO.Path]::GetFullPath((Join-Path $env:ProgramData 'FinancasBot\chat-codex-app-wake')).TrimEnd('\')
        $actual = [IO.Path]::GetFullPath($bridgeRoot).TrimEnd('\')
        if ($actual -ne $expected) { throw 'Remocao recusada: raiz da ponte inesperada.' }
        if (Test-Path -LiteralPath $actual) { Remove-Item -LiteralPath $actual -Recurse -Force }
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
            RequestPath = $requestPath
        } | ConvertTo-Json -Compress
    }
}
