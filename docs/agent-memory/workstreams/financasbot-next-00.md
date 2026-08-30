# Workstream — FinançasBot Next / NEXT-00

Atualizado em: 2026-08-30
Status: `NEXT00-05 LOCAL PASS; AWAITING INDEPENDENT AUDIT; ZERO IMPLEMENTAÇÃO FUNCIONAL`

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

`NEXT00-05 — COERÊNCIA E AUDITORIA FINAL` — candidato local; aguardando auditoria independente.

### Resultado local de NEXT00-05

- revisão adversarial das fronteiras de autoridade, single-writer, proposta/CAS,
  Model Data Boundary, dashboard e bloqueio de NEXT-01 sem contradição material;
- validador documental final verde: 18 arquivos, inventário 30/15/12, nove
  manifests sem write, matriz 32/30, 67/67 testes e zero caminho de runtime;
- Golden Set permanece verde em 48/48, distribuição 16/16/8/8, 14 dimensões e
  rastreabilidade causal 67/67;
- nenhuma integração, dado real, segredo, runtime, writer ou produção acessado;
- validação ampla do workflow ainda deve ser executada uma única vez sobre o
  candidato staged antes do commit auditável.

## Critério de saída da fatia

Ainda não satisfeito: a evidência local está verde, mas faltam a validação ampla
única, o hash imutável publicado e o parecer independente. Estado máximo:
`CANDIDATO AGUARDANDO AUDITORIA`.

## Próxima ação exata

Executar uma única validação ampla do workflow no candidato estável, publicar o
commit sanitizado e submeter o hash à auditoria independente. NEXT-01 permanece
fechado e depende de parecer sem lacuna indispensável e decisão explícita de
Daniel.
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
- `docs/plans/workstreams/financasbot-next-00-final-validation-v1.md`;
- `scripts/agent/validateFinancasBotNext00.mjs`;
- `tests/fixtures/financasbot-next/golden-financial-fixture-v1.json`;
- `tests/fixtures/financasbot-next/golden-conversation-set-v1.json`;
- `docs/plans/workstreams/financasbot-next-roadmap-ratification-v1.md`;
- `docs/plans/workstreams/financasbot-next-roadmap-draft-v2.md`;
- `docs/agent-memory/architecture-map.md`.
