# Estado atual portatil do FinancasBot

Atualizado em: 2026-08-15

## Objetivo ativo

Revisar o limite mensal, confirmar quais categorias entram no calculo e
corrigir qualquer divergencia sem misturar despesas excluidas.

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
- hash imutavel `28f106d4e9b150cd7e04f589075d3eb873e7cc25` recebeu
  `GO TECNICO LOCAL` independente, sem achados bloqueantes nem lacuna residual;
  promocao OCI controlada esta autorizada, preservando v1 e a flag de rollback;
- o hash auditado foi promovido na OCI com processo unico, zero reinicios e
  health local/publico e WhatsApp verdes;
- smoke real de `dashboard` respondeu uma unica vez com `/dashboard/v2`, sem
  consumir a lista financeira pendente; dashboard v2 esta em `GO DE PRODUCAO`.
- o check operacional das 09:05 foi desativado em producao pela flag existente,
  com testes focais 34/34; outros crons permaneceram intactos e o health final
  voltou a `ready/healthy`.
- o diagnostico do limite mensal encontrou duas causas: cartoes nao aplicavam a
  exclusao de contas recorrentes e o dashboard apontava o mes corrente para um
  ciclo futuro quando o inicio era dia 28;
- o candidato unifica elegibilidade entre alerta, dashboard e Query Engine e
  resolve agosto como 28/07 a 27/08; despesas avulsas continuam elegiveis;
- provas focais 3/3, bateria causal 22/22, estados 9/9 e ampla final
  1731/1721/0/10, cobertura de linhas 91.53%.

## Git e workspace

- branch: `codex/dashboard-truth-g44`;
- produto implantado: `28f106d4e9b150cd7e04f589075d3eb873e7cc25`;
- arvore deve preservar `release-artifacts-g44/` como nao rastreado.

## Próxima ação exata

Publicar o commit sanitizado do candidato e obter auditoria independente por
hash antes de qualquer promocao OCI.

## Capacidade para retomar

`Codex -> Sol -> Alto -> auditar o candidato do limite mensal por hash.`

## Referencias

- `docs/plans/current-gate.md`;
- `docs/agent-memory/workstreams/open-finance-proactive-alert-recovery.md`;
- `docs/plans/workstreams/open-finance-proactive-alert-recovery.md`;
- `docs/audit/258-open-finance-proactive-replay-recovery-candidate-2026-08-15.md`.
- `docs/audit/259-open-finance-proactive-replay-recovery-independent-close-2026-08-15.md`.
- `docs/audit/260-open-finance-orphan-conversation-recovery-candidate-2026-08-15.md`.
- `docs/audit/261-open-finance-orphan-conversation-recovery-independent-close-2026-08-15.md`.
- `docs/audit/263-open-finance-orphan-conversation-recovery-production-close-2026-08-15.md`.
- `docs/audit/266-dashboard-v2-default-promotion-production-close-2026-08-15.md`.
- `docs/audit/267-daily-ops-check-disable-production-close-2026-08-15.md`.
- `docs/audit/268-monthly-free-budget-truth-candidate-2026-08-15.md`.
