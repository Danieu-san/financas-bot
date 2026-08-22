# Revisão da arquitetura conversacional financeira

Atualizado em: 2026-08-22

## Estado

`ARQ-01 GO TÉCNICO LOCAL — ARQ-02 AUTORIZADO`.

## Objetivo

Reconstruir os erros recorrentes do caminho conversacional, confrontá-los com o
código e obter duas opiniões externas independentes antes de decidir uma nova
arquitetura.

## Base e worktree

- base: `efc762deaa031dab691e9328b7cbf0d2b88caaf8`;
- branch: `codex/interpreter-architecture-review-20260821`;
- worktree isolada: `.codex-worktrees/interpreter-architecture-review-20260821`.

## Invariantes

- zero mudança de runtime, flags, dados ou produção;
- nenhum segredo ou valor financeiro real no Git ou nos prompts;
- Chat e Claude recebem o mesmo commit e as mesmas perguntas;
- pareceres são consultivos e não autorizam implementação.

## Evidência principal

- dossiê: `docs/audit/293-financial-conversation-architecture-multi-review-candidate-2026-08-21.md`;
- benchmark sanitizado: `docs/audit/293-financial-interpreter-gpt-benchmark-evidence-2026-08-21.json`;
- parecer Claude parcial: `docs/audit/294-claude-opus-5-financial-conversation-architecture-review-2026-08-22.md`;
- parecer Chat integral: `docs/audit/295-chatgpt-financial-conversation-architecture-review-2026-08-22.md`;
- consolidação: `docs/audit/296-financial-conversation-architecture-multi-review-consolidation-2026-08-22.md`.

## Decisão recomendada

Reaproveitar LangGraph e o kernel financeiro, mas substituir o pipeline linear
por agente read-only limitado a duas ou três tools semânticas. Escopo, fonte,
matemática e toda escrita continuam determinísticos.

## Implementação ARQ-01

- worktree: `.codex-worktrees/financial-agent-arq01-20260822`;
- branch: `codex/financial-agent-arq01-20260822`;
- base: `ade123e921837a683ec5989d7cb768e5f1dcbf87`;
- contrato, evidência, recoveries e fechamento: documentos 297 a 300;
- checkpoint v2 passa a representar o plano realmente executado;
- evidência do segundo recovery: focal `9/9`, agente `87/87`, baseline `265/265` e
  críticos `15/15`;
- suíte ampla final: `1.756/1.766` aprovados, `0` falhas e `10` ignorados;
- a instabilidade temporal preexistente de Open Finance foi isolada no commit
  test-only `5108ace`, validado focalmente em `15/15` antes da suíte ampla;
- zero flag, deploy, produção ou escrita financeira.

## Próxima ação exata

Iniciar ARQ-02 sem habilitar flag, canário, writer, deploy ou retirada do
legado; definir o contrato causal exato antes de editar produto.
