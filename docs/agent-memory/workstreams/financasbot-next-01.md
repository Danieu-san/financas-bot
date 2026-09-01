# Workstream — FinançasBot Next / NEXT-01

Atualizado em: 2026-09-01
Status: `CANDIDATO REAUDITADO E CORRIGIDO — VALIDAÇÃO LOCAL VERDE; NOVA REAUDITORIA INDEPENDENTE PENDENTE`

## Objetivo ativo

Construir o esqueleto hermético e read-only do FinançasBot Next, começando por
mapear o que pode ser reaproveitado do v1 sob os contratos ratificados.

## Git e isolamento

- branch: `codex/financasbot-next-01`;
- worktree: `.codex-worktrees/financasbot-next-01`;
- base e predecessor auditado:
  `f8137f0396fcdf41b1a3e2535040f663c4ed171a`;
- roadmap normativo: `911af93343210ccfe2d7b7fe0b898542044a1fdf`;
- bot legado, produção, dados e credenciais permanecem intocados.

## Autorização e limites

- reauditoria final do NEXT-00: `APROVÁVEL`, zero findings;
- Daniel autorizou em 2026-09-01 fechar NEXT-00 e abrir NEXT-01;
- esta autorização abre o gate e seu trabalho local delimitado;
- não autoriza deploy, produção, adapters reais, dados reais ou writers;
- NEXT-02 permanece fechado.

## Estado vigente

- NEXT-00 fechado documentalmente;
- charter NEXT-01 criado e publicado;
- implementação funcional mínima isolada existe somente em `src/next/`;
- topologia mínima definida em `src/next/` e `tests/next/`, sem novo package;
- reaproveitamento seletivo classificado por evidência, nunca greenfield ou
  importação direta automáticos;
- candidatos prioritários: `AST-01`, `AST-02`, `AST-03`, `AST-04`, `AST-11`,
  `AST-12`, `AST-13`, `AST-15` e capacidades relacionadas ao esqueleto;
- `DNP-01..DNP-12` permanecem proibidos.
- caracterização focal do v1: `82/82` testes verdes;
- decisões principais: AST-01/02 `ADAPT`, AST-03/15 `EXTRACT_BEHAVIOR`, AST-04
  `DEFER`, AST-11/12/13 `PORT_AS_IS` somente como fixture/política.
- RED inicial: `0/9 PASS`, `9/9 RED`, todas por módulo/boundary Next ausente;
- execução focal vigente: `25/25 PASS`, zero skip, por IDs estáveis de
  propriedades;
- conversa inicial e follow-up passam pelo mesmo gateway read-only, restauram
  contexto versionado e usam CAS;
- policy de budget executa soft `6`, hard `12`, repetição `2`, timeout `30 s`,
  paralelismo `3`, rodadas `4`, esclarecimentos `2` e recomposição `1`;
- route contract fixa métrica e dimensões materiais; claim divergente de
  família, métrica, tipo/valor de período ou time basis falha fechado;
- sessão rejeita campos arbitrários e o gateway aplica schema declarativo e
  boundary recursiva aos argumentos antes do adapter, além de bloquear
  identidade aninhada em output permitido;
- ledger continua vazio e não expõe `write` nem `commit`;
- replay usa tripwire em processo contra `fetch` e módulos de rede; não é
  alegado como sandbox de rede do sistema operacional;
- nenhum adapter real, writer, modelo, fonte externa ou runtime v1 foi ligado.
- validador NEXT-01 exige `required_files=29`, `source_files=11`,
  `focal_tests=25/25`, `property_ids=25/25`, zero import do v1, zero carga
  não classificada e zero capability externa proibida; o conjunto de fontes é
  exato para `.js/.mjs/.cjs`, imports são analisados pela AST, os externos
  permitidos exigem binding exato e targets relativos precisam permanecer em
  `src/next/` também por `realpath`. A
  ausência de writer é provada em conjunto pelo closure e pela interface do
  ledger vazio, sem alegação nominal mais forte que a evidência. O PASS final é
  vinculado a HEAD, parent único, árvore limpa e arquivos tracked;
- property IDs são observados nas linhas TAP efetivamente aprovadas, não por
  presença lexical no source;
- container de argumentos fornecido precisa ser plain object; somente
  `undefined` representa ausência, e toda rejeição ocorre antes de budget e
  adapter;
- entrypoint da suíte ampla e inventário: `22/22 PASS` após registrar os três
  módulos de casos Next sem alterar o runner global;
- a primeira suíte ampla revelou uma integração de inventário e sete testes
  legados envelhecidos; Daniel autorizou corrigir o baseline sem waiver;
- fixtures Open Finance agora injetam o relógio deterministicamente em todas as
  reaberturas; o watcher usa somente Git local auditado em raiz temporária;
- bateria afetada pós-auditoria: `55/55 PASS`; bateria anterior de baseline:
  `64/64 PASS`;
- suíte hermética ampla pós-correção: `1.929` testes, `1.919 PASS`, `0 FAIL`, `10 SKIP`
  esperados, `0 TODO`;
- coverage final: linhas `91,80%`, branches `75,01%`, funções `91,25%`;
- nenhum runtime v1, adapter real, writer, fonte externa ou produção foi
  alterado; ajustes legados ficaram exclusivamente em testes e no tripwire do
  runner hermético.

## Critério de saída

Conversa sintética e follow-up versionado operam em runner hermético, falhas são
fechadas, ledger inicia vazio, zero writer/rede é demonstrado e todo ativo v1
reutilizado possui contrato e teste de conformidade. O SHA final precisa de
auditoria independente antes de GO.

## Próxima ação exata

Publicar o commit sanitizado imutável das correções e solicitar reauditoria
focal independente do Chat. Parar nesse ponto. Não fechar NEXT-01 nem abrir
NEXT-02 antes do parecer e da decisão humana explícita.

## Referências

- `docs/plans/workstreams/financasbot-next-01.md`;
- `docs/plans/workstreams/financasbot-next-01-topology-reuse-v1.md`;
- `docs/plans/workstreams/financasbot-next-01-final-validation-v1.md`;
- `docs/plans/workstreams/financasbot-next-00.md`;
- `docs/plans/workstreams/financasbot-next-00-inventory-v1.md`;
- `docs/contracts/next/`;
- `docs/contracts/next/capability-cutover-matrix-v0.md`;
- `docs/plans/workstreams/financasbot-next-roadmap-draft-v2.md`;
- `docs/decisions/ADR-002-admin-financial-data-access.md`.
