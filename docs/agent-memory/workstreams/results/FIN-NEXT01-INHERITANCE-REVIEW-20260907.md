# CP-01 — revisão retrospectiva da fundação NEXT-01

Task: `FIN-NEXT01-INHERITANCE-REVIEW-20260907`.
Data: 2026-09-07. Execução: Codex / Astra / Alto.

## Resultado

**CP-01 revisado, mas não resolvido: 2 findings `herdado_material` (1 HIGH e 1 MEDIUM).**

A revisão não alterou produto, testes, scripts, dependências ou fixtures. Conforme o manifesto, para aqui antes de qualquer correção. Não abre CP-02, nova fatia, NEXT-03, deploy ou produção. Não reaudita N02-A/B/C/D/E.

Há também um bloqueio operacional separado: os cinco `required_files` não existem na worktree do canal, embora tenham sido consultados no commit do produto. O preflight real de `loadTaskDefinition` falha. Este relatório não afirma publicação do recibo nem `CHAT_READY` remoto.

## 1. Identidade e método

- Âncora histórica: `9b0cfd848d08b85ed94016b65f07820ca89dbbfb`.
- Descendant atual: `5239c342b5705e64d3fb6412048382d665bcb6a4`, branch de produto `codex/financasbot-next-02-n02a-v2`.
- Canal: branch `chat/chat-codex-orchestration-20260824`, HEAD inicial `925ba7af0f34117228bd154144b8054d722ab3fd`.
- Estado remoto de entrada: `CODEX_READY`, mesma task, hash canônico `8fced3fc6d72f19be51f8dc8caa899d527beba32e7199c98a545ad33b8960994`.
- O produto foi inspecionado em snapshot Git destacado no SHA atual, separado da worktree do canal. A ancestralidade da âncora foi confirmada.

Os onze fontes da fundação NEXT-01 permanecem sem alteração entre a âncora e o descendant. No conjunto revisado, o delta acrescenta quatro módulos do kernel NEXT-02 e parametriza a allowlist/bindings do analisador herdado; não corrige as duas rotas abaixo. A integração do gate atual foi consultada somente para confirmar o uso desse analisador, não para reauditar as fórmulas do kernel.

A aprovação histórica da AST integral do replay continua válida dentro daquele escopo focal. O finding H1 abaixo fica fora do arquivo congelado: não demonstra quebra do hash, de sua canonicalização ou da restauração do replay.

## 2. HIGH H1 — aquisição indireta de geração de código não é classificada

Classificação: **`herdado_material`**.

Paths e pontos causais no descendant:

- `scripts/agent/financasBotNext01ValidationPolicy.js:119`: `memberName` reconhece propriedade literal ou identificador não calculado; expressão calculada retorna `null`.
- Mesmo arquivo, linhas 358 e 405: a proibição de `constructor`/`__proto__` depende desse nome reconhecido. A proibição do identificador `Function` não cobre obter o mesmo construtor indiretamente.
- `scripts/agent/financasBotNext02ValidationPolicy.js`, `inspectSources`: reutiliza `analyzeNextSourceFiles`; a lacuna continua na fronteira herdada atual.

Witness sintético inofensivo, acrescentado apenas à leitura em memória de um fonte já inventariado (`contracts/reuseManifest.js`):

```js
const cp01Marker = (() => {})['con' + 'structor']('return 7')();
```

Cadeia causal:

1. O path e o tipo do arquivo não mudam; inventário e containment não detectam uma alteração no conteúdo permitido.
2. A chave é uma `BinaryExpression`; `memberName` não a classifica como `constructor`.
3. O código não contém uso do identificador `Function`. Os demais bloqueios nominais não o rejeitam.
4. O construtor obtido compila e executa uma string. O probe executou exclusivamente `return 7` e retornou `7`, sem rede, arquivos ou dados privados.
5. Tanto o analisador da âncora quanto o atual retornaram `errors=[]`, `unclassifiedModuleLoaders=0` e `forbiddenEffectImports=0` para esse mutant.
6. O caminho herdado `inspectSources(..., 'N02-E')` também retornou os três resultados verdes para a mesma substituição em memória.

