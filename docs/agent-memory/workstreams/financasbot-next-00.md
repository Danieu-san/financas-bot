# Workstream — FinançasBot Next / NEXT-00

Atualizado em: 2026-08-30
Status: `NEXT00-04 COMPLETE; NEXT00-05 READY; ZERO IMPLEMENTAÇÃO FUNCIONAL`

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
- contratos 5 a 8 congelados e validados de forma cruzada;
- nove manifests desativados, com zero `write_enabled` ativo;
- 30/30 capacidades classificadas: 13 slices beta, 11 cutover, 6 retirement
  e 2 pós-MVP;
- Tool Budget fixado em 6/12 calls, repetição máxima 2 e trajetória de 30 s;
- qualidade/estabilidade fixadas em 7/14 dias, volumes mínimos, custo máximo
  de US$0.05, RPO/RTO, rollback, backup e retenção numéricos;
- Golden Set v1 produzido com 48 conversas sintéticas: 16 simples, 16 multi-tool,
  8 follow-ups e 8 negativas;
- 14 dimensões críticas cobertas por ao menos três casos e 67/67 testes
  documentais rastreados;
- nenhuma implementação funcional foi iniciada.

## Gate ativo

`NEXT00-05 — COERÊNCIA E AUDITORIA FINAL` — pronto para abertura.

### Resultado de NEXT00-04

- fixture financeira inteiramente sintética com relógio fixo em 2042;
- 48 conversas: `16/16/8/8`, todas com claims, proibições e tools read-only esperadas;
- dimensões críticas cobertas entre 3 e 26 casos cada;
- referências contratuais completas: `67/67`, sem ID desconhecido;
- validador focal verde para estrutura, cobertura, fixtures, sanitização e allowlist;
- nenhum runtime, integração, dado real, segredo, writer ou produção acessado.

## Critério de saída da fatia

Critério satisfeito: volume e distribuição exatos, cobertura mínima integral,
fixtures resolvidas e sintéticas, rastreabilidade completa e validação focal
verde. `GO DOCUMENTAL PARA NEXT00-05`.

## Próxima ação exata

Abrir NEXT00-05 para revisão de coerência cruzada, validação ampla única do
workflow, commit sanitizado e auditoria independente por hash. Nenhuma
implementação funcional ou abertura de NEXT-01 está autorizada.

## Referências

- `docs/plans/workstreams/financasbot-next-00.md`;
- `docs/plans/workstreams/financasbot-next-00-inventory-v1.md`;
- `docs/plans/workstreams/financasbot-next-00-contracts-1-4-validation-v1.md`;
- `docs/contracts/next/data-authority-contract-v0.md`;
- `docs/contracts/next/coexistence-single-writer-contract-v0.md`;
- `docs/contracts/next/conversation-proposal-contract-v0.md`;
- `docs/contracts/next/model-data-boundary-contract-v0.md`;
- `docs/plans/workstreams/financasbot-next-00-contracts-5-8-validation-v1.md`;
- `docs/contracts/next/integration-capability-manifest-v0.md`;
- `docs/contracts/next/capability-cutover-matrix-v0.md`;
- `docs/contracts/next/tool-budget-failure-policy-v0.md`;
- `docs/contracts/next/quality-stability-retention-contract-v0.md`;
- `docs/plans/workstreams/financasbot-next-00-golden-set-v1-validation.md`;
- `tests/fixtures/financasbot-next/golden-financial-fixture-v1.json`;
- `tests/fixtures/financasbot-next/golden-conversation-set-v1.json`;
- `docs/plans/workstreams/financasbot-next-roadmap-ratification-v1.md`;
- `docs/plans/workstreams/financasbot-next-roadmap-draft-v2.md`;
- `docs/agent-memory/architecture-map.md`.
