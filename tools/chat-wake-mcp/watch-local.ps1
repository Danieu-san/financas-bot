param(
  [string]$InstallRoot = $PSScriptRoot,
  [int]$PollSeconds = 30
)

$ErrorActionPreference = 'Stop'
$StateUrl = 'https://raw.githubusercontent.com/Danieu-san/financas-bot/chat/chat-codex-orchestration-20260824/docs/agent-memory/workstreams/chat-codex-channel.state.json'
$ServerRoot = Join-Path $InstallRoot 'server'
$TunnelRoot = Join-Path $InstallRoot 'tunnel-client'
$TunnelExe = Join-Path $TunnelRoot 'tunnel-client.exe'
$ProfileRoot = Join-Path $TunnelRoot 'profiles'
$SecretFile = Join-Path $TunnelRoot 'control-plane-api-key.txt'
$HealthFile = Join-Path $env:USERPROFILE '.local\state\tunnel-client\health\financasbot-chat-wake.url'

function Test-HttpOk([string]$Url) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 4
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Ensure-McpServer {
  if (Test-HttpOk 'http://127.0.0.1:3210/healthz') { return }

  $environment = @{
    CHAT_WAKE_STATE_URL = $StateUrl
  }
  Start-Process -FilePath 'node.exe' -ArgumentList 'server.mjs' `
    -WorkingDirectory $ServerRoot -WindowStyle Hidden -Environment $environment

  for ($attempt = 0; $attempt -lt 10; $attempt++) {
    Start-Sleep -Milliseconds 500
    if (Test-HttpOk 'http://127.0.0.1:3210/healthz') { return }
  }
  throw 'Servidor MCP local não ficou saudável.'
}

function Test-TunnelReady {
  if (-not (Test-Path -LiteralPath $HealthFile)) { return $false }
  $baseUrl = (Get-Content -LiteralPath $HealthFile -Raw).TrimEnd('/')
  if (-not $baseUrl) { return $false }
  return Test-HttpOk "$baseUrl/readyz"
}

function Ensure-Tunnel {
  if (Test-TunnelReady) { return }

  & $TunnelExe runtimes connect `
    --alias financasbot-chat-wake `
    --profile financasbot-chat-wake `
    --profile-dir $ProfileRoot `
    --tunnel-id tunnel_6a8db9dff77c81918d7a2f06d7e46c59 `
    --mcp-server-url http://127.0.0.1:3210/mcp `
    --runtime-api-key "file:$SecretFile" `
    --json | Out-Null

  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 500
    if (Test-TunnelReady) { return }
  }
  throw 'Secure MCP Tunnel não ficou pronto.'
}

while ($true) {
  try {
    Ensure-McpServer
    Ensure-Tunnel
  } catch {
    # A próxima iteração tenta recuperar sem iniciar qualquer modelo.
  }
  Start-Sleep -Seconds $PollSeconds
}
