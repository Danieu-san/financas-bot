[CmdletBinding()]
param(
    [string]$ConversationUrl,
    [string]$Message = "o codex finalizou, pode conferir o github",
    [int]$LoginTimeoutSeconds = 600,
    [switch]$Configure,
    [switch]$DryRun,
    [switch]$KeepOpen,
    [switch]$ValidateConfigOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:BaseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:ConfigPath = Join-Path $script:BaseDir "chatgpt_notifier.config.json"
$script:ProfileDir = Join-Path $script:BaseDir "chatgpt_profile"
$script:CdpId = 0

function Test-ConversationUrl {
    param([Parameter(Mandatory = $true)][string]$Url)

    $parsed = $null
    if (-not [Uri]::TryCreate($Url, [UriKind]::Absolute, [ref]$parsed)) {
        return $false
    }

    return (
        $parsed.Scheme -eq "https" -and
        $parsed.Host -eq "chatgpt.com" -and
        $parsed.AbsolutePath -match "/c/[^/]+"
    )
}

function Save-Configuration {
    param([Parameter(Mandatory = $true)][string]$Url)

    $config = [ordered]@{
        conversation_url = $Url
        message = $Message
    }
    $null = $config | ConvertTo-Json | Set-Content -LiteralPath $script:ConfigPath -Encoding UTF8
    Write-Host "Configuracao salva em: $script:ConfigPath"
    return
}

function Resolve-Configuration {
    if ($Configure -or -not (Test-Path -LiteralPath $script:ConfigPath)) {
        if ([string]::IsNullOrWhiteSpace($ConversationUrl)) {
            Write-Host "Abra a conversa desejada no ChatGPT e copie a URL da barra de enderecos."
            $ConversationUrl = Read-Host "Cole a URL (https://chatgpt.com/c/...)"
        }

        if (-not (Test-ConversationUrl -Url $ConversationUrl)) {
            throw "URL invalida. Use a URL privada da conversa, no formato https://chatgpt.com/c/... (nao use link /share/)."
        }

        Save-Configuration -Url $ConversationUrl
    }

    $config = Get-Content -LiteralPath $script:ConfigPath -Raw | ConvertFrom-Json
    if (-not (Test-ConversationUrl -Url ([string]$config.conversation_url))) {
        throw "A URL em $script:ConfigPath e invalida. Execute novamente com -Configure."
    }

    if ([string]::IsNullOrWhiteSpace($Message) -and $config.message) {
        $Message = [string]$config.message
    }

    return [pscustomobject]@{
        ConversationUrl = [string]$config.conversation_url
        Message = $Message
    }
}

function Get-ChromePath {
    $candidates = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    )

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return $candidate
        }
    }

    throw "Google Chrome nao encontrado. Instale o Chrome ou ajuste Get-ChromePath no script."
}

function Get-ChromeEndpoint {
    param(
        [Parameter(Mandatory = $true)][string]$ProfileDir
    )

    $portFile = Join-Path $ProfileDir "DevToolsActivePort"
    if (-not (Test-Path -LiteralPath $portFile)) {
        return $null
    }

    try {
        $lines = @(Get-Content -LiteralPath $portFile -ErrorAction Stop)
        $port = 0
        if ($lines.Count -lt 1 -or -not [int]::TryParse([string]$lines[0], [ref]$port)) {
            return $null
        }

        $version = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 2
        return [pscustomobject]@{
            Port = $port
            Version = $version
        }
    }
    catch {
        return $null
    }
}

function Wait-ChromeEndpoint {
    param(
        [Parameter(Mandatory = $true)][string]$ProfileDir,
        [int]$TimeoutSeconds = 30
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $endpoint = Get-ChromeEndpoint -ProfileDir $ProfileDir
        if ($endpoint) {
            return $endpoint
        }
        Start-Sleep -Milliseconds 400
    } while ((Get-Date) -lt $deadline)

    throw "O Chrome nao publicou DevToolsActivePort em ate $TimeoutSeconds segundos. Feche uma janela antiga do perfil chatgpt_profile e tente novamente."
}

