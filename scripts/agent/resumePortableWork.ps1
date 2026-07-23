[CmdletBinding()]
param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [string]$GitBin = 'git',
    [string]$NodeBin = 'node',
    [string]$ReportPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Captured {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Executable,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
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

$resolvedRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
if (-not (Test-Path -LiteralPath (Join-Path $resolvedRoot '.git'))) {
    throw "Raiz Git inválida: $resolvedRoot"
}

$financasBotRoot = Split-Path -Parent $resolvedRoot
$portableRoot = Join-Path $financasBotRoot 'Trabalho Codex no outro PC'
if (-not $ReportPath) {
    $ReportPath = Join-Path $portableRoot 'last-resume-check.json'
}

$startHere = Join-Path $resolvedRoot 'docs\agent-memory\START-HERE.md'
if (-not (Test-Path -LiteralPath $startHere -PathType Leaf)) {
    throw "Documento de entrada ausente: $startHere"
}

$branch = (Invoke-Captured -Executable $GitBin -Arguments @(
    '-C', $resolvedRoot, 'branch', '--show-current'
)) -join ''
$head = (Invoke-Captured -Executable $GitBin -Arguments @(
    '-C', $resolvedRoot, 'rev-parse', 'HEAD'
)) -join ''
$status = Invoke-Captured -Executable $GitBin -Arguments @(
    '-C', $resolvedRoot, 'status', '--porcelain=v1', '--branch'
)

$previousGitBin = $env:GIT_BIN
try {
    $env:GIT_BIN = $GitBin
    Invoke-Captured -Executable $NodeBin -Arguments @(
        (Join-Path $resolvedRoot 'scripts\agent\validateAgentWorkflow.js')
    ) | Out-Null
} finally {
    $env:GIT_BIN = $previousGitBin
}

$keyReferences = @(
    [ordered]@{
        role = 'oracle_production'
        path = Join-Path $financasBotRoot 'financas_bot_oci_ed25519_20260722'
    },
    [ordered]@{
        role = 'aws_rollback'
        path = Join-Path $financasBotRoot 'financasBot.pem'
    }
)
foreach ($reference in $keyReferences) {
    $reference['exists'] = Test-Path -LiteralPath $reference.path -PathType Leaf
    $reference['content_read'] = $false
}

$report = [ordered]@{
    schema = 'financasbot-portable-resume-v1'
    generated_at_utc = (Get-Date).ToUniversalTime().ToString('o')
    repo_root = $resolvedRoot
    branch = $branch
    head = $head
    status = @($status)
    workflow_validation = 'green'
    start_here = $startHere
    read_order = @(
        'AGENTS.md',
        'docs/agent-memory/START-HERE.md',
        'docs/agent-memory/README.md',
        'docs/agent-memory/current.md',
        'docs/plans/current-gate.md'
    )
    key_references = $keyReferences
    next_instruction = 'Ler current.md e current-gate.md; retomar a próxima ação exata sem ampliar escopo.'
}

$reportDirectory = Split-Path -Parent $ReportPath
New-Item -ItemType Directory -Force -Path $reportDirectory | Out-Null
$temporary = "$ReportPath.tmp-$PID"
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temporary -Encoding UTF8
Move-Item -LiteralPath $temporary -Destination $ReportPath -Force

Write-Output "Retomada portátil validada: $branch $head"
Write-Output "Leia primeiro: $startHere"
foreach ($reference in $keyReferences) {
    Write-Output "Referência $($reference.role): $($reference.path) (existe=$($reference.exists))"
}
Write-Output "Relatório: $ReportPath"
Write-Output 'Nenhuma chave, autenticação, sessão ou conversa privada foi lida ou copiada.'
