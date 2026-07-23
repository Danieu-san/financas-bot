[CmdletBinding()]
param(
    [string]$SourceProfile = $env:USERPROFILE,
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
    [string]$GitBin = 'git',
    [string]$NodeBin = 'node',
    [int]$TimeoutMinutes = 1440,
    [string]$LogPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-ExclusiveRead {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $true
    }
    try {
        $stream = [System.IO.File]::Open(
            $Path,
            [System.IO.FileMode]::Open,
            [System.IO.FileAccess]::Read,
            [System.IO.FileShare]::None
        )
        $stream.Dispose()
        return $true
    } catch [System.IO.IOException] {
        return $false
    }
}

$workspaceParent = Split-Path -Parent $RepoRoot
$portableRoot = Join-Path $workspaceParent 'Trabalho Codex no outro PC'
if (-not $LogPath) {
    $LogPath = Join-Path $portableRoot 'last-safe-handoff-after-close.log'
}
$reportPath = Join-Path $portableRoot 'last-safe-handoff.json'
$prepareScript = Join-Path $PSScriptRoot 'preparePortableHandoff.ps1'
$deadline = (Get-Date).AddMinutes($TimeoutMinutes)
$guardFiles = @(
    (Join-Path $SourceProfile '.codex\state_5.sqlite'),
    (Join-Path $SourceProfile '.codex\logs_2.sqlite'),
    (Join-Path $SourceProfile '.codex\goals_1.sqlite'),
    (Join-Path $SourceProfile '.codex\memories_1.sqlite'),
    (Join-Path $SourceProfile '.codex\sqlite\codex-dev.db')
)

while ((Get-Date) -lt $deadline) {
    $openStores = @($guardFiles | Where-Object { -not (Test-ExclusiveRead -Path $_) })
    if ($openStores.Count -eq 0) {
        try {
            $result = & $prepareScript -RepoRoot $RepoRoot -GitBin $GitBin `
                -NodeBin $NodeBin -ReportPath $reportPath -PostClose 2>&1
            @(
                "$(Get-Date -Format o) validação segura pós-fechamento concluída."
                $result
                'Nenhum conteúdo privado do Codex foi copiado.'
            ) | Set-Content -LiteralPath $LogPath -Encoding UTF8
            exit 0
        } catch {
            "$(Get-Date -Format o) falha na validação pós-fechamento: $($_.Exception.Message)" |
                Set-Content -LiteralPath $LogPath -Encoding UTF8
            exit 1
        }
    }
    Start-Sleep -Seconds 5
}

"$(Get-Date -Format o) timeout: os stores do Codex permaneceram em uso." |
    Set-Content -LiteralPath $LogPath -Encoding UTF8
exit 2