function Get-PageTarget {
    param(
        [Parameter(Mandatory = $true)][int]$Port,
        [int]$TimeoutSeconds = 30
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $response = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/list" -TimeoutSec 2
        $targets = @($response)
        $target = $targets |
            Where-Object { $_.type -eq "page" -and $_.webSocketDebuggerUrl } |
            Where-Object { $_.url -match "chatgpt\.com|auth\.openai\.com" } |
            Select-Object -First 1

        if (-not $target) {
            $target = $targets |
                Where-Object { $_.type -eq "page" -and $_.webSocketDebuggerUrl } |
                Select-Object -First 1
        }

        if ($target) {
            return $target
        }
        Start-Sleep -Milliseconds 400
    } while ((Get-Date) -lt $deadline)

    throw "Nenhuma aba controlavel foi encontrada no Chrome."
}

function Send-WebSocketText {
    param(
        [Parameter(Mandatory = $true)][System.Net.WebSockets.ClientWebSocket]$Socket,
        [Parameter(Mandatory = $true)][string]$Text
    )

    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    $segment = [System.ArraySegment[byte]]::new($bytes)
    $null = $Socket.SendAsync(
        $segment,
        [System.Net.WebSockets.WebSocketMessageType]::Text,
        $true,
        [Threading.CancellationToken]::None
    ).GetAwaiter().GetResult()
}

function Receive-WebSocketText {
    param([Parameter(Mandatory = $true)][System.Net.WebSockets.ClientWebSocket]$Socket)

    $buffer = New-Object byte[] 65536
    $stream = [System.IO.MemoryStream]::new()
    try {
        do {
            $segment = [System.ArraySegment[byte]]::new($buffer)
            $result = $Socket.ReceiveAsync(
                $segment,
                [Threading.CancellationToken]::None
            ).GetAwaiter().GetResult()

            if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
                throw "A conexao de automacao com o Chrome foi encerrada."
            }

            $stream.Write($buffer, 0, $result.Count)
        } while (-not $result.EndOfMessage)

        return [System.Text.Encoding]::UTF8.GetString($stream.ToArray())
    }
    finally {
        $stream.Dispose()
    }
}

function Invoke-CdpCommand {
    param(
        [Parameter(Mandatory = $true)][System.Net.WebSockets.ClientWebSocket]$Socket,
        [Parameter(Mandatory = $true)][string]$Method,
        [hashtable]$Params = @{}
    )

    $script:CdpId++
    $commandId = $script:CdpId
    $payload = @{
        id = $commandId
        method = $Method
        params = $Params
    } | ConvertTo-Json -Depth 20 -Compress

    Send-WebSocketText -Socket $Socket -Text $payload

    while ($true) {
        $message = Receive-WebSocketText -Socket $Socket | ConvertFrom-Json
        if (-not ($message.PSObject.Properties.Name -contains "id") -or $message.id -ne $commandId) {
            continue
        }
        if ($message.PSObject.Properties.Name -contains "error") {
            throw "Chrome DevTools: $($message.error.message)"
        }
        return $message.result
    }
}

function Invoke-JavaScript {
    param(
        [Parameter(Mandatory = $true)][System.Net.WebSockets.ClientWebSocket]$Socket,
        [Parameter(Mandatory = $true)][string]$Expression
    )

    $result = Invoke-CdpCommand -Socket $Socket -Method "Runtime.evaluate" -Params @{
        expression = $Expression
        returnByValue = $true
        awaitPromise = $true
    }

    if ($result.PSObject.Properties.Name -contains "exceptionDetails") {
        throw "JavaScript falhou no Chrome: $($result.exceptionDetails.text)"
    }
    return $result.result.value
}