O replay conservou o hash `00e18c3734a593b432ac0335af43353a189132513b4c0107aa825abcecbcf0be` e `classifiedHermeticRuntimeLoaders=1`. Isso é esperado: o mutant não toca o replay.

**Impacto:** a garantia de ausência de capacidades proibidas/fail-closed excede o conjunto de construções efetivamente reconhecido. Não foi encontrado esse código no produto real, nem foi demonstrada exploração de produção. Foi demonstrado um falso negativo executável do analisador, inclusive na integração atual. Não foi executado o gate imutável completo sobre um commit mutante; não se afirma esse resultado.

**Correção mínima sugerida para tarefa separada:** delimitar a linguagem/capacidades efetivamente admitidas pela análise, rejeitando aquisição indireta de geração de código/reflexão que não possa classificar. Não acrescentar apenas mais uma grafia de `constructor` à lista. Contratos fechados de código revisado podem cobrir exceções deliberadas, sem transformar a fundação em sandbox geral de JavaScript. Preservar o contrato de AST integral do replay. Acrescentar regressão causal com esse witness e variantes da mesma classe; calibrar a alegação do gate ao que foi realmente provado. O desenho exato da correção não foi implementado nem ratificado nesta revisão.

## 3. MEDIUM M1 — limite de três reads não limita chamadas em andamento

Classificação: **`herdado_material`**.

Paths:

- `src/next/policy/toolBudget.js:7,78`: declara máximo 3, mas `reserveParallelReads` somente valida um número informado; não reserva nem contabiliza calls em andamento.
- `src/next/tools/readOnlyToolGateway.js:109,120`: usa `budget.reserve` e chama o adapter; não adquire/libera vaga de concorrência.
- `tests/next/toolBudgetRed.cases.js`, `N01-BUDGET-002`: testa `count=3`/`count=4` diretamente, não quatro execuções reais sobre o mesmo budget.
- `docs/contracts/next/tool-budget-failure-policy-v0.md`, seções 4 e 10/TB-04: máximo 3 reads paralelos; quarto aguarda ou não inicia.

Probe determinístico: um gateway read-only com adapter sintético fica pendente em uma Promise controlada. Quatro `execute` são iniciados com o mesmo tracker e argumentos distintos válidos; nenhum adapter é liberado antes de medir a concorrência.

Resultado efetivamente observado:

```json
{
  "beforeRelease": {
    "active": 4,
    "peak": 4,
    "calls": 4,
    "manualCount4": { "ok": false, "reason": "PARALLEL_READ_LIMIT" }
  },
  "approvedAfterRelease": 4,
  "finalActive": 0
}
```

A consulta manual reconhece a violação, mas o gateway já iniciou a quarta chamada. Os blobs do gateway e do budget são idênticos na âncora e no descendant: herança confirmada, não regressão financeira do NEXT-02.

**Impacto:** limite de concorrência do contrato não é aplicado pela boundary; o fluxo conversacional atual normalmente chama uma tool por turno e não constitui, por si, evidência de ocorrência operacional. O problema é reproduzível na API read-only existente, sem adapter real ou nova funcionalidade.

**Correção mínima sugerida:** reserva de vaga atômica por tracker compartilhado antes do adapter, com liberação em `finally`; rejeitar ou aguardar a quarta chamada conforme a policy, sem novo scheduler distribuído. Testar quatro Promises pendentes e liberação também após falha. Não corrigido neste manifesto.

## 4. Demais fronteiras e classificação histórica

