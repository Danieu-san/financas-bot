# NEXT-01 — Validação final local v1

Atualizado em: 2026-09-01
Base: `0b988e7d51544dbc02942b237b0d58d12b9af264`
Estado: `CANDIDATO LOCAL VERDE — AUDITORIA INDEPENDENTE PENDENTE`

## 1. Escopo validado

O candidato implementa somente o esqueleto isolado e read-only do Next sob
`src/next/`: contratos mínimos, sessão em memória com CAS, gateway de tools
read-only, ledger vazio, budget fail-closed, verificação de claims tipados,
observabilidade sanitizada, replay sintético e manifesto executável de
reaproveitamento.

Não existem adapters reais, modelo remoto, fonte financeira, writer, scheduler,
notificação, deploy ou acesso a produção. Nenhum módulo de runtime v1 é importado
por `src/next/`.

## 2. Reaproveitamento do v1

O v1 não foi descartado. A inspeção de caracterização ficou verde em `82/82` e
as decisões foram congeladas por ativo:

- `AST-01` e `AST-02`: `ADAPT`;
- `AST-03` e `AST-15`: `EXTRACT_BEHAVIOR`;
- `AST-04`: `DEFER` para NEXT-02;
- `AST-11`, `AST-12` e `AST-13`: `PORT_AS_IS` somente como fixture ou política
  sem autoridade executável.

Nenhum runtime legado recebeu `PORT_AS_IS`. O relatório causal completo está em
`financasbot-next-01-topology-reuse-v1.md`.

## 3. RED e bateria focal

O primeiro lote executou `9/9 RED`, todos pela ausência esperada das fronteiras
Next, sem falha incidental. Depois da implementação mínima e da revisão
adversarial local, o entrypoint focal executou `18/18 PASS`, zero skip.

O validador documental/estrutural reporta:

- `required_files=25`;
- `source_files=11`;
- `focal_tests=18/18`;
- `runtime_v1_imports=0`;
- `writer_capabilities=0`.

## 4. Correções do baseline amplo

A primeira suíte ampla encontrou oito falhas. Uma era a ausência do entrypoint
raiz para os novos módulos de casos. As outras sete pertenciam a testes
legados, mas foram corrigidas porque o critério do gate exige base ampla verde e
Daniel autorizou explicitamente sanar o baseline.

### Open Finance

Fixtures datadas de julho de 2026 injetavam relógio somente na criação inicial;
stores reabertos usavam o relógio real e expiravam propostas em setembro. A
correção completou a injeção determinística pela dependência já suportada e
passou `now` explícito ao binding temporal. Nenhum arquivo de runtime Open
Finance foi alterado.

### Watcher e tripwire

Três testes do watcher chamavam `git` de modo permitido isoladamente, mas eram
corretamente bloqueados pelo tripwire da suíte hermética. A fixture passou a:

- viver diretamente sob `EXHAUSTIVE_AUDIT_TEMP_ROOT`;
- usar somente `EXHAUSTIVE_LOCAL_GIT_PATH` quando presente;
- permitir, exclusivamente nessa raiz controlada, `git init -q`,
  `git add .gitignore` e `git ls-files -z --others --ignored
  --exclude-standard`.

Não foi liberado shell, rede, Git genérico, path externo ou comando remoto. O
teste passou tanto isolado quanto sob o mesmo tripwire hermético da suíte ampla.

A bateria combinada de NEXT-01, inventário, runner, watcher e Open Finance
terminou em `64/64 PASS`.

## 5. Suíte hermética ampla final

Comando: `npm test`

Resultado observado uma única vez após estabilização do candidato:

- duração: `734.213 ms`;
- arquivos descobertos: `176`;
- entrypoints executados: `158`;
- testes: `1.922`;
- passes: `1.912`;
- falhas: `0`;
- skips: `10`, todos na allowlist esperada;
- todo: `0`;
- line coverage: `91,81%`;
- branch coverage: `75,03%`;
- function coverage: `91,26%`;
- runner: `valid=true`, sem razão de invalidação;
- rede: bloqueada para fetch/http/https/net e descendentes Node;
- subprocessos: bloqueados, exceto Git/Tar locais em operações auditadas.

A suíte ampla verde não foi repetida porque não houve mudança causal de código
ou teste após essa execução; somente este relatório e o estado do workstream
foram atualizados.

## 6. Limites da evidência

Esta validação prova o esqueleto sintético, as boundaries locais e a ausência de
regressão na suíte hermética disponível. Ela não prova adapters, banco real,
WhatsApp, Pluggy, Google, modelo remoto, concorrência distribuída, deploy ou
produção, todos fora do escopo de NEXT-01.

O tripwire do replay Next é uma proteção em processo para o grafo atual; ele não
é apresentado como sandbox do sistema operacional. A suíte ampla adiciona sua
própria proteção hermética de subprocesso e rede.

## 7. Estado

O candidato local satisfaz os critérios executáveis conhecidos, mas NEXT-01
permanece aberto até commit sanitizado imutável, publicação no GitHub, auditoria
independente do Chat e decisão humana explícita. NEXT-02 permanece fechado.
