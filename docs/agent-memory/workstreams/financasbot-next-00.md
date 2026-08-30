# Workstream — FinançasBot Next / NEXT-00

Atualizado em: 2026-08-30
Status: `OPEN — CHARTER MATERIALIZADO; ZERO IMPLEMENTAÇÃO FUNCIONAL`

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
- nenhum contrato substantivo ou Golden Set foi produzido ainda;
- nenhuma implementação funcional foi iniciada.

## Gate ativo

`NEXT00-01 — INVENTÁRIO E TAXONOMIA`.

### Dentro

- inventariar capacidades realmente usadas;
- localizar contratos e evidências reaproveitáveis;
- classificar cada item na taxonomia aprovada;
- registrar lacunas sem corrigi-las silenciosamente.

### Fora

- código funcional, testes de produção ou integração real;
- dados privados, secrets, deploy, writers ou bot legado;
- contratos 1 a 8 além do que for necessário para classificar o inventário.

## Critério de saída da fatia

Inventário rastreável e taxonomia completa o suficiente para abrir NEXT00-02,
sem port por mera existência e sem acesso real.

## Próxima ação exata

Inspecionar o mapa de arquitetura e referências dirigidas do legado e produzir
o inventário inicial de capacidades/contratos com evidência por item.

## Referências

- `docs/plans/workstreams/financasbot-next-00.md`;
- `docs/plans/workstreams/financasbot-next-roadmap-ratification-v1.md`;
- `docs/plans/workstreams/financasbot-next-roadmap-draft-v2.md`;
- `docs/agent-memory/architecture-map.md`.