function Wait-ForComposer {
    param(
        [Parameter(Mandatory = $true)][System.Net.WebSockets.ClientWebSocket]$Socket,
        [Parameter(Mandatory = $true)][string]$TargetUrl,
        [Parameter(Mandatory = $true)][int]$TimeoutSeconds
    )

    $target = [Uri]$TargetUrl
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $loginNoticeShown = $false
    $lastNavigate = [datetime]::MinValue

    do {
        try {
            $state = Invoke-JavaScript -Socket $Socket -Expression @"
(() => {
  const composer = document.querySelector('#prompt-textarea');
  const rect = composer ? composer.getBoundingClientRect() : null;
  return {
    ready: Boolean(composer && rect && rect.width > 0 && rect.height > 0),
    href: location.href,
    host: location.hostname,
    path: location.pathname
  };
})()
"@
        }
        catch {
            # Redirecionamentos de login podem destruir o contexto JavaScript
            # entre o envio e a resposta do comando. Isso e transitorio.
            Start-Sleep -Seconds 2
            continue
        }

        if ($state.ready -and $state.path -eq $target.AbsolutePath) {
            return
        }

        if ($state.ready -and $state.host -eq "chatgpt.com" -and $state.path -ne $target.AbsolutePath) {
            if (((Get-Date) - $lastNavigate).TotalSeconds -ge 5) {
                Write-Host "Sessao autenticada. Abrindo a conversa configurada..."
                Invoke-CdpCommand -Socket $Socket -Method "Page.navigate" -Params @{ url = $TargetUrl } | Out-Null
                $lastNavigate = Get-Date
            }
        }
        elseif (-not $loginNoticeShown) {
            Write-Host "Se esta for a primeira execucao, faca login manualmente na janela do Chrome."
            Write-Host "O bot continuara sozinho quando a conversa estiver pronta."
            $loginNoticeShown = $true
        }

        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)

    throw "Tempo esgotado aguardando login e abertura da conversa ($TimeoutSeconds segundos)."
}

function ConvertTo-ChatMessageText {
    param([Parameter(Mandatory = $true)][string]$Text)
    # Contenteditable uses LF regardless of the caller's platform line endings.
    # Preserve internal whitespace and all content; normalize only line endings
    # and the outer whitespace already ignored by the DOM checks.
    return ($Text -replace "\r\n?", "`n").Trim()
}

function Get-ComposerTextReader {
    # innerText adds visual paragraph separators; textContent removes all of
    # them. Read the plain-text editor structure instead, preserving blank lines.
    return @'
(composer => {
  if (!composer) throw new Error('Composer missing');
  const inline = node => {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1) throw new Error('Unsupported editor node');
    if (node.tagName === 'BR') return node.classList.contains('ProseMirror-trailingBreak') ? '' : '\n';
    if (!['P', 'A', 'SPAN', 'STRONG', 'EM', 'CODE', 'B', 'I', 'U', 'S'].includes(node.tagName))
      throw new Error('Unsupported editor element');
    if (node.tagName === 'P' && node.childNodes.length === 1 && node.firstChild.nodeName === 'BR') return '';
    return [...node.childNodes].map(inline).join('');
  };
  const nodes = [...composer.childNodes];
  if (nodes.every(n => n.nodeType === 3)) return nodes.map(inline).join('');
  if (!nodes.every(n => n.nodeType === 1 && n.tagName === 'P')) throw new Error('Unsupported editor structure');
  return nodes.map(inline).join('\n');
})
'@
}

