# Workstream — FinançasBot Next / NEXT-00

Atualizado em: 2026-08-31
Status: `DECLARATIVE REDESIGN LOCAL PASS; NEW SHA + REAUDIT PENDING; ZERO IMPLEMENTAÇÃO FUNCIONAL`

## Objetivo ativo

Fechar documentalmente os contratos, corpus e critérios do NEXT-00 sem criar
runtime funcional e sem abrir NEXT-01.

## Git e isolamento

- branch: `codex/financasbot-next-00`;
- worktree: `financasbot-next-00-worktree`;
- base: `fc577e5d5e21fdc5402ace1cf662a6ea1bef255f`;
- roadmap normativo: `911af93343210ccfe2d7b7fe0b898542044a1fdf`;
- candidato reavaliado: `831d0c35c1d12ad60f96989e19133c5b4630ec44`;
- bot legado, produção, dados e credenciais permanecem intocados.

## Estado vigente

- 30 capacidades, 15 ativos e 12 itens `DO_NOT_PORT`;
- oito contratos congelados e nove manifests sem write;
- matriz 32/30, tiers `13/11/6/2`;
- Golden Set com 48 casos, 56 turnos e 14 dimensões;
- 44 respostas materializadas com 76 fatos e 39 avaliadores causais;
- 12 respostas fail-closed;
- 67/67 IDs dos contratos primários sob `causal-trace-v2`;
- dois contratos numéricos integralmente pinados por SHA-256;
- bateria de propriedades em `685/685 RED` e estrutural em `11/11 RED`;
- nenhuma implementação funcional iniciada.

## Segunda reauditoria

- Claude: `APROVÁVEL`;
- Chat: `APROVÁVEL APÓS AJUSTES`;
- os três HIGH do Chat foram reproduzidos e corrigidos;
- M1, M2, M3 e o resíduo documental L2 foram incorporados ao mesmo ciclo;
- resolução: `financasbot-next-00-reaudit-resolution-v2.md`.

## Terceira reauditoria

- Chat: `APROVÁVEL APÓS AJUSTES` no hash `0beb543...`;
- o HIGH de causalidade dimensional, o MEDIUM da bateria insuficiente e o LOW
  de contagem autorreferencial foram confirmados e corrigidos;
- orçamento filtrado por membro recebeu identidade explícita;
- resolução: `financasbot-next-00-reaudit-resolution-v3.md`.

## Quarta reauditoria e trava anti-remendo

- Chat encontrou novas instâncias da mesma classe no hash `831d0c3...`;
- em vez de acrescentar novos casos, o validador imperativo por métrica foi
  removido;
- `AGENTS.md` e a skill de execução agora proíbem um terceiro remendo da mesma
  classe e exigem reavaliar a abstração;
- dimensões ficam no contrato declarativo `golden-fact-contracts-v1.json`;
- resolução: `financasbot-next-00-reaudit-resolution-v4.md`.

## Evidência focal vigente

- `NEXT-00 DOCUMENTAL: PASS`;
- `required_files=33`;
- inventário `30/15/12`;
- manifests `9`, write ativo `0`;
- matriz `32/30`, tiers `13/11/6/2`;
- contract tests `67/67`, fonte contratos primários;
- contratos congelados por SHA-256 `3/3`;
- Golden Set `48 casos/56 turnos/76 fatos/39 métricas`;
- propriedades: `608/608` dimensões, `76/76` valores e `1/1` relação;
- mutações estruturais: `11/11 RED`;
- suíte ampla única: `agent-workflow: OK` sobre 15 entradas staged;
- zero caminho de runtime.

## Critério de saída

Ainda não satisfeito. Faltam novo SHA sanitizado publicado e reauditoria independente sem lacuna
indispensável. Estado máximo: `CANDIDATO AGUARDANDO REAUDITORIA`.

## Próxima ação exata

Revisar o diff staged, publicar novo SHA e pedir reauditoria. NEXT-01 permanece
fechado.

## Referências

- `docs/plans/workstreams/financasbot-next-00.md`;
- `docs/plans/workstreams/financasbot-next-00-reaudit-resolution-v2.md`;
- `docs/plans/workstreams/financasbot-next-00-reaudit-resolution-v3.md`;
- `docs/plans/workstreams/financasbot-next-00-reaudit-resolution-v4.md`;
- `docs/plans/workstreams/financasbot-next-00-golden-set-v1-validation.md`;
- `docs/plans/workstreams/financasbot-next-00-final-validation-v1.md`;
- `docs/contracts/next/`;
- `tests/fixtures/financasbot-next/`;
- `scripts/agent/validateFinancasBotNext00.mjs`;
- `scripts/agent/validateFinancasBotNextGoldenSet.mjs`;
- `scripts/agent/validateFinancasBotNextFacts.mjs`;
- `scripts/agent/validateFinancasBotNextContractHashes.mjs`.
