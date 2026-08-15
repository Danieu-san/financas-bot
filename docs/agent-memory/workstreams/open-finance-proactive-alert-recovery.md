# Workstream - recuperacao dos alertas proativos

Atualizado em: 2026-08-15

## Objetivo

Restaurar o ciclo Open Finance e o lote numerado familiar sem afrouxar a
imutabilidade depois que uma proposta foi apresentada.

## Estado

`GO TECNICO LOCAL; PROMOCAO OCI AUTORIZADA`.

- branch: `codex/open-finance-proactive-alert-g42`;
- base: `960e8e82d1c4aae5f6b49f0d17e75e731de6dbc2`;
- causa: dois conflitos de replay duravel impediam todo ciclo posterior;
- clone real da OCI: `GO`, oito propostas corrigidas antes do transporte,
  76 pendentes, duas entregas simuladas e zero escrita financeira;
- testes: focal `43/43`, causal `402/402`, amplo `1713/1723`, zero falhas e
  dez skips previstos;
- auditoria do hash `f413010a2a8b58cc12808476cfb9cee5f1b3d6f9`: `NO-GO` por
  um unico `MEDIO` no filtro sintatico de `reason`; a fronteira de replay foi
  aprovada;
- correcao posterior: `reason` agora usa lista fechada de dois codigos, com
  teste causal para identificador privado sintaticamente valido; focal `43/43`
  e nova suite ampla unica `1713/1723`, zero falhas;
- reauditoria do hash `579afb2abffb47f470b19a827a5c3a8c441add82`:
  `GO TECNICO LOCAL`, zero achados e nenhuma lacuna indispensavel residual;
- candidato: `docs/audit/258-open-finance-proactive-replay-recovery-candidate-2026-08-15.md`.

## Proxima acao

Registrar o fechamento, promover por artefato OCI e observar o primeiro lote
real sem consentimento ou escrita financeira automatica.
