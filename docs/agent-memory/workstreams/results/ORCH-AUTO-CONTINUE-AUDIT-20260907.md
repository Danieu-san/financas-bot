# Auditoria independente focal — ORCH auto-continue

Data: 2026-09-07.
Escopo: somente o delta `591368d96cdef610741ab1657beb5ffccd45a4cd`.
Parent único confirmado: `870e0e0d7d0f88cf2b5ee62cf1396f7cb1dee24e`.
Veredito: **APROVÁVEL** somente para este delta.

## Manifest Gate

O objeto GitHub efetivamente lido é `591368d96cdef610741ab1657beb5ffccd45a4cd`, commit `feat(orch): resume authorized work after audit return`, com exatamente um parent, `870e0e0d7d0f88cf2b5ee62cf1396f7cb1dee24e`.

O compare base...head está ahead por um commit, behind por zero, merge-base igual ao parent e contém exatamente três paths alterados:

- `scripts/agent/wakeCodexAppViaIpc.js`;
- `tests/codexAppIpcWake.test.js`;
- `docs/agent-memory/workstreams/orch-audit-continuation.md`.

Os três arquivos foram lidos integralmente no SHA candidato. Como confronto causal, foram lidos também os trechos pertinentes do watcher inalterado (`watchChatCodexOrchestration.js`, `completeChatCodexAppExecution.js` e `chatCodexAppWake.js`) no mesmo SHA para verificar a sequência real de publicação e o enforcement de `allowed_paths`.

## Findings

- CRITICAL: nenhum.
- HIGH: nenhum.
- MEDIUM: nenhum.
- LOW: nenhum finding causal demonstrado.

## Conclusão causal

### 1. O manifesto termina antes da retomada do produto

No modo `execute`, o prompt continua começando pela tarefa mecânica: confirmar o estado remoto, ler AGENTS/state/task_file, executar somente o manifesto, respeitar `allowed_paths`, transicionar `CODEX_RUNNING`, produzir/validar o `result_file` e transicionar `CHAT_READY`.

O delta então acrescenta uma fronteira explícita: somente **após confirmar remotamente a publicação de `CHAT_READY`** encerra a execução do manifesto e seus `allowed_paths`. A retomada do produto vem depois e é descrita como uma ação separada.

Essa ordem é compatível com o watcher existente. O wake do Codex App é assíncrono: o IPC retorna `accepted` sem aguardar a conclusão do turno. Em ciclo posterior, o watcher observa `CHAT_READY` local, carrega o manifesto original, exige que `result_file` corresponda, valida que o worktree contém apenas `statePath` e `task.allowed_paths`, rejeita rename/copy/status/path inesperado, confirma que o remoto ainda está no `CODEX_READY` original, e somente então faz add/commit/push. Depois relê o remoto e exige `CHAT_READY` da mesma tarefa e mesmo `result_file`.

Portanto é causalmente possível que, enquanto o turno do App ainda está ativo, o watcher publique o recibo e o App só prossiga após verificar o `CHAT_READY` remoto. Não há necessidade de reutilizar os `allowed_paths` do recibo como permissão de produto.

### 2. A retomada exige autorização prévia e checkpoint identificável

O prompt limita a continuação automática a recebimento de auditoria com autorização prévia do usuário e workstream/checkpoint vigente identificável. A documentação focal registra explicitamente a autorização de Daniel de 2026-09-07 para corrigir findings confirmados ou seguir o próximo item do roadmap.

A retomada deve ocorrer na própria worktree do produto e é regida pela autorização do usuário + roadmap/checkpoint, não pelo manifesto fechado nem pelo parecer. A aprovação focal não substitui gate global; avanço de fase depende do respectivo gate e de autorização já existente.

Destino desconhecido, autorização ausente ou impossibilidade de identificar com segurança o workstream/próxima ação fazem o prompt encerrar sem inferir destino.

### 3. `allowed_paths` do recibo não são herdados

O texto novo afirma expressamente que o manifesto e o parecer não concedem nova autorização nem ampliam `allowed_paths`. O produto só pode ser retomado como ação separada após o recibo ter sido publicado remotamente e o manifesto encerrado.

Isso é coerente com o enforcement mecânico do watcher: antes do push do recibo, qualquer mudança fora de `statePath + task.allowed_paths` faz a publicação falhar fechada. Logo, uma alteração de produto na worktree do recibo antes do fechamento não seria silenciosamente incorporada.

### 4. Retorno comum não amplia escopo

O prompt termina com guard explícito: se não for retorno de auditoria, faltar autorização ou não for possível identificar com segurança o workstream e a próxima ação, a execução termina informando o impedimento, sem inferir destino.

Assim, um retorno comum não recebe por acidente a autorização de continuidade do produto.

### 5. Gates de fase continuam preservados

O novo texto diferencia três situações:

- finding confirmado: corrigir depois de confrontar parecer com SHA/evidência;
- aprovação focal: avançar para a próxima fatia do roadmap;
- gate global satisfeito: só então avançar à próxima fase já autorizada.

A documentação reforça que aprovação de fatia não substitui gate global da fase. Não há autorização de produção/deploy/dados reais neste delta.

### 6. Transporte, bot, timers e modo `return`

O compare contém somente os três paths declarados. O código de framing/IPC, pipe, versão do request, timeout e aceite assíncrono dentro de `wakeCodexAppViaIpc.js` permaneceu sem alteração funcional; o delta é no texto do prompt `execute` e seus testes/checkpoint.

O prompt do modo `return` permanece com a mesma função de transporte mecânico `ORCH_WAKE` e termina depois do envio. Nenhum arquivo do bot, watcher, timers, instalador ou transporte externo foi alterado no commit.

## Evidência local — não reexecutada nesta auditoria

Relato local do candidato:

- bateria causal focal: 30/30 PASS;
- ampla única: 1.907 testes, 1.889 PASS, 8 FAIL, 10 SKIP, zero CANCELLED/TODO, `exit_status=1`, runner `valid=true`;
- os mesmos oito FAIL foram reproduzidos nos quatro arquivos focais de diagnóstico na base limpa, com 31 testes / 23 PASS / 8 FAIL.

A suíte ampla **não é verde** e não foi tratada como tal. A reprodução dos mesmos oito FAIL na base reduz a atribuição causal dessas falhas ao delta, mas não as apaga nem as transforma em PASS.

Esta auditoria não reexecutou 30/30, a ampla, nem a reprodução da base. No GitHub consultado para o candidato não havia statuses nem workflow runs associados que servissem como execução independente remota.

## Alcance do veredito

**APROVÁVEL somente para `591368d96cdef610741ab1657beb5ffccd45a4cd`.**

O parecer aprova a consistência do ajuste de continuidade pós-auditoria e seus testes/checkpoint. Não declara a suíte ampla verde, não resolve as oito falhas históricas, não aprova outros workstreams, não reaudita N02-E e não autoriza produção ou deploy.

## Publicação/retorno pelo canal

Parecer destinado ao canal versionado `chat/chat-codex-orchestration-20260824`.
Task de recibo solicitada: `ORCH-AUTO-CONTINUE-AUDIT-RETURN-20260907`, limitada exclusivamente ao recebimento deste parecer.

No momento da publicação do parecer, o state remoto do canal estava ocupado em `CODEX_READY` por `FIN-NEXT01-INHERITANCE-REVIEW-20260907`. Por isso o slot/state desta auditoria **não deve ser sobrescrito**: o despacho mecânico do recibo precisa aguardar o retorno canônico do canal a `CHAT_WORKING`. Isso preserva o protocolo fail-closed e não altera o veredito focal.