function Send-ChatMessage {
    param(
        [Parameter(Mandatory = $true)][System.Net.WebSockets.ClientWebSocket]$Socket,
        [Parameter(Mandatory = $true)][string]$Text,
        [switch]$PreviewOnly
    )

    $Text = ConvertTo-ChatMessageText -Text $Text
    if ([string]::IsNullOrWhiteSpace($Text)) { throw 'Mensagem vazia; envio bloqueado.' }
    $textJson = $Text | ConvertTo-Json -Compress
    $existing = Invoke-JavaScript -Socket $Socket -Expression @"
(() => [...document.querySelectorAll('[data-message-author-role="user"]')]
  .some(node => (node.innerText || node.textContent || '').trim() === $textJson))()
"@
    if ($existing) { throw 'Mensagem identica ja presente; reenvio bloqueado para evitar duplicidade.' }
    $baseline = Invoke-JavaScript -Socket $Socket -Expression @"
(() => {
  const composer = document.querySelector('#prompt-textarea');
  if (!composer) throw new Error('Campo de mensagem nao encontrado.');
  composer.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  return document.querySelectorAll('[data-message-author-role="user"]').length;
})()
"@

    Invoke-CdpCommand -Socket $Socket -Method "Input.insertText" -Params @{ text = $Text } | Out-Null

    $textJson = $Text | ConvertTo-Json -Compress
    $fillDeadline = (Get-Date).AddSeconds(10)
    $readComposer = Get-ComposerTextReader
    do {
        $filled = Invoke-JavaScript -Socket $Socket -Expression @"
(() => {
  const composer = document.querySelector('#prompt-textarea');
  const text = ($readComposer)(composer).replace(/\r\n?/g, '\n').trim();
  return text === $textJson;
})()
"@
        if ($filled) { break }
        Start-Sleep -Milliseconds 200
    } while ((Get-Date) -lt $fillDeadline)
    if (-not $filled) {
        throw "COMPOSER_MISMATCH: preenchimento nao confirmado em 10s; envio nao acionado. Rascunho preservado; nao reenviar automaticamente."
    }

    if ($PreviewOnly) {
        Write-Host "DRY RUN: mensagem preenchida, mas nao enviada."
        return
    }

    $submitted = Invoke-JavaScript -Socket $Socket -Expression @"
(() => {
  const composer = document.querySelector('#prompt-textarea');
  if (!composer) return false;

  const selectors = [
    'button[data-testid="send-button"]',
    'button[data-testid="composer-submit-button"]',
    'button[aria-label="Send prompt"]',
    'button[aria-label="Enviar prompt"]',
    'form button[type="submit"]'
  ];
  const button = selectors
    .map(selector => document.querySelector(selector))
    .find(candidate => candidate && !candidate.disabled);
  if (button) {
    button.click();
    return true;
  }

  const form = composer.closest('form');
  if (!form || typeof form.requestSubmit !== 'function') return false;
  form.requestSubmit();
  return true;
})()
"@
    if (-not $submitted) {
        throw "Controle de envio nao encontrado ou indisponivel."
    }

    $deadline = (Get-Date).AddSeconds(30)
    do {
        $confirmed = Invoke-JavaScript -Socket $Socket -Expression @"
(() => {
  const nodes = [...document.querySelectorAll('[data-message-author-role="user"]')];
  if (nodes.length <= $baseline) return false;
  const last = nodes[nodes.length - 1];
  return (last.innerText || last.textContent || '').trim().includes($textJson);
})()
"@
        if ($confirmed) {
            Confirm-PersistedMessage -Socket $Socket -Text $Text
            return
        }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)

    throw "O envio foi acionado, mas a mensagem nao foi confirmada na conversa."
}

