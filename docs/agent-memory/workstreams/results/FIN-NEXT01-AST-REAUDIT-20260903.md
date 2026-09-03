# FIN-NEXT01-AST-REAUDIT-20260903 — reauditoria independente focal

Data: 2026-09-03
Auditor: Chat / GPT-5.6 Sol
Tipo: revisão estática independente de qualidade por commit imutável

## Manifesto confirmado

- repositório: `Danieu-san/financas-bot`
- branch de origem: `codex/financasbot-next-01`
- commit auditado: `9b0cfd848d08b85ed94016b65f07820ca89dbbfb`
- parent único confirmado: `ccff4711c4e70c6d1b8c1227ebf70d91f89f3552`
- tree do candidato: `e53b0b828c3fca41c755726477ff03d65f6576f4`
- compare: exatamente 1 commit à frente do parent
- delta: exatamente 6 arquivos

Arquivos alterados lidos integralmente no SHA auditado:

1. `scripts/agent/financasBotNext01ValidationPolicy.js`
2. `scripts/agent/validateFinancasBotNext01.mjs`
3. `tests/next/validatorGate.cases.js`
4. `docs/plans/workstreams/financasbot-next-01-final-validation-v1.md`
5. `docs/plans/workstreams/financasbot-next-01.md`
6. `docs/agent-memory/workstreams/financasbot-next-01.md`

Arquivo inalterado confrontado integralmente no candidato e no parent:

- `src/next/replay/hermeticReplayRunner.js`

O blob do runner é idêntico nos dois hashes: `1509eb5e9e7c5a3c06c97fcd1c47766627568a24`.

## Escopo do delta

O compare confirma que somente os seis arquivos acima mudaram. Portanto, neste delta:

- `src/next/replay/hermeticReplayRunner.js` não mudou;
- `package.json` e `package-lock.json` não mudaram;
- dependências não mudaram;
- nenhum arquivo NEXT-02 mudou;
- nenhum runtime financeiro, adapter, writer, deploy ou produção mudou.

## Revisão causal do SHA-256 da AST canônica

O recognizer seletivo anterior foi removido e substituído por:

1. parse integral do runner com Acorn;
2. canonicalização recursiva da AST;
3. remoção apenas de `start`, `end`, `loc`, `range` e `raw`;
4. ordenação determinística de chaves de objetos, preservando ordem de arrays;
5. SHA-256 do JSON canônico;
6. comparação exata com `HERMETIC_REPLAY_CANONICAL_AST_SHA256`.

O hash esperado é:

`00e18c3734a593b432ac0335af43353a189132513b4c0107aa825abcecbcf0be`

Quando o hash diverge, o runner recebe simultaneamente `invalid_hermetic_loader_contract` e `unclassified_module_loader`; os identificadores `Module`/`originalLoad`, membros `_load` e o `require('node:module')` só entram nas WeakSets de exceção quando a AST integral coincide com o contrato.

### 1. Remoção/alteração dos 13 `BLOCKED_MODULES`

FECHADO.

O runner contém exatamente 13 specifiers:

`http`, `node:http`, `https`, `node:https`, `net`, `node:net`, `tls`, `node:tls`, `dns`, `node:dns`, `dgram`, `node:dgram`, `undici`.

Esses literais pertencem à AST integral. Remover, trocar, adicionar ou reordenar um elemento altera a AST canônica e invalida o hash. O teste gera uma mutação independente removendo cada um dos 13 specifiers e exige RED do analisador.

Uma mudança apenas na grafia lexical que produza o mesmo valor JavaScript, por exemplo um escape equivalente dentro de uma string, pode preservar a AST canônica porque `raw` é omitido; isso não altera o valor inserido no Set e, portanto, não constitui falso verde semântico para a lista bloqueada.

### 2. Captura, instalação, forwarding, `try`/execução/`finally` e restauração

FECHADO.

A AST integral inclui toda a ordem do corpo de `runHermeticReplay`, inclusive:

- `activeReplay = true`;
- captura de `Module._load` em `originalLoad`;
- captura/restauração de `fetch`;
- instalação de `Module._load = function hermeticLoad(...)`;
- teste contra `BLOCKED_MODULES`;
- forwarding `originalLoad.call(this, request, parent, isMain)`;
- `try { return await execution(); } finally { ... }`;
- restauração de `Module._load`;
- restauração/remoção de `globalThis.fetch`;
- `activeReplay = false`.

