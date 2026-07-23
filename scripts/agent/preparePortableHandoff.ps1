[CmdletBinding()]
param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [string]$GitBin = 'git',
    [string]$NodeBin = 'node',
    [string]$ReportPath,
    [switch]$PostClose
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

function Get-CodexStoreMetadata {
    $stores = @()
    foreach ($drive in Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue) {
        $usersRoot = Join-Path $drive.Root 'Users'
        try {
            $usersRootExists = Test-Path -LiteralPath $usersRoot -PathType Container
        } catch [System.UnauthorizedAccessException] {
            continue
        }
        if (-not $usersRootExists) {
            continue
        }
        foreach ($profile in Get-ChildItem -LiteralPath $usersRoot -Directory -ErrorAction SilentlyContinue) {
            $codexRoot = Join-Path $profile.FullName '.codex'
            if (-not (Test-Path -LiteralPath $codexRoot -PathType Container)) {
                continue
            }

            $knownStores = @(
                'session_index.jsonl',
                'state_5.sqlite',
                'logs_2.sqlite',
                'goals_1.sqlite',
                'memories_1.sqlite',
                'sqlite\codex-dev.db'
            )
            $present = foreach ($relative in $knownStores) {
                $candidate = Join-Path $codexRoot $relative
                if (Test-Path -LiteralPath $candidate -PathType Leaf) {
                    $item = Get-Item -LiteralPath $candidate
                    [ordered]@{
                        name = $relative
                        length = $item.Length
                        last_write_utc = $item.LastWriteTimeUtc.ToString('o')
                    }
                }
            }

            $stores += [ordered]@{
                codex_root = $codexRoot
                stores = @($present)
                content_read = $false
                content_copied = $false
            }
        }
    }
    return $stores
}

$resolvedRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
if (-not (Test-Path -LiteralPath (Join-Path $resolvedRoot '.git'))) {
    throw "Raiz Git inválida: $resolvedRoot"
}

if (-not $ReportPath) {
    $workspaceParent = Split-Path -Parent $resolvedRoot
    $portableRoot = Join-Path $workspaceParent 'Trabalho Codex no outro PC'
    $ReportPath = Join-Path $portableRoot 'last-safe-handoff.json'
}

$branch = (Invoke-Captured -Executable $GitBin -Arguments @('-C', $resolvedRoot, 'branch', '--show-current')) -join ''
$head = (Invoke-Captured -Executable $GitBin -Arguments @('-C', $resolvedRoot, 'rev-parse', 'HEAD')) -join ''
$status = Invoke-Captured -Executable $GitBin -Arguments @('-C', $resolvedRoot, 'status', '--porcelain=v1', '--branch')

$previousGitBin = $env:GIT_BIN
try {
    $env:GIT_BIN = $GitBin
    Invoke-Captured -Executable $NodeBin -Arguments @(
        (Join-Path $resolvedRoot 'scripts\agent\validateAgentWorkflow.js')
    ) | Out-Null
} finally {
    $env:GIT_BIN = $previousGitBin
}
Invoke-Captured -Executable $GitBin -Arguments @('-C', $resolvedRoot, 'diff', '--check') | Out-Null

$inventory = Get-CodexStoreMetadata
$report = [ordered]@{
    schema = 'financasbot-safe-handoff-v1'
    generated_at_utc = (Get-Date).ToUniversalTime().ToString('o')
    phase = if ($PostClose) { 'post_close' } else { 'pre_close' }
    repo_root = $resolvedRoot
    branch = $branch
    head = $head
    status = @($status)
    workflow_validation = 'green'
    diff_check = 'green'
    codex_store_inventory = @($inventory)
    copied_from_codex = @()
    deliberately_excluded = @(
        '.codex contents',
        'authentication',
        'cookies',
        'sessions',
        'tokens',
        'SSH material',
        'private conversation history'
    )
    resume_prompt = 'Use $execute-financasbot-gate e retome o objetivo ativo.'
}

$reportDirectory = Split-Path -Parent $ReportPath
New-Item -ItemType Directory -Force -Path $reportDirectory | Out-Null
$temporary = "$ReportPath.tmp-$PID"
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temporary -Encoding UTF8
Move-Item -LiteralPath $temporary -Destination $ReportPath -Force

Write-Output "Handoff seguro validado: $branch $head"
Write-Output "Relatório: $ReportPath"
Write-Output 'Nenhum conteúdo privado do Codex foi lido ou copiado.'