function Confirm-PersistedMessage {
    param($Socket, [string]$Text)
    $Text = ConvertTo-ChatMessageText -Text $Text
    $textJson = $Text | ConvertTo-Json -Compress
    # Observe response activity before reloading; DOM insertion alone is optimistic.
    $deadline = (Get-Date).AddSeconds(60)
    $responding = $false
    do {
        $responding = Invoke-JavaScript -Socket $Socket -Expression @"
(() => {
 const users = [...document.querySelectorAll('[data-message-author-role="user"]')];
 const user = users.findLast(n => (n.innerText || n.textContent || '').trim() === $textJson);
 return !!user && [...document.querySelectorAll('[data-message-author-role="assistant"]')]
   .some(n => (user.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      (n.innerText || n.textContent || '').trim().length > 0);
})()
"@
        if ($responding) { break }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)
    if (-not $responding) { throw 'Entrega nao confirmada: nenhuma resposta observada. Janela preservada; nao reenviar automaticamente.' }
    $oldDocument = Invoke-JavaScript -Socket $Socket -Expression 'performance.timeOrigin'
    Invoke-CdpCommand -Socket $Socket -Method 'Page.reload' -Params @{ ignoreCache = $true } | Out-Null
    $deadline = (Get-Date).AddSeconds(30)
    do {
        try {
            $persisted = Invoke-JavaScript -Socket $Socket -Expression @"
(() => performance.timeOrigin !== $oldDocument &&
 [...document.querySelectorAll('[data-message-author-role="user"]')]
 .some(n => (n.innerText || n.textContent || '').trim() === $textJson))()
"@
            if ($persisted) {
                Write-Host 'Mensagem persistida: texto exato confirmado apos recarregar a conversa.'
                return
            }
        } catch { }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)
    throw 'Entrega nao confirmada apos recarregamento. Janela preservada; nao reenviar automaticamente.'
}

$socket = $null
$browserStarted = $false
$success = $false

try {
    $resolvedItems = @(Resolve-Configuration)
    if ($resolvedItems.Count -ne 1) {
        throw "A configuracao retornou $($resolvedItems.Count) valores; era esperado apenas um. Execute novamente com -Configure."
    }
    $resolved = $resolvedItems[0]
    $conversationUrl = [string]$resolved.ConversationUrl
    Write-Host "Conversa configurada."

    if ($ValidateConfigOnly) {
        Write-Host "Configuracao valida."
        exit 0
    }

    $chromePath = Get-ChromePath
    New-Item -ItemType Directory -Path $script:ProfileDir -Force | Out-Null
    $endpoint = Get-ChromeEndpoint -ProfileDir $script:ProfileDir
    if ($endpoint) {
        Write-Host "Reutilizando a janela automatizavel do perfil dedicado."
    }
    else {
        $activePortFile = Join-Path $script:ProfileDir "DevToolsActivePort"
        if (Test-Path -LiteralPath $activePortFile) {
            Remove-Item -LiteralPath $activePortFile -Force
        }

        $arguments = @(
            "--remote-debugging-address=127.0.0.1",
            "--remote-debugging-port=0",
            "--user-data-dir=$script:ProfileDir",
            "--profile-directory=Default",
            "--no-first-run",
            "--no-default-browser-check",
            "--start-maximized",
            $conversationUrl
        )

        Start-Process -FilePath $chromePath -ArgumentList $arguments | Out-Null
        $browserStarted = $true
        $endpoint = Wait-ChromeEndpoint -ProfileDir $script:ProfileDir
    }
    $port = [int]$endpoint.Port
    $page = Get-PageTarget -Port $port

    $webSocketUrls = @($page.webSocketDebuggerUrl)
    if ($webSocketUrls.Count -ne 1 -or [string]::IsNullOrWhiteSpace([string]$webSocketUrls[0])) {
        throw "A aba do Chrome nao informou uma unica URL de automacao."
    }

    $socket = [System.Net.WebSockets.ClientWebSocket]::new()
    $null = $socket.ConnectAsync(
        [Uri]([string]$webSocketUrls[0]),
        [Threading.CancellationToken]::None
    ).GetAwaiter().GetResult()

    Invoke-CdpCommand -Socket $socket -Method "Page.enable" | Out-Null
    Invoke-CdpCommand -Socket $socket -Method "Runtime.enable" | Out-Null
    Wait-ForComposer -Socket $socket -TargetUrl $conversationUrl -TimeoutSeconds $LoginTimeoutSeconds
    Send-ChatMessage -Socket $socket -Text $resolved.Message -PreviewOnly:$DryRun
    $success = $true
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
finally {
    if ($socket) {
        if ($success -and $browserStarted -and -not $KeepOpen -and -not $DryRun) {
            try {
                Invoke-CdpCommand -Socket $socket -Method "Browser.close" | Out-Null
            }
            catch {
                # O navegador pode fechar a conexao antes de responder.
            }
        }
        try { $socket.Dispose() } catch {}
    }

    if ($success -and $DryRun) {
        Write-Host "A janela ficou aberta para voce conferir. Feche-a manualmente ao terminar."
    }
}
