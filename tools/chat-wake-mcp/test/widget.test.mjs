import assert from 'node:assert/strict';
import test from 'node:test';

import { buildWidgetHtml, widgetContract } from '../widget.mjs';

test('PoC aceita somente a mensagem fixa e a envia automaticamente pela ponte oficial', () => {
  const html = buildWidgetHtml({ testMessage: widgetContract.testMessage });
  assert.match(html, /ORCH_PLUGIN_WAKE_POC/);
  assert.match(html, /sendFollowUpMessage/);
  assert.match(html, /setTimeout\(async \(\) =>/);
  assert.doesNotMatch(html, /addEventListener\('click'/);
  assert.match(html, /lastWakeKey/);
});

test('modo watch exige CHAT_READY, valida task_id e calcula SHA-256', () => {
  const html = buildWidgetHtml({
    stateUrl: 'https://raw.githubusercontent.com/example/repo/branch/state.json',
  });
  assert.match(html, /CHAT_READY/);
  assert.match(html, /task_id recusado/);
  assert.match(html, /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(html, /ORCH_WAKE/);
});

test('configuração embutida neutraliza fechamento de script', () => {
  const html = buildWidgetHtml({ testMessage: '</script><script>alert(1)</script>' });
  assert.doesNotMatch(html, /<\/script><script>alert/);
  assert.match(html, /\\u003c\/script>/);
});
