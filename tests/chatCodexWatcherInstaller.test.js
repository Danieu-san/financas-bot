'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('instalador recusa apagar lock sem provar PID morto', () => {
    const installer = fs.readFileSync(path.join(
        __dirname, '..', 'scripts', 'agent', 'Install-ChatCodexOrchestrationWatcher.ps1'
    ), 'utf8');
    assert.doesNotMatch(installer, /Get-Command powershell\.exe|codex\.exe|codex\.ps1/);
    assert.match(installer, /if \(\$task -and \$task\.State -eq 'Running'\)/);
    assert.match(installer, /ConvertFrom-Json -ErrorAction Stop/);
    assert.match(installer, /Get-Process -Id \$lockPid -ErrorAction SilentlyContinue/);
    assert.match(installer, /Lock pertence ao processo vivo/);
    assert.match(installer, /Lock malformado/);
    assert.equal((installer.match(/Remove-Item -LiteralPath \$lockPath -Force/g) || []).length, 1);
    assert.match(installer, /Assert-WatcherLifecycleSafe[\s\S]*?'Install' \{\s*Assert-WatcherLifecycleSafe/);
    assert.match(installer, /'Remove' \{\s*Assert-WatcherLifecycleSafe/);
    assert.doesNotMatch(installer, /AppThreadId|ChatUrl|--app-thread-id|--chat-url/);
    assert.match(installer, /A instalacao exige AppWakeRequestPath/);
    assert.match(installer, /'--app-wake-request'/);
    assert.match(installer, /\$statePath = 'docs\/agent-memory\/workstreams\/chat-codex-channel\.state\.json'/);
    assert.match(installer, /'--state-path', \(Quote-Argument \$statePath\)/);
    assert.doesNotMatch(installer, /\[string\]\$StatePath/);
    assert.match(installer, /Assert-WatcherRepositorySafe/);
    assert.match(installer, /Clone dedicado recusado/);
    assert.match(installer, /validateChatCodexWatcherRepository\.js/);
    assert.match(installer, /'--git' \$git/);
    assert.match(installer, /--expected-origin/);
    assert.match(installer, /\$branch = 'chat\/chat-codex-orchestration-20260824'/);
    assert.doesNotMatch(installer, /\[string\]\$Branch/);
    assert.doesNotMatch(installer, /chatgpt\.com\/c\/[0-9a-f-]{16,}/i);
});
