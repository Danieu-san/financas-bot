const STATE_PATH = 'docs/agent-memory/workstreams/chat-codex-channel.state.json';
const TASK_ID_PATTERN = '^[A-Za-z0-9._-]{1,80}$';
const TEST_MESSAGE = 'ORCH_PLUGIN_WAKE_POC';

function escapeJsonForScript(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

export function buildWidgetHtml({
  appSdkUrl = null,
  appSdkSource = null,
  stateUrl = null,
  testMessage = null,
  pollIntervalMs = 30_000,
} = {}) {
  const config = escapeJsonForScript({
    pollIntervalMs,
    statePath: STATE_PATH,
    stateUrl,
    taskIdPattern: TASK_ID_PATTERN,
    testMessage,
    allowedTestMessage: TEST_MESSAGE,
    appSdkUrl,
    hasEmbeddedAppSdk: Boolean(appSdkSource),
  });

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>FinancasBot Chat Wake</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 12px; color: #1f2937; }
    #status { font-weight: 650; }
    #detail { margin-top: 4px; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div id="status">Inicializando ponte…</div>
  <div id="detail">Nenhum modelo é chamado enquanto o estado não muda.</div>
  <script type="module">
    ${appSdkSource || ''}
    const CONFIG = ${config};
    const statusEl = document.getElementById('status');
    const detailEl = document.getElementById('detail');
    let stopped = false;

    function setStatus(status, detail) {
      statusEl.textContent = status;
      detailEl.textContent = detail;
    }

    function bridgeState() {
      return window.openai?.widgetState || {};
    }

    function alreadySent(key) {
      return bridgeState().lastWakeKey === key;
    }

    function rememberSent(key) {
      window.openai?.setWidgetState?.({
        ...bridgeState(),
        lastWakeKey: key,
        lastWakeAt: new Date().toISOString(),
      });
    }

    async function sha256Hex(text) {
      const bytes = new TextEncoder().encode(text);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(digest)]
        .map(value => value.toString(16).padStart(2, '0'))
        .join('');
    }

    async function postOnce(message, key) {
      if (alreadySent(key)) {
        setStatus('Ponte armada', 'O wake atual já foi entregue; aguardando novo hash.');
        return false;
      }
      rememberSent(key);
      try {
        if (CONFIG.hasEmbeddedAppSdk || CONFIG.appSdkUrl) {
          const AppConstructor = CONFIG.hasEmbeddedAppSdk
            ? App
            : (await import(CONFIG.appSdkUrl)).App;
          const app = new AppConstructor(
            { name: 'FinancasBot Chat Wake', version: '0.1.0' },
            {},
            { autoResize: false },
          );
          await app.connect();
          const result = await app.sendMessage({
            role: 'user',
            content: [{ type: 'text', text: message }],
          });
          if (result?.isError) throw new Error('host recusou ui/message');
        } else if (window.openai?.sendFollowUpMessage) {
          await window.openai.sendFollowUpMessage({ prompt: message, scrollToBottom: true });
        } else {
          throw new Error('ui/message indisponível neste host');
        }
      } catch (error) {
        window.openai?.setWidgetState?.({ ...bridgeState(), lastWakeKey: null });
        throw error;
      }
      setStatus('Wake enviado', message);
      return true;
    }

    async function pollState() {
      if (stopped || !CONFIG.stateUrl) return;
      try {
        const response = await fetch(CONFIG.stateUrl, { cache: 'no-store' });
        if (!response.ok) throw new Error('estado HTTP ' + response.status);
        const raw = await response.text();
        const state = JSON.parse(raw);
        if (state.schema !== 'financasbot-chat-codex-orchestration-v1') {
          throw new Error('schema de estado recusado');
        }
        if (state.orchestration_state !== 'CHAT_READY') {
          setStatus('Ponte armada', 'Estado atual: ' + state.orchestration_state + '.');
          return;
        }
        if (!new RegExp(CONFIG.taskIdPattern).test(state.task_id || '')) {
          throw new Error('task_id recusado');
        }
        const hash = await sha256Hex(raw);
        const message = 'ORCH_WAKE ' + state.task_id + ' ' + hash + ' ' + CONFIG.statePath;
        await postOnce(message, state.task_id + ':' + hash);
      } catch (error) {
        setStatus('Ponte em espera', String(error?.message || error));
      }
    }

    async function start() {
      try {
        await window.openai?.requestDisplayMode?.({ mode: 'pip' });
      } catch {}

      if (CONFIG.testMessage) {
        if (CONFIG.testMessage !== CONFIG.allowedTestMessage) {
          setStatus('Teste recusado', 'Mensagem fora do contrato do PoC.');
          return;
        }
        setStatus('PoC automático armado', 'A mensagem fixa será enviada após o turno atual encerrar.');
        setTimeout(async () => {
          try {
            await postOnce(CONFIG.testMessage, 'poc:' + CONFIG.testMessage);
          } catch (error) {
            setStatus('Falha no PoC', String(error?.message || error));
          }
        }, 15_000);
        return;
      }

      await pollState();
      setInterval(pollState, CONFIG.pollIntervalMs);
    }

    window.addEventListener('beforeunload', () => { stopped = true; });
    start();
  </script>
</body>
</html>`;
}

export const widgetContract = Object.freeze({
  statePath: STATE_PATH,
  testMessage: TEST_MESSAGE,
});
