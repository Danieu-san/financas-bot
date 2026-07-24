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

function Get-OptionalProperty {
    param(
        $InputObject,
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    if ($null -eq $InputObject) {
        return $null
    }
    $property = $InputObject.PSObject.Properties[$Name]
    if ($null -eq $property) {
        return $null
    }
    return $property.Value
}

$resolvedRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
if (-not (Test-Path -LiteralPath (Join-Path $resolvedRoot '.git'))) {
    throw "Raiz Git inválida: $resolvedRoot"
}

$gitCommonDir = (
    Invoke-Captured -Executable $GitBin -Arguments @(
        '-C', $resolvedRoot, 'rev-parse', '--path-format=absolute', '--git-common-dir'
    )
) -join ''
$gitCommonDir = (Resolve-Path -LiteralPath $gitCommonDir).Path
$canonicalRepoRoot = Split-Path -Parent $gitCommonDir
$financasBotRoot = Split-Path -Parent $canonicalRepoRoot
$portableRoot = Join-Path $financasBotRoot 'Trabalho Codex no outro PC'
if (-not $ReportPath) {
    $ReportPath = Join-Path $portableRoot 'last-resume-check.json'
}

$startHere = Join-Path $canonicalRepoRoot 'docs\agent-memory\START-HERE.md'
if (-not (Test-Path -LiteralPath $startHere -PathType Leaf)) {
    throw "Documento de entrada ausente: $startHere"
}

$branch = (Invoke-Captured -Executable $GitBin -Arguments @(
    '-C', $resolvedRoot, 'branch', '--show-current'
)) -join ''
$head = (Invoke-Captured -Executable $GitBin -Arguments @(
    '-C', $resolvedRoot, 'rev-parse', 'HEAD'
)) -join ''
$status = @(Invoke-Captured -Executable $GitBin -Arguments @(
    '-C', $resolvedRoot, 'status', '--porcelain=v1', '--branch'
))

$lastHandoffPath = Join-Path $portableRoot 'last-safe-handoff.json'
$lastHandoff = $null
if (Test-Path -LiteralPath $lastHandoffPath -PathType Leaf) {
    $lastHandoff = Get-Content -Raw -LiteralPath $lastHandoffPath | ConvertFrom-Json
}

$handoffResumeTarget = Get-OptionalProperty -InputObject $lastHandoff -Name 'resume_target'
$handoffTargetBranch = Get-OptionalProperty -InputObject $handoffResumeTarget -Name 'branch'
$handoffTargetHead = Get-OptionalProperty -InputObject $handoffResumeTarget -Name 'head'
$handoffLegacyBranch = Get-OptionalProperty -InputObject $lastHandoff -Name 'branch'
$handoffLegacyHead = Get-OptionalProperty -InputObject $lastHandoff -Name 'head'
$handoffSchema = Get-OptionalProperty -InputObject $lastHandoff -Name 'schema'

$targetBranch = if ($handoffTargetBranch) {
    [string]$handoffTargetBranch
} elseif ($handoffLegacyBranch) {
    [string]$handoffLegacyBranch
} else {
    $branch
}
$targetHead = if ($handoffTargetHead) {
    [string]$handoffTargetHead
} elseif ($handoffLegacyHead) {
    [string]$handoffLegacyHead
} else {
    $head
}

$targetCommitAvailable = $false
try {
    Invoke-Captured -Executable $GitBin -Arguments @(
        '-C', $canonicalRepoRoot, 'cat-file', '-e', "$targetHead`^{commit}"
    ) | Out-Null
    $targetCommitAvailable = $true
} catch {
    $targetCommitAvailable = $false
}

$targetMatchesCurrent = (
    $targetCommitAvailable -and
    $branch -eq $targetBranch -and
    $head -eq $targetHead
)
$targetLocalBranchAvailable = $false
if ($targetBranch) {
    try {
        Invoke-Captured -Executable $GitBin -Arguments @(
            '-C', $canonicalRepoRoot, 'show-ref', '--verify',
            "refs/heads/$targetBranch"
        ) | Out-Null
        $targetLocalBranchAvailable = $true
    } catch {
        $targetLocalBranchAvailable = $false
    }
}

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
    schema = 'financasbot-portable-resume-v2'
    generated_at_utc = (Get-Date).ToUniversalTime().ToString('o')
    repo_root = $resolvedRoot
    worktree_root = $resolvedRoot
    canonical_repo_root = $canonicalRepoRoot
    git_common_dir = $gitCommonDir
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
    last_handoff = [ordered]@{
        path = $lastHandoffPath
        found = $null -ne $lastHandoff
        schema = if ($handoffSchema) { [string]$handoffSchema } else { $null }
    }
    resume_target = [ordered]@{
        branch = $targetBranch
        head = $targetHead
        commit_available = $targetCommitAvailable
        local_branch_available = $targetLocalBranchAvailable
        matches_current_worktree = $targetMatchesCurrent
        current_document = "$targetHead`:docs/agent-memory/current.md"
        gate_document = "$targetHead`:docs/plans/current-gate.md"
    }
    next_instruction = if (-not $targetCommitAvailable) {
        'Não ler current.md da worktree atual; obter do GitHub o hash do último handoff antes de retomar.'
    } elseif (-not $targetMatchesCurrent) {
        'Não ler current.md da worktree atual; materializar worktree isolada no alvo do último handoff e então ler os documentos daquele hash.'
    } else {
        'Ler current.md e current-gate.md desta worktree; retomar a próxima ação exata sem ampliar escopo.'
    }
}

$reportDirectory = Split-Path -Parent $ReportPath
New-Item -ItemType Directory -Force -Path $reportDirectory | Out-Null
$temporary = "$ReportPath.tmp-$PID"
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temporary -Encoding UTF8
Move-Item -LiteralPath $temporary -Destination $ReportPath -Force

Write-Output "Retomada portátil validada: $branch $head"
Write-Output "Leia primeiro: $startHere"
Write-Output "Alvo do último handoff: $targetBranch $targetHead"
Write-Output "Alvo coincide com a worktree atual: $targetMatchesCurrent"
foreach ($reference in $keyReferences) {
    Write-Output "Referência $($reference.role): $($reference.path) (existe=$($reference.exists))"
}
Write-Output "Relatório: $ReportPath"
Write-Output 'Nenhuma chave, autenticação, sessão ou conversa privada foi lida ou copiada.'
