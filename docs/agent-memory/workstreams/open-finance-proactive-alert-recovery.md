# Workstream - recuperacao dos alertas proativos

Atualizado em: 2026-08-15

## Objetivo

Restaurar o ciclo Open Finance e o lote numerado familiar sem afrouxar a
imutabilidade depois que uma proposta foi apresentada.

## Estado

`CANDIDATO TECNICO LOCAL; AGUARDANDO AUDITORIA INDEPENDENTE`.

- branch: `codex/open-finance-proactive-alert-g42`;
- base: `960e8e82d1c4aae5f6b49f0d17e75e731de6dbc2`;
- causa: dois conflitos de replay duravel impediam todo ciclo posterior;
- clone real da OCI: `GO`, oito propostas corrigidas antes do transporte,
  76 pendentes, duas entregas simuladas e zero escrita financeira;
- testes: focal `43/43`, causal `402/402`, amplo `1713/1723`, zero falhas e
  dez skips previstos;
- candidato: `docs/audit/258-open-finance-proactive-replay-recovery-candidate-2026-08-15.md`.

## Proxima acao

Publicar o commit sanitizado, obter uma unica auditoria independente por hash e,
somente com `GO`, promover por artefato OCI e observar o primeiro lote real.