Qualquer mudança executável ou reordenação nesses nós altera a AST canônica. A suíte acrescenta mutações explícitas para execução fora da região protegida, instalação depois do `try` e captura de `originalLoad` depois da instalação; todas são exigidas como inválidas.

### 3. Uso adicional de `Module._load` ou `originalLoad`

FECHADO.

Como a liberação de usos especiais só ocorre depois do match do SHA-256 integral, adicionar qualquer novo acesso/call/alias de `_load` ou `originalLoad` muda a AST e invalida o contrato antes que as WeakSets possam autorizá-lo. Os negativos existentes ainda exercitam `_load` direto/computado, alias, `apply`, `Reflect.apply`, forwarding duplicado e mutação dos argumentos.

### 4. Divergência entre AST medida e contrato congelado

FECHADO.

A medida é calculada diretamente da AST do arquivo lido no tree `src/next`; o inventário exato de `src/next` permanece separado e fail-closed, e o runner é um path esperado obrigatório. A constante normativa está no policy e o validator reporta o hash observado.

O desenho não é uma fronteira contra um mantenedor que edite simultaneamente runtime e constante do validator; nenhum validator versionado no mesmo repositório oferece essa propriedade sozinho. Para o gate de regressão auditado, entretanto, isso não gera falso verde neste delta: o runtime ficou byte-idêntico ao parent e a própria mudança da policy está no diff submetido à auditoria independente.

### 5. Elementos omitidos pela canonicalização

NÃO HÁ ROTA CAUSAL DE FALSO VERDE NO RUNNER ATUAL.

São omitidos somente metadados posicionais (`start`, `end`, `loc`, `range`) e `raw` lexical. Comentários/formatação também não pertencem à AST. Para o runner atual, os valores e estruturas executáveis relevantes permanecem representados na AST canonicalizada.

`raw` pode ser semanticamente observável em construções JavaScript específicas fora deste runner, por exemplo source introspection e certos cenários de template literal/tagged template. O runner auditado não contém essas construções. Introduzir uma nova construção estrutural desse tipo alteraria a AST e faria o hash falhar até uma revisão deliberada da constante. Portanto isso é uma ressalva de manutenção futura, não uma rota concreta de falso verde do candidato atual.

## Testes focais do delta

A revisão estática confirmou que `tests/next/validatorGate.cases.js`:

- remove individualmente todos os 13 `BLOCKED_MODULES`;
- testa restauração/execução fora de ordem;
- testa instalação tardia;
- testa captura de `originalLoad` depois da instalação;
- testa `_load` direto e computado;
- testa forwarding alterado, `apply`, `Reflect.apply`, forwarding duplicado e mutação dos argumentos;
- exige que o runner original resulte em zero erros e no SHA esperado.

Esses casos são causais para a propriedade do hash integral, e não simples substring checks.

## Resultados relatados versus evidência observada

Os documentos do candidato relatam, entre outros:

- validator/bateria afetada verde;
- `npm test` com `1.929` testes, `1.919 PASS`, `0 FAIL`, `10 SKIP`, `0 TODO`;
- coverage de linhas `91,83%`, branches `75,13%`, funções `91,27%`;
- `hermetic_replay_ast_sha256=00e18c...`.

Nesta auditoria esses números são tratados como evidência relatada pelo candidato. Não havia status checks nem workflow runs vinculados ao SHA no GitHub, e esta revisão não reexecutou a suíte local. O parecer abaixo se apoia na leitura integral do código/testes/diff e na coerência causal da solução, não na autoridade dessas contagens.

## Findings

### CRITICAL

Nenhum.

### HIGH

Nenhum.

### MEDIUM

Nenhum.

### LOW

Nenhum finding funcional para este delta.

### Nota de manutenção — não finding

O hash de AST integral é deliberadamente rígido. Mudanças semanticamente neutras que alterem a forma da AST, ou uma futura atualização do Acorn que altere o shape produzido para a mesma fonte, podem gerar falso RED e exigir atualização auditada da constante. Isso aumenta custo de manutenção, mas é fail-closed e não cria falso verde. A rigidez é aceitável para um runner pequeno e congelado neste gate.

## Veredito

APROVÁVEL

Este parecer fecha a reauditoria focal do delta `ccff4711... -> 9b0cfd...` quanto à substituição pelo SHA-256 da AST canônica integral. Não autoriza NEXT-02, deploy ou produção.
