# Workstream — FinançasBot Next / NEXT-00

Atualizado em: 2026-08-30
Status: `NEXT00-02 COMPLETE; NEXT00-03 READY; ZERO IMPLEMENTAÇÃO FUNCIONAL`

## Objetivo ativo

Produzir os contratos, o inventário, a taxonomia, a matriz de capacidades e o
Golden Set sanitizado exigidos pelo roadmap ratificado antes de NEXT-01.

## Git e isolamento

- branch: `codex/financasbot-next-00`;
- worktree: `financasbot-next-00-worktree`;
- base: `fc577e5d5e21fdc5402ace1cf662a6ea1bef255f`;
- roadmap normativo imutável:
  `911af93343210ccfe2d7b7fe0b898542044a1fdf`;
- bot legado, produção, dados e credenciais permanecem intocados.

## Estado vigente

- Chat e Claude: `APROVÁVEL` no mesmo hash do roadmap;
- Daniel confirmou o roadmap e autorizou abrir NEXT-00;
- ratificação e charter materializados;
- inventário estático e taxonomia concluídos em `financasbot-next-00-inventory-v1.md`;
- 30 capacidades, 15 ativos reaproveitáveis e 12 itens `DO_NOT_PORT` classificados;
- contratos 1 a 4 congelados e validados de forma cruzada;
- schemas mínimos de observação/evento, lease, sessão/proposta e envelope do
  modelo materializados;
- TTL de proposta fixado em 10 minutos, máximo de 30, e retenção de provider
  limitada a 30 dias com treinamento desabilitado;
- Golden Set ainda não foi produzido;
- nenhuma implementação funcional foi iniciada.

## Gate ativo

`NEXT00-03 — INTEGRAÇÕES, CAPACIDADES, ORÇAMENTO E RETENÇÃO` — pronto para
abertura.

### Resultado de NEXT00-02

- `SourceObservation -> CanonicalFinancialEvent -> Projection` congelado como
  direção única, com anti-realimentação e invariantes de dupla contagem;
- single writer/notifier/scheduler/cursor por família e capability, protegido
  por lease, fencing token e epoch;
- sessão monotônica, proposta imutável, preview entregue, CAS, TTL, receipt e
  reconciliação definidos;
- fronteira do modelo por allowlist, scope server-side, retenção máxima,
  treinamento desabilitado e fail-closed;
- 21 testes documentais negativos indexados, além dos casos obrigatórios de
  cada contrato;
- nenhuma consulta externa ou alteração funcional realizada.

## Critério de saída da fatia

Critério satisfeito: quatro contratos versionados, schemas mínimos, estados,
transições, testes negativos e revisão cruzada sem contradição material.
`GO DOCUMENTAL PARA NEXT00-03`.

## Próxima ação exata

Abrir NEXT00-03 e produzir Integration Capability Manifest, Capability and
Cutover Matrix, Tool Budget and Failure Policy e Quality, Stability and
Retention Contract, sem implementar runtime.

## Referências

- `docs/plans/workstreams/financasbot-next-00.md`;
- `docs/plans/workstreams/financasbot-next-00-inventory-v1.md`;
- `docs/plans/workstreams/financasbot-next-00-contracts-1-4-validation-v1.md`;
- `docs/contracts/next/data-authority-contract-v0.md`;
- `docs/contracts/next/coexistence-single-writer-contract-v0.md`;
- `docs/contracts/next/conversation-proposal-contract-v0.md`;
- `docs/contracts/next/model-data-boundary-contract-v0.md`;
- `docs/plans/workstreams/financasbot-next-roadmap-ratification-v1.md`;
- `docs/plans/workstreams/financasbot-next-roadmap-draft-v2.md`;
- `docs/agent-memory/architecture-map.md`.