| Área/hipótese | Classificação e conclusão desta revisão |
| --- | --- |
| Identidade privada aninhada em argumento permitido | `historico_ja_eliminado`: boundary recursiva e schema de tipo antes de reservar budget ou chamar adapter. |
| Containers falsy transformados em argumentos vazios | `historico_ja_eliminado`: somente `undefined` vira `{}`; teste mantém zero reservations/adapter calls para containers inválidos. |
| Trusted context e SessionState/CAS | Inspeção não demonstrou novo finding: comparação family/actor, checagem de versão anterior à tool, CAS monotônico e rejeição de patch arbitrário. A sessão em memória não é anunciada como CAS distribuído. |
| Catálogo read-only/fallback | Não foi encontrado writer ou fallback de provider no runtime herdado atual. Configuração de adapters é confiada; nome read-only não é sandbox de callback hostil. H1 limita a força da prova estática futura. |
| Divergência de `period.type` | `historico_ja_eliminado`: route expectation e verifier comparam tipo e valor; regressão focal presente. |
| Claims/coverage | Verificador básico exige claim tipado, scope/dimensões esperadas, coverage e referências; rejeita zero com evidência incompleta. Provenance financeira completa não é declarada implementada pelo skeleton NEXT-01; sua ausência não vira novo finding CP-01. |
| Timeout de chamada já em andamento | `manutencao_nao_finding`: TB-05 exige interromper novas calls após 30s; a ausência de cancelamento obrigatório da Promise pendente não contradiz, sozinha, esse requisito. Não mantive a hipótese inicial como finding. |
| Budget soft/hard, repetição e contadores | Casos focais passam para limites declarados; isso não demonstra concorrência efetiva, que é M1. |
| Tokens privados em observabilidade | `historico_ja_eliminado`: enums e código genérico para desconhecidos; allowlist de tools. Sem nova rota causal demonstrada nos chamadores atuais. |
| Ledger vazio | Sem writer exposto; coleções devolvidas separadamente. Não implica que todos os futuros fontes estejam seguros; esse limite é H1. |
| Exceção ampla de `Module._load` | `historico_ja_eliminado` no replay: AST integral congelada, alterações do bloqueio/forwarding/restauração falham nos testes presentes. |
| TAP textual, SKIP/TODO e teste compensatório | `historico_ja_eliminado`: eventos estruturados, IDs únicos, arquivo esperado e contagens exatas, sem skip/todo. |
| HEAD/parent/tracked e inventário | Regras presentes. O gate histórico NEXT-01 não é gate global do tree expandido NEXT-02; não o executei falsamente como se certificasse o descendant inteiro. |
| Rigididez do hash de AST | `manutencao_nao_finding`: custo de manutenção de contrato fechado, não prova de falso verde no arquivo congelado. |

## 5. Evidência nova de execução

Ambiente: Node `v22.17.0`, Acorn `8.15.0` (a mesma versão do lockfile), reutilizado por `NODE_PATH` de instalação local existente; nenhuma instalação ou mudança de dependências.

1. Inspeções clean/mutant das versões histórica e atual: resultados descritos em H1; payload substituído na leitura do harness, sem editar fonte no disco.
2. Integração do analisador herdado atual: mesma lacuna, apenas `inspectSources`, sem executar/reabrir as suítes financeiras N02.
3. Execução inofensiva do witness de geração de código: `7`.
4. Concorrência read-only sintética: pico de 4, quatro sucessos, nenhuma chamada privada.
5. Bateria focal existente da fundação: **25 testes / 25 PASS / 0 FAIL / 0 SKIP / 0 TODO**. Os **25 IDs** foram obtidos dos eventos estruturados da mesma execução e validados por `validateExecutedPropertyEvents`; TAP ficou apenas como diagnóstico.

A bateria focal verde não cobre os dois witnesses novos. Nenhuma suíte ampla foi executada: esta tarefa é revisão somente leitura, não candidato corretivo. Os resultados históricos de ampla e de auditorias não foram reapresentados como execução nova nem como ampla verde.

Transparência do harness: a primeira tentativa do probe parou por falta de resolução local de Acorn; a primeira chamada inline do runner herdou `node -e` nos subprocessos e produziu falhas do harness antes dos casos. Corrigida somente a invocação (dependência já instalada e `process.execArgv` vazio no harness), a execução focal real produziu os 25 PASS acima. Não são falhas de produto nem foram ocultadas como testes aprovados.

## 6. Fontes consultadas

No SHA atual: os onze fontes da fundação NEXT-01, os quatro arquivos `tests/next/{next01SkeletonRed,conversationReplayRed,toolBudgetRed,validatorGate}.cases.js`, a policy congelada `docs/contracts/next/tool-budget-failure-policy-v0.md`, o analisador e gate NEXT-01. Esses fontes/testes/policy foram lidos por conteúdo.

