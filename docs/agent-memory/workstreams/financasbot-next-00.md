# Workstream — FinançasBot Next / NEXT-00

Atualizado em: 2026-08-30
Status: `NEXT00-01 COMPLETE; NEXT00-02 READY; ZERO IMPLEMENTAÇÃO FUNCIONAL`

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
- nenhum contrato substantivo ou Golden Set foi produzido ainda;
- nenhuma implementação funcional foi iniciada.

## Gate ativo

`NEXT00-02 — AUTORIDADE, COEXISTÊNCIA E CONVERSA` — pronto para abertura.

### Resultado de NEXT00-01

- capacidades preservadas cobertas por destino explícito;
- wiring, contrato, test-only, quarentena e runtime desconhecido separados;
- nenhum módulo de runtime classificado `PORT_AS_IS`;
- nenhuma consulta externa ou alteração funcional realizada.

## Critério de saída da fatia

Critério satisfeito: inventário rastreável, cobertura completa do roadmap e
taxonomia sem port por mera existência. `GO DOCUMENTAL PARA NEXT00-02`.

## Próxima ação exata

Abrir NEXT00-02 e produzir os contratos Data Authority, Coexistence/Single-Writer,
Conversation/Proposal e Model Data Boundary, sem implementar runtime.

## Referências

- `docs/plans/workstreams/financasbot-next-00.md`;
- `docs/plans/workstreams/financasbot-next-00-inventory-v1.md`;
- `docs/plans/workstreams/financasbot-next-roadmap-ratification-v1.md`;
- `docs/plans/workstreams/financasbot-next-roadmap-draft-v2.md`;
- `docs/agent-memory/architecture-map.md`.

