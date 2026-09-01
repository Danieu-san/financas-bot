# Workstream — FinançasBot Next / NEXT-01

Atualizado em: 2026-09-01
Status: `OPEN — CHARTER CRIADO; IMPLEMENTAÇÃO AINDA NÃO INICIADA`

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
- charter NEXT-01 criado;
- nenhuma implementação funcional NEXT-01 iniciada;
- primeira obrigação: reaproveitamento seletivo, nunca greenfield automático;
- candidatos prioritários: `AST-01`, `AST-02`, `AST-03`, `AST-04`, `AST-11`,
  `AST-12`, `AST-13`, `AST-15` e capacidades relacionadas ao esqueleto;
- `DNP-01..DNP-12` permanecem proibidos.

## Critério de saída

Conversa sintética e follow-up versionado operam em runner hermético, falhas são
fechadas, ledger inicia vazio, zero writer/rede é demonstrado e todo ativo v1
reutilizado possui contrato e teste de conformidade. O SHA final precisa de
auditoria independente antes de GO.

## Próxima ação exata

Ler somente os candidatos v1 apontados pelo inventário, desenhar a topologia de
módulos e registrar `PORT_AS_IS | WRAP | ADAPT | EXTRACT_BEHAVIOR | REWRITE |
DEFER | DO_NOT_PORT` com evidência. Depois criar os REDs focais do gateway,
sessão e replay, sem adapter ou writer real.

## Referências

- `docs/plans/workstreams/financasbot-next-01.md`;
- `docs/plans/workstreams/financasbot-next-00.md`;
- `docs/plans/workstreams/financasbot-next-00-inventory-v1.md`;
- `docs/contracts/next/`;
- `docs/contracts/next/capability-cutover-matrix-v0.md`;
- `docs/plans/workstreams/financasbot-next-roadmap-draft-v2.md`;
- `docs/decisions/ADR-002-admin-financial-data-access.md`.
