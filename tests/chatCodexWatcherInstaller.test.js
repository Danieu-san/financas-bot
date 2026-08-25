'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('instalador recusa apagar lock sem provar PID morto', () => {
    const installer = fs.readFileSync(path.join(
        __dirname, '..', 'scripts', 'agent', 'Install-ChatCodexOrchestrationWatcher.ps1'
    ), 'utf8');
    assert.match(installer, /Get-Command powershell\.exe -ErrorAction Stop/);
    assert.match(installer, /Get-ChildItem[\s\S]*?-Filter 'codex\.exe'/);
    assert.doesNotMatch(installer, /AppData\\Roaming\\npm\\codex\.ps1/);
    assert.match(installer, /if \(\$task -and \$task\.State -eq 'Running'\)/);
    assert.match(installer, /ConvertFrom-Json -ErrorAction Stop/);
    assert.match(installer, /Get-Process -Id \$lockPid -ErrorAction SilentlyContinue/);
    assert.match(installer, /Lock pertence ao processo vivo/);
    assert.match(installer, /Lock malformado/);
    assert.equal((installer.match(/Remove-Item -LiteralPath \$lockPath -Force/g) || []).length, 1);
    assert.match(installer, /Assert-WatcherLifecycleSafe[\s\S]*?'Install' \{\s*Assert-WatcherLifecycleSafe/);
    assert.match(installer, /'Remove' \{\s*Assert-WatcherLifecycleSafe/);
    assert.match(installer, /AppThreadId e ChatUrl devem ser informados juntos/);
    assert.match(installer, /AppThreadId invalido/);
    assert.match(installer, /ChatUrl deve apontar para uma conversa HTTPS do chatgpt\.com/);
    assert.match(installer, /'--app-thread-id'/);
    assert.match(installer, /'--chat-url'/);
    assert.match(installer, /AppWakeRequestPath e exclusivo/);
    assert.match(installer, /'--app-wake-request'/);
    assert.doesNotMatch(installer, /chatgpt\.com\/c\/[0-9a-f-]{16,}/i);
});
