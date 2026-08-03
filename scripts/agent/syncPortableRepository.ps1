[CmdletBinding()]
param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [Parameter(Mandatory = $true)]
    [string]$PortableFinancasBotRoot,
    [string]$GitBin = 'git',
    [string]$NodeBin = 'node'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Captured {
    param(
        [Parameter(Mandatory = $true)][string]$Executable,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $Executable @Arguments 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($exitCode -ne 0) {
        throw "$Executable $($Arguments -join ' ') falhou: $($output -join [Environment]::NewLine)"
    }
    return @($output)
}

$sourceRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$portableRoot = (Resolve-Path -LiteralPath $PortableFinancasBotRoot).Path
if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot '.git'))) {
    throw "Raiz Git inválida: $sourceRoot"
}

$branch = (Invoke-Captured -Executable $GitBin -Arguments @(
    '-C', $sourceRoot, 'branch', '--show-current'
)) -join ''
if (-not $branch) {
    throw 'Handoff portátil exige uma branch nomeada.'
}
$head = (Invoke-Captured -Executable $GitBin -Arguments @(
    '-C', $sourceRoot, 'rev-parse', 'HEAD'
)) -join ''
$porcelain = @(Invoke-Captured -Executable $GitBin -Arguments @(
    '-C', $sourceRoot, 'status', '--porcelain=v1'
))
if ($porcelain.Count -gt 0 -and ($porcelain -join '').Trim()) {
    throw 'A raiz canônica possui mudanças não commitadas; registre o checkpoint antes de sincronizar o SSD.'
}

Invoke-Captured -Executable $GitBin -Arguments @(
    '-C', $sourceRoot, 'fetch', '--prune', 'origin', $branch
) | Out-Null
$remoteHead = (Invoke-Captured -Executable $GitBin -Arguments @(
    '-C', $sourceRoot, 'rev-parse', "origin/$branch"
)) -join ''
if ($remoteHead -ne $head) {
    throw "HEAD local $head ainda não coincide com origin/$branch ($remoteHead). Publique antes do handoff."
}

$shortHead = $head.Substring(0, 12)
$destination = Join-Path $portableRoot "financas-bot-handoff-$shortHead"
if (Test-Path -LiteralPath $destination) {
    $existingHead = (Invoke-Captured -Executable $GitBin -Arguments @(
        '-c', "safe.directory=$($destination -replace '\\','/')",
        '-C', $destination, 'rev-parse', 'HEAD'
    )) -join ''
    $existingStatus = Invoke-Captured -Executable $GitBin -Arguments @(
        '-c', "safe.directory=$($destination -replace '\\','/')",
        '-C', $destination, 'status', '--porcelain=v1'
    )
    if ($existingHead -ne $head -or (($existingStatus -join '').Trim())) {
        throw "Destino existente não corresponde ao handoff e foi preservado: $destination"
    }
} else {
    $temporary = "$destination.tmp-$PID"
    Invoke-Captured -Executable $GitBin -Arguments @(
        'clone', '--single-branch', '--branch', $branch,
        'https://github.com/Danieu-san/financas-bot.git', $temporary
    ) | Out-Null
    $clonedHead = (Invoke-Captured -Executable $GitBin -Arguments @(
        '-C', $temporary, 'rev-parse', 'HEAD'
    )) -join ''
    if ($clonedHead -ne $head) {
        throw "Clone portátil ficou em $clonedHead, esperado $head. O diretório temporário foi preservado para diagnóstico."
    }
    Move-Item -LiteralPath $temporary -Destination $destination
}

Invoke-Captured -Executable $NodeBin -Arguments @(
    (Join-Path $destination 'scripts\agent\validateAgentWorkflow.js')
) | Out-Null

$handoffRoot = Join-Path $portableRoot 'Trabalho Codex no outro PC'
New-Item -ItemType Directory -Force -Path $handoffRoot | Out-Null
$reportPath = Join-Path $handoffRoot 'last-safe-handoff.json'
& (Join-Path $destination 'scripts\agent\preparePortableHandoff.ps1') `
    -RepoRoot $destination -GitBin $GitBin -NodeBin $NodeBin `
    -ReportPath $reportPath | Out-Null

$pointerPath = Join-Path $handoffRoot 'OPEN-THIS.json'
$pointer = [ordered]@{
    schema = 'financasbot-portable-pointer-v1'
    generated_at_utc = (Get-Date).ToUniversalTime().ToString('o')
    repo_root = $destination
    branch = $branch
    head = $head
    start_here = Join-Path $destination 'docs\agent-memory\START-HERE.md'
    resume_command = "powershell -ExecutionPolicy Bypass -File `"$destination\scripts\agent\resumePortableWork.ps1`" -RepoRoot `"$destination`""
}
$temporaryPointer = "$pointerPath.tmp-$PID"
$pointer | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $temporaryPointer -Encoding UTF8
Move-Item -LiteralPath $temporaryPointer -Destination $pointerPath -Force

Write-Output "Repositório portátil validado: $destination"
Write-Output "Branch/HEAD: $branch $head"
Write-Output "Abra primeiro: $pointerPath"
Write-Output 'A pasta antiga do SSD e seus arquivos não foram alterados.'
