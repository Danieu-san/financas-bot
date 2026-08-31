# Workstream — FinançasBot Next / NEXT-00

Atualizado em: 2026-08-30
Status: `NEXT00-05 AUDIT CORRECTION + BROAD PASS; REAUDIT PENDING; ZERO IMPLEMENTAÇÃO FUNCIONAL`

## Objetivo ativo

Congelar contratos, inventário, matriz, fixtures e critérios objetivos antes de
NEXT-01, sem criar runtime funcional.

## Git e isolamento

- branch: `codex/financasbot-next-00`;
- worktree: `financasbot-next-00-worktree`;
- base: `fc577e5d5e21fdc5402ace1cf662a6ea1bef255f`;
- roadmap normativo: `911af93343210ccfe2d7b7fe0b898542044a1fdf`;
- candidato auditado anterior: `9935e497e4a688686f21f5bd351eba04449bd40e`;
- bot legado, produção, dados e credenciais permanecem intocados.

## Estado vigente

- roadmap aprovado por Chat e Claude e explicitamente confirmado por Daniel;
- 30 capacidades, 15 ativos reaproveitáveis e 12 itens `DO_NOT_PORT`;
- oito contratos congelados e nove manifests sem `write_enabled`;
- matriz: 32 slices para 30 capacidades, tiers `13/11/6/2`;
- Tool Budget e Quality/Stability/Retention possuem limiares numéricos;
- Golden Set: 48 casos, 56 turnos, distribuição `16/16/8/8` e 14 dimensões;
- oracle factual tipado: 56/56 turnos, sendo 44 materializados e 12 respostas
  fail-closed;
- 67/67 IDs extraídos dos oito contratos primários e classificados pela policy
  `causal-trace-v2`;
- nenhuma implementação funcional foi iniciada.

## Auditoria do candidato anterior

- Claude: `APROVÁVEL`;
- Chat: `APROVÁVEL APÓS AJUSTES`;
- H1 foi reproduzido: várias perguntas quantitativas não congelavam valores;
- H2 foi reproduzido: `67/67` media cardinalidade, não causalidade suficiente;
- findings de constantes independentes, vocabulário e sanitização também foram
  confirmados como riscos de falso verde futuro;
- arquitetura central permaneceu válida e não foi reaberta.

Resolução: `docs/plans/workstreams/financasbot-next-00-audit-resolution-v1.md`.

## Gate ativo

`NEXT00-05 — COERÊNCIA E AUDITORIA FINAL` — correção local verde; candidato
imutável substituto ainda não publicado.

### Evidência focal vigente

- `NEXT-00 DOCUMENTAL: PASS`;
- `required_files=24`;
- inventário `30/15/12`;
- manifests `9`, write ativo `0`;
- matriz `32/30`, tiers `13/11/6/2`;
- contract tests `67/67`, fonte `primary_contracts`;
- zero caminho de runtime;
- Golden Set `48 casos/56 turnos`, `16/16/8/8`;
- oracles `56`, dispositions `44/6/2/3/1`;
- rastreabilidade `67/67`, policy `causal-trace-v2`;
- ensaio de mutação do validador: baseline verde e `7/7` alterações causais em RED.

## Critério de saída da fatia

Ainda não satisfeito. A validação ampla única está verde; faltam novo SHA
sanitizado publicado e reauditoria independente sem lacuna indispensável. Estado máximo: `CANDIDATO AGUARDANDO REAUDITORIA`.

## Próxima ação exata

Executar o focal final após o registro documental, conferir o diff staged,
publicar o novo SHA sanitizado e pedir reauditoria independente. NEXT-01 permanece fechado.

## Referências

- `docs/plans/workstreams/financasbot-next-00.md`;
- `docs/plans/workstreams/financasbot-next-00-inventory-v1.md`;
- `docs/plans/workstreams/financasbot-next-00-audit-resolution-v1.md`;
- `docs/plans/workstreams/financasbot-next-00-golden-set-v1-validation.md`;
- `docs/plans/workstreams/financasbot-next-00-final-validation-v1.md`;
- `docs/contracts/next/`;
- `tests/fixtures/financasbot-next/golden-financial-fixture-v1.json`;
- `tests/fixtures/financasbot-next/golden-conversation-set-v1.json`;
- `tests/fixtures/financasbot-next/golden-claim-oracles-v1.json`;
- `scripts/agent/validateFinancasBotNextGoldenSet.mjs`;
- `scripts/agent/validateFinancasBotNext00.mjs`;
- `docs/plans/workstreams/financasbot-next-roadmap-ratification-v1.md`;
- `docs/plans/workstreams/financasbot-next-roadmap-draft-v2.md`.
