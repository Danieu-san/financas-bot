[CmdletBinding()]
param([string]$ScriptPath = (Join-Path $PSScriptRoot 'notificar_chatgpt.ps1'))
$ErrorActionPreference = 'Stop'
$tokens = $null; $parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($ScriptPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw "Syntax errors: $($parseErrors.Count)" }
# Load only selected functions. Never run configuration, Chrome or the entrypoint.
foreach ($name in @('ConvertTo-ChatMessageText', 'Get-ComposerTextReader', 'Send-ChatMessage')) {
    $definition = $ast.Find({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name }, $true)
    if (-not $definition) { throw "Missing function: $name" }
    . ([scriptblock]::Create($definition.Extent.Text))
}
function Assert-Equal($Actual, $Expected, $Label) {
    if ($Actual -cne $Expected) { throw "FAIL: $Label" }
}
# Causal reproduction of the old asymmetric comparison.
$windows = "primeira`r`n`r`nsegunda"
$dom = "primeira`n`nsegunda"
Assert-Equal ($windows -ceq $dom) $false 'old CRLF comparison must fail'
Assert-Equal (ConvertTo-ChatMessageText $windows) $dom 'CRLF normalized'
Assert-Equal (ConvertTo-ChatMessageText "primeira`rsegunda") "primeira`nsegunda" 'CR normalized'
Assert-Equal (ConvertTo-ChatMessageText "  ação`n  código  interno`n ") "ação`n  código  interno" 'internal whitespace preserved'
Assert-Equal ((ConvertTo-ChatMessageText 'SHA: abc') -ceq (ConvertTo-ChatMessageText 'SHA: abd')) $false 'changed content rejected'
Assert-Equal ((ConvertTo-ChatMessageText "a`n`nb") -ceq (ConvertTo-ChatMessageText "a`nb")) $false 'missing blank line rejected'

$reader = Get-ComposerTextReader
$js = "const read = $reader;" + @'
const assert = require('node:assert/strict');
const text = value => ({nodeType:3,textContent:value});
const el = (tag, children=[], trailing=false) => ({nodeType:1,tagName:tag,nodeName:tag,childNodes:children,firstChild:children[0],classList:{contains: x => trailing && x==='ProseMirror-trailingBreak'}});
const root = children => ({childNodes:children});
assert.equal(read(root([el('P',[text('a')]),el('P',[text('b')])])), 'a\nb');
assert.equal(read(root([el('P',[text('a')]),el('P',[el('BR')]),el('P',[text('b')])])), 'a\n\nb');
assert.equal(read(root([el('P',[text('a'),el('BR'),text('b')])])), 'a\nb');
assert.equal(read(root([el('P',[text('a'),el('BR',[],true)])])), 'a');
assert.equal(read(root([el('P',[text('SHA '),el('A',[text('abc')])])])), 'SHA abc');
assert.equal(read(root([text('ação\n  código')])), 'ação\n  código');
assert.throws(() => read(root([el('DIV',[text('unknown')])])));
assert.throws(() => read(root([el('P',[el('IMG')])])));
assert.notEqual(read(root([el('P',[text('a')]),el('P',[text('b')])])), 'a\n\nb');
console.log('PASS: 9 structural editor assertions');
'@
& node -e $js
if ($LASTEXITCODE -ne 0) { throw 'Editor structure regression failed' }

$script:duplicate = $false
$script:permanentMismatch = $false
$script:reads = 0
$script:inserts = 0
$script:ticks = 0
$script:inserted = $null
function Get-Date { $script:ticks++; return [datetime]'2026-01-01' + [timespan]::FromSeconds($script:ticks * 2) }
function Start-Sleep { param($Milliseconds) }
function Invoke-CdpCommand {
    param($Socket, $Method, $Params)
    if ($Method -ne 'Input.insertText') { throw "Unexpected CDP: $Method" }
    $script:inserts++; $script:inserted = $Params.text
}
function Invoke-JavaScript {
    param($Socket, $Expression)
    if ($Expression.Contains('.some(node')) { return $script:duplicate }
    if ($Expression.Contains("document.execCommand('delete'")) { return 1 }
    if ($Expression.Contains('const text =')) {
        $script:reads++
        return (-not $script:permanentMismatch -and $script:reads -ge 3)
    }
    throw 'Unexpected expression: no real browser or send is allowed in this test.'
}
$socket = [System.Net.WebSockets.ClientWebSocket]::new()
try {
    Send-ChatMessage -Socket $socket -Text $windows -PreviewOnly
    Assert-Equal $script:inserted $dom 'insert canonical text'
    Assert-Equal $script:inserts 1 'no repeated insert while waiting'
    Assert-Equal $script:reads 3 'wait for asynchronous editor'
    $script:duplicate = $true
    $blocked = $false
    try { Send-ChatMessage -Socket $socket -Text $windows -PreviewOnly } catch { $blocked = $_.Exception.Message -like '*identica*' }
    Assert-Equal $blocked $true 'duplicate rejected'
    Assert-Equal $script:inserts 1 'duplicate not inserted'
    $script:duplicate = $false; $script:permanentMismatch = $true; $script:reads = 0
    $blocked = $false
    try { Send-ChatMessage -Socket $socket -Text $windows -PreviewOnly } catch { $blocked = $_.Exception.Message -like 'COMPOSER_MISMATCH:*' }
    Assert-Equal $blocked $true 'persistent mismatch fails before send'
    $before = $script:inserts
    $blocked = $false
    try { Send-ChatMessage -Socket $socket -Text " `r`n " -PreviewOnly } catch { $blocked = $_.Exception.Message -like '*vazia*' }
    Assert-Equal $blocked $true 'empty message rejected'
    Assert-Equal $script:inserts $before 'empty message not inserted'
} finally { $socket.Dispose() }
Write-Output 'PASS: syntax; old RED reproduced; normalization; content preservation; delayed editor; duplicate guard; mismatch before send; empty input. No browser or network used.'
