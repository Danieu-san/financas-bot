# Workstream — FinançasBot Next / NEXT-00

Atualizado em: 2026-08-30
Status: `NEXT00-03 COMPLETE; NEXT00-04 READY; ZERO IMPLEMENTAÇÃO FUNCIONAL`

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
- Golden Set ainda não foi produzido;
- nenhuma implementação funcional foi iniciada.

## Gate ativo

`NEXT00-04 — GOLDEN CONVERSATION SET V1` — pronto para abertura.

### Resultado de NEXT00-03

- manifests v0 para WhatsApp, Google OAuth/Sheets/Drive/Calendar, Pluggy, modelo,
  áudio, dashboard e importação local, todos desativados;
- matriz consumer-preserving com beta read-only e bloqueios explícitos de
  cutover/retirement;
- falhas classificadas, sem fallback silencioso, retry cego ou aritmética do
  modelo;
- métricas de fato, efeito, latência, custo, disponibilidade, lease, RPO/RTO,
  rollback, backup, delete e restore com valores prévios ao teste;
- 46 testes documentais indexados; total acumulado dos contratos 1 a 8: 67;
- nenhuma consulta externa ou alteração funcional realizada.

## Critério de saída da fatia

Critério satisfeito: quatro contratos versionados, nove manifests sem writes,
30 capacidades classificadas, limiares numéricos e revisão cruzada sem
contradição material. `GO DOCUMENTAL PARA NEXT00-04`.

## Próxima ação exata

Abrir NEXT00-04 e construir o Golden Conversation Set v1 sanitizado com 48
conversas e cobertura mínima por dimensão, sem implementar runtime.

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
- `docs/plans/workstreams/financasbot-next-roadmap-ratification-v1.md`;
- `docs/plans/workstreams/financasbot-next-roadmap-draft-v2.md`;
- `docs/agent-memory/architecture-map.md`.

