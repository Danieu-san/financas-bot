# Recovery de entrega Chat -> Codex — 2026-08-28

## Sintoma

O GitHub permanecia em `CODEX_READY` para uma tarefa válida, mas o turno não aparecia no Codex App. Rearmar o estado criava um hash novo, porém não eliminava a causa do transporte.

## Achado causal

A ponte `processCodexAppWakeRequest.js` tratava qualquer registro existente para o mesmo `observed_hash` como terminal, inclusive `status=failed`. O teste `falha fica terminal para o mesmo hash sem duplicar campainha` congelava explicitamente esse comportamento.

Consequência: uma falha transitória do IPC após a fila local podia deixar uma tarefa válida permanentemente sem entrega, mesmo com o estado remoto ainda em `CODEX_READY`.

## Recovery implementado no GitHub

- `processCodexAppWakeRequest.js`
  - resultado passa a `financasbot-codex-app-wake-result-v3`;
  - registros guardam `attempts`;
  - `accepted` continua terminal/idempotente;
  - `failed` ou `dispatching` podem ser repetidos no mesmo hash;
  - limite de 3 tentativas impede wake infinito;
  - resultados v1/v2 são migrados em memória, com `attempts=1`.
- `Install-CodexAppWakeBridge.ps1`
  - nova ação `Repair`;
  - preserva task/config/ACL existentes;
  - recopia somente worker/helper protegidos e inicia imediatamente a task da ponte;
  - não exige reintroduzir thread/chat ou usuários.
- `tests/codexAppWakeBridge.test.js`
  - cobre accepted terminal;
  - retry de falha transitória;
  - limite de falha persistente;
  - recuperação a partir de resultado v2 failed;
  - presença do repair in-place no instalador.

## Estado da tarefa funcional preservada

A tarefa `FIN-ROAD01-CARD-ID-REVALIDATE-20260828` permanece em `CODEX_READY` e não deve ser recriada. O recovery de transporte deve processar o mesmo pedido/hash existente.

## Ativação local necessária

A cópia executada pela task S4U fica em `%ProgramData%` e não se atualiza apenas com commit no GitHub. Para ativar o recovery sem reinstalar configuração, é necessária uma única execução administrativa da nova ação `Repair` a partir do clone operacional já sincronizado.

Antes do `Repair`, forçar uma execução do watcher garante que o request atual exista no inbox. Depois do `Repair`, a própria task da ponte é iniciada imediatamente.

## Gate

Não declarar o canal corrigido só porque o patch está no GitHub. O gate operacional é observar a tarefa preservada sair de `CODEX_READY`, aparecer no Codex, concluir e retornar `CHAT_READY` sem reenvio manual.
