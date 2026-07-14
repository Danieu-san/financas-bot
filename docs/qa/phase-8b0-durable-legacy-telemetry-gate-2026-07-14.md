# Fase 8B.0 - telemetria duravel de legado - gate 2026-07-14

## Veredito

`GO de producao` para a telemetria 8B.0.

O GO autoriza observar e caracterizar consumidores. Nao autoriza remover codigo,
fallback, aba, schema ou fonte. A janela de observacao comeca em 2026-07-14.

## Escopo entregue

- contrato JSONL fixo e allowlisted, sem `metadata` livre;
- opt-in por `LEGACY_USAGE_TELEMETRY_ENABLED`;
- refs de ator/sessao por HMAC exclusivo com rotacao UTC diaria;
- sem segredo HMAC valido, refs ficam vazias em vez de usar hash fraco;
- arquivo append-only com permissao `600`, limite de tamanho e backups rotativos;
- heartbeat horario com `reason_code=self_check` e sync fisico;
- falha de escrita retorna `write_failed`, registra apenas o codigo abstrato e
  nao altera resposta, leitura ou escrita financeira;
- eventos comuns nao executam `fsync` por consulta para evitar latencia de
  usuario; continuam persistidos no JSONL;
- instrumentacao inicial do fallback Financial Agent -> pipeline legado;
- fonte SQLite -> memoria do read-model;
- fonte canary canonica -> legado;
- heartbeat integrado ao scheduler operacional.

Campos persistidos: schema, event id, horario, dia de rotacao, commit,
superficie, consumer, handler, rota, dominio, operacao, fonte, origem/destino de
fallback, modo, resultado, reason code, faixa de latencia, tentativa/resultado
de escrita e refs HMAC opcionais.

O contrato ignora mensagem, telefone, nome, valor, conta, cartao,
estabelecimento, token, ID de planilha, payload, resposta do modelo e qualquer
campo arbitrario.

## Evidencia local

- TDD RED: modulo ausente antes da implementacao.
- Gate isolado: `6/6` para allowlist, privacidade, HMAC rotativo, opt-in,
  append/heartbeat, rotacao e falha de escrita.
- Integracoes de telemetry/router/read-model/scheduler: `41/41`.
- Financial Agent + telemetria: `89/89`.
- Suite principal: `861/861`.
- Pretest 6A-6E permaneceu verde.
- `npm audit --audit-level=high`: zero vulnerabilidades.
- Sintaxe, `package.json`, `git diff --check` e varredura de segredos: verdes.

O gate analitico foi repetido e permaneceu corretamente `NO_GO`: 265 casos, uma
lacuna em `BILL-015`, migration gaps `6/6`, zero missing/unsafe e zero Gemini.
Telemetria nao mascarou o bloqueio de remocao.

## Evidencia de producao

- commit/runtime `0619f1c2cba4b861aa0e77f8d457cfa2b182f5dd`;
- backup do `.env` criado fora do repositorio antes da configuracao;
- teste remoto 8B.0 `6/6` e audit de dependencias sem vulnerabilidade;
- flag habilitada, caminho limitado e segredo HMAC exclusivo gerado na EC2 sem
  ser exibido ou copiado para docs;
- heartbeat: `schema=1`, `event=heartbeat`, `surface=telemetry`,
  `reason=self_check`, commit correto e refs vazias;
- arquivo de producao com permissao `600`;
- smoke read-only com ator sintetico escolheu `memory_fallback`, gravou HMAC de
  16 caracteres e nao persistiu o identificador bruto;
- zero `write_failed` no log apos o rollout;
- worktree rastreado remoto limpo;
- PM2 online, WhatsApp pronto, cron inicializado e health
  `{"ok":true,"sqlite":true}`.

## Flags de producao

- `LEGACY_USAGE_TELEMETRY_ENABLED=true`;
- `LEGACY_USAGE_TELEMETRY_PATH=data/legacy-usage-telemetry.jsonl`;
- `LEGACY_USAGE_TELEMETRY_HMAC_SECRET`: presente, valor nao registrado;
- `LEGACY_USAGE_TELEMETRY_MAX_BYTES=5242880`;
- `LEGACY_USAGE_TELEMETRY_MAX_BACKUPS=4`;
- `APP_COMMIT_SHA=0619f1c`.

## Rollback

Definir `LEGACY_USAGE_TELEMETRY_ENABLED=false` e reiniciar o PM2 com
`--update-env`. O servico tambem falha sem impacto no produto se o arquivo ficar
indisponivel. Nenhum fallback ou comportamento financeiro depende da telemetria.

## Proximo gate

8B.1: corrigir `BILL-015`, ampliar a instrumentacao analitica para trajetoria
completa e rerodar o gate 265/265. Fallback permanece ligado por dominio e a
janela de observacao nao substitui corpus, paridade ou rollback.
