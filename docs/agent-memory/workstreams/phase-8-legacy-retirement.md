# Estado - Fase 8, aposentadoria de legado

Atualizado em: 2026-07-30

## Objetivo

Selecionar candidatos individualmente e impedir aposentadoria baseada em falso
zero de telemetria.

## Estado

`PHASE8-OBS-01` esta em `CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

A observacao somente leitura na OCI mostrou que:

- `legacy_auth_utility` teve duas probes sinteticas e zero uso real nos dois
  arquivos de telemetria disponiveis;
- cartoes continuam usando fortemente rotas legadas;
- dashboard v1 teve uso e v2 nao teve adocao observada;
- a producao permaneceu intocada e saudavel.

Foi reproduzida uma lacuna no relatorio oficial: ele ignorava backups
rotacionados. A correcao local e o teste causal estao em
`docs/audit/87-phase8-tripwire-rotation-proof-candidate-2026-07-30.md`.

## Limites

- nenhuma flag pode ser alterada;
- nenhum restart, deploy, exclusao ou soft-disable esta autorizado;
- cartoes e dashboard nao sao candidatos;
- `legacy_auth_utility` so pode avancar depois do fechamento independente da
  prova de rotacao e de nova decisao operacional explicita.

## Proxima acao

Publicar commit sanitizado do `PHASE8-OBS-01` e obter auditoria independente por
hash imutavel.

## Capacidade

`Codex -> Sol -> Alto -> auditar a causalidade da prova rotacionada da Fase 8.`