O suplemento de checkpoints, o charter NEXT-01 e o parecer `FIN-NEXT01-AST-REAUDIT-20260903.md` foram consultados no produto. Os documentos NEXT-02/workstream foram usados para estado vigente, integração e fronteiras deferidas, não para nova auditoria cronológica das fatias. A inspeção de `financasBotNext02ValidationPolicy.js` restringiu-se a contrato de paths e chamada ao analisador herdado; `validateFinancasBotNext02.mjs` confirma o consumo dessa análise pelo gate atual.

Na âncora: policy carregada diretamente por `git show` para reproduzir H1; comparação Git dos onze fontes herdados e dos testes/gates para verificar persistência. Blobs do gateway, budget, reuse manifest, replay e gate NEXT-01 confirmados iguais nos dois SHAs.

No canal: manifesto, estado e `chatCodexTaskContract.js`/`completeChatCodexAppExecution.js` para validar a possibilidade de publicação. Nenhuma leitura de ambiente privado ou superfície produtiva.

## 7. Bloqueio operacional de publicação

Os cinco paths de `required_files` do manifesto estão ausentes na branch/worktree do canal. O loader exige sua presença ali com `assertPathTraversalSafe(repoPath, filePath, true)`. A execução real de `loadTaskDefinition` retornou:

```text
arquivo obrigatório ausente: docs/plans/workstreams/financasbot-next-crosscutting-review-checkpoints-v1.md
```

`completeChatCodexAppExecution` usa esse mesmo loader antes de publicar o resultado. Ler os documentos no SHA correto do produto permite a análise, mas não satisfaz automaticamente esse preflight do canal. Não copiei os cinco arquivos, não alterei o manifesto e não contornei o publicador. A transição local anterior a `CODEX_RUNNING` ocorreu antes dessa validação integral; isso foi uma falha de ordem desta execução, aqui reconhecida, não uma conclusão contra o produto.

Próximo passo operacional: o responsável pelo manifesto deve regularizar as referências entre canal e produto no fluxo autorizado, preservando este relatório e sem sobrescrever tarefa concorrente. O estado local fica bloqueado com o relatório preservado; não se declara `CHAT_READY` nem publicação remota concluída.

## 8. Próxima seleção

Primeiro regularizar o recibo do canal. Depois confrontar H1/M1 e abrir correção separada, com paths e critérios causais próprios. Não é necessário abandonar a topologia existente. CP-01 só poderá ser declarado resolvido após tratar os findings; CP-02 vem depois, conforme o suplemento.

O parecer aprovado de continuidade `591368d...` não é aprovação deste CP-01, não reaudita N02-E e não transforma a suíte ampla histórica vermelha em verde.

Capacidade: **Codex → Sol → Médio → regularizar o manifesto/recibo do canal em tarefa separada**. Para a correção causal H1/M1, reavaliar **Codex → Astra → Alto**. Não houve troca automática de modelo/esforço.

## 9. Retomada operacional — 2026-09-08

A retomada confirmou HEAD local e remoto `925ba7af0f34117228bd154144b8054d722ab3fd`, com a mesma tarefa ainda em `CODEX_READY` no remoto e `BLOCKED` local. As constatações de ausência de publicação nas seções anteriores descrevem o estado anterior a esta retomada.

Este recibo será publicado junto ao estado `BLOCKED`, exclusivamente nos dois caminhos já autorizados (estado e resultado). Não representa `CHAT_READY`, correção dos findings ou CP-01 resolvido. A publicação de bloqueio preserva o manifesto original: não remove required_files, não amplia allowed_paths e não copia documentos de produto para a branch do canal.

O protocolo vigente não permite transição de saída de `BLOCKED`. A retomada exige uma nova tarefa de manutenção do canal, com referências de produto resolvidas no SHA declarado e escopo explícito; a correção de H1/M1 continua sendo tarefa separada. Nenhum bot, browser, runtime, produção ou teste financeiro foi acionado nesta retomada.
