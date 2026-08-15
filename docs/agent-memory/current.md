# Estado atual portatil do FinancasBot

Atualizado em: 2026-08-15

## Objetivo ativo

Promover o dashboard v2 como superficie padrao com rollback v1, depois desativar
o check diario das 09:05 e revisar o limite mensal.

## Estado vigente

- Gate 41.7 recebeu `GO TECNICO LOCAL` read-only e permanece sem writer;
- Gate 42 recebeu `GO TECNICO LOCAL` e foi promovido na OCI no release
  `579afb2abffb47f470b19a827a5c3a8c441add82`;
- processo unico, WhatsApp e health permaneceram verdes, com zero reinicios;
- o primeiro ciclo real concluiu `GO`, mas nao entregou lote numerado;
- diagnostico sanitizado provou que Daniel e Thais tinham estado
  `awaiting_open_finance_save_selection`, com zero revisoes ativas e zero
  confirmacoes prontas: ambos eram excluidos por estado orfao;
- Gate 43 remove somente estado das cinco acoes Open Finance conhecidas quando
  nao existe revisao ativa/pronta valida nem confirmacao pronta;
- conversas alheias, revisoes e confirmacoes vivas continuam bloqueadas;
- o primeiro hash do Gate 43 recebeu `NO-GO` e nao foi implantado: duas
  revisoes prontas expiradas podiam ocultar uma terceira valida antes do
  limite, e faltava prova com persistencia real;
- a correcao filtra validade no SQL antes do limite, prova o caso com o store
  real e usa o `userStateManager` real no ciclo completo;
- evidencia corretiva focal `44/44`, afetada `149/149` e ampla final
  `1727/1717/0/10`, com cobertura de linhas `91.54%`;
- hash corrigido `72e526fac3dde1d00907d4e03725472ea8c67c60` recebeu
  `GO TECNICO LOCAL` independente, sem achados nem lacuna indispensavel;
- promocao OCI e primeiro ciclo controlado estao autorizados, mantendo
  `financial_writes=0`.
- Gate 43 foi promovido na OCI no hash auditado `72e526fac3dde1d00907d4e03725472ea8c67c60`;
- processo unico, zero reinicios, health local/publico e WhatsApp verdes;
- primeiro ciclo: `GO`, `recovered_states=2`, duas entregas, oito propostas e
  `financial_writes=0`;
- WhatsApp Daniel confirmou uma unica lista numerada com quatro itens, sem
  duplicacao; Gate 43 esta em `GO DE PRODUCAO`.
- v1 e v2 foram comparados no mesmo recorte real e receberam a mesma posicao
  Open Finance; o v2 foi escolhido por separar melhor saldo, fluxo, competencia,
  orcamento, previsao e qualidade e por nao oferecer seletor de usuario;
- os totais mensais zerados refletem a ausencia atual de RX escrito na planilha,
  nao uma divergencia entre os dashboards;
- candidato local promove `dashboard` ao v2, preserva `dashboard v1` e rollback
  por `DASHBOARD_V2_ENABLED=false`; focal 10/10, contratos 41/41 e ampla
  1727/1717/0/10, cobertura de linhas 91.53%.

## Git e workspace

- branch: `codex/open-finance-proactive-alert-g42`;
- base: `960e8e82d1c4aae5f6b49f0d17e75e731de6dbc2`;
- arvore deve conter apenas o candidato e sua documentacao.

## Próxima ação exata

Publicar o hash sanitizado da promocao do v2 e obter auditoria independente no
Chat antes de qualquer deploy.

## Capacidade para retomar

`Codex -> Sol -> Alto -> comparar dashboard v1/v2 e validar a verdade financeira.`

## Referencias

- `docs/plans/current-gate.md`;
- `docs/agent-memory/workstreams/open-finance-proactive-alert-recovery.md`;
- `docs/plans/workstreams/open-finance-proactive-alert-recovery.md`;
- `docs/audit/258-open-finance-proactive-replay-recovery-candidate-2026-08-15.md`.
- `docs/audit/259-open-finance-proactive-replay-recovery-independent-close-2026-08-15.md`.
- `docs/audit/260-open-finance-orphan-conversation-recovery-candidate-2026-08-15.md`.
- `docs/audit/261-open-finance-orphan-conversation-recovery-independent-close-2026-08-15.md`.
- `docs/audit/263-open-finance-orphan-conversation-recovery-production-close-2026-08-15.md`.
