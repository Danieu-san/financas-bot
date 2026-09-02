# NEXT-01 — Validação final local v1

Atualizado em: 2026-09-01
Base: `0b988e7d51544dbc02942b237b0d58d12b9af264`
Estado: `CANDIDATO REAUDITADO E CORRIGIDO LOCAL VERDE — NOVA REAUDITORIA INDEPENDENTE PENDENTE`

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
adversarial local, o entrypoint focal executou `25/25 PASS`, zero skip.

Após a auditoria independente do SHA `4ba43ef5e3a68195e3b996b163bed9f4be35995f`,
foram adicionadas sete propriedades causais para fechar os dois HIGH, três
MEDIUM e um LOW encontrados, sem novo subsistema:

- boundary recursiva e schema declarativo dos argumentos no Tool Gateway;
- `period.type` vinculado ao contrato de rota e ao claim esperado;
- observabilidade limitada a enums/códigos conhecidos e tools autorizadas;
- análise fail-closed de todos os imports estáticos de `src/next/`, com carga
  dinâmica e dependência externa ao Next proibidas;
- prova de zero capability externa em todo o grafo Next;
- IDs estáveis para as 25 propriedades focais, em vez de contagem de `test()`;
- binding final obrigatório a HEAD, parent único, árvore limpa e arquivos
  tracked, incluindo detecção de paths ignorados no escopo.

A reauditoria do SHA `3733ba57e8c9684e5d539ec8da4eb04f03445dd1`
confirmou as correções anteriores e encontrou uma lacuna HIGH no domínio do
analisador, uma MEDIUM no vínculo entre property ID e execução, e uma LOW no
container de argumentos. O candidato seguinte fechou essas três classes sem
ampliar o runtime:

- o inventário de fontes executáveis é uma igualdade de paths e inclui
  `.js`, `.mjs` e `.cjs`; fonte extra falha fechado;
- imports e loaders são analisados pela AST com Acorn, imports relativos são
  resolvidos por `realpath` dentro de `src/next/`, e mecanismos não
  classificados ou capabilities dinâmicas falham fechado; os únicos imports
  externos permitidos também exigem binding AST exato;
- os 25 property IDs são ligados à execução focal, em vez de comentários ou
  tokens presentes no source;
- somente ausência de `request.args` vira `{}`; `null`, falsy, array, `Date` e
  instância de classe falham antes de budget e adapter.

A reauditoria do SHA `d5f4a49543221ba962a4b4473e5909d5ed51f47c`
confirmou a correção do container de argumentos e encontrou duas lacunas no
gate: a exceção ampla de `Module._load` podia ocultar outro loader, e linhas TAP
com `SKIP` ou `TODO` ainda podiam ser confundidas com property aprovada. O novo
candidato fecha as classes, sem acrescentar runtime ou dependência:

- o tree inteiro de `src/next/` é inventariado, sem filtro por extensão, e deve
  coincidir exatamente com os 11 arquivos esperados; arquivo, symlink ou target
  relativo fora do inventário falha fechado;
- o único loader dinâmico permitido é o forwarder do replay hermético,
  reconhecido por contrato AST fechado: binding, captura, instalação, corpo,
  único forwarding e restauração precisam coincidir estruturalmente;
- acessos diretos ou computados a `_load`, aliases, `.apply`, `Reflect.apply`,
  forwarding alterado ou duplicado e mutação dos argumentos são rejeitados;
- os 25 property IDs são derivados dos eventos estruturados da mesma execução
  `node:test`; `skip`, `todo`, falha, suite, nesting, arquivo divergente,
  duplicidade e ID inesperado falham fechado;
- TAP é somente a projeção diagnóstica humana da mesma execução e nunca alimenta
  a decisão do gate.

O validador documental/estrutural reporta:

- `required_files=29`;
- `source_tree_entries=11`;
- `source_files=11`;
- `focal_tests=25/25`;
- `focal_test_events=25`;
- `focal_failures=0`;
- `focal_skipped=0`;
- `focal_todo=0`;
- `property_ids=25/25`;
- `required_tracked=29/29` no candidato commitado;
- `runtime_v1_imports=0`;
- `classified_static_module_loads=8`;
- `classified_hermetic_runtime_loaders=1`;
- `unclassified_module_loaders=0`;
- `forbidden_effect_capabilities=0`.

O gate não infere “zero writer” de uma regex nominal. A evidência é composta:
todo import relativo resolve para o tree inventariado de `src/next/`, carga
dinâmica não classificada é proibida, imports/capabilities externas são
fail-closed e a interface do ledger vazio é testada sem método de mutação. O
forwarder hermético é contabilizado explicitamente; não é apresentado como
ausência de loader dinâmico.

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

A bateria afetada do novo candidato, combinando NEXT-01, watcher e Open Finance,
terminou em `55/55 PASS`. A bateria anterior de estabilização do baseline havia
terminado em `64/64 PASS`.

## 5. Suíte hermética ampla final

Comando: `npm test`

Resultado observado uma única vez após estabilização desta correção causal:

- duração: `716.660 ms`;
- arquivos descobertos: `176`;
- entrypoints executados: `158`;
- testes: `1.929`;
- passes: `1.919`;
- falhas: `0`;
- skips: `10`, todos na allowlist esperada;
- todo: `0`;
- line coverage: `91,84%`;
- branch coverage: `75,13%`;
- function coverage: `91,28%`;
- runner: `valid=true`, sem razão de invalidação;
- rede: bloqueada para fetch/http/https/net e descendentes Node;
- subprocessos: bloqueados, exceto Git/Tar locais em operações auditadas.

A suíte ampla verde não foi repetida depois dessa execução porque não houve
mudança causal de código ou teste; somente este relatório e o estado do
workstream foram atualizados.

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
