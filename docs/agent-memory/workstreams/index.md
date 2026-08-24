# Workstreams ativos

Este índice é lido somente quando a conversa não corresponde ao gate raiz.
Cada conversa/worktree trabalha em um objetivo e preserva seu próprio estado.

| Workstream | Estado | Checkpoint | Plano | Regra |
|---|---|---|---|---|
| `wgl-03-wgl-04` | pausado no SSD | `../current.md` | `../../plans/current-gate.md` | gate raiz; não sobrescrever por outro assunto |
| `aws-oracle-migration` | migração concluída; release OCI em OPS-03 | `aws-oracle-migration.md` | `../../plans/workstreams/aws-oracle-migration.md` | produção OCI; deploy somente por artefato |
| `lost-ssd-recovery` | concluído | `lost-ssd-recovery.md` | `../../plans/workstreams/lost-ssd-recovery.md` | pacote AES-256 validado; Drive restrito ao proprietário e a Daniel |
| `phase-8-legacy-retirement` | PHASE8-OBS-01 candidato local | `phase-8-legacy-retirement.md` | `../../plans/workstreams/phase-8-legacy-retirement.md` | sem flag, restart, deploy ou exclusao |
| `codex-usage-calibration` | instrumentacao prospectiva em implementacao | `codex-usage-calibration.md` | `../../plans/workstreams/codex-usage-calibration.md` | metadados locais sanitizados; sem prompts, comandos, saidas ou dados financeiros |
| `open-finance-historical-rx` | gates 36-38.4 GO local; gate 38.5 ativo | `open-finance-historical-rx.md` | `../../plans/workstreams/open-finance-historical-rx.md` | Gate 38.5 somente aplicacao/resgate de reserva; gates 34-35 preservados; escrita off |
| `open-finance-historical-import` | Gate 41.7 GO tecnico local; RX read-only sem revisoes | `open-finance-historical-import.md` | `../../plans/workstreams/open-finance-historical-import.md` | decisoes exatas; dados privados fora do Git; writer historico desligado |
| `open-finance-proactive-alert-recovery` | Gate 42 candidato; ciclo clonado GO | `open-finance-proactive-alert-recovery.md` | `../../plans/workstreams/open-finance-proactive-alert-recovery.md` | auditoria por hash; deploy somente apos GO |
| `financial-conversation-architecture-review` | ARQ-01..06 GO; ARQ-06 fechado em produção controlada, canário `off` | `financial-conversation-architecture-review.md` | `../../plans/workstreams/financial-conversation-architecture-review.md` | smoke base+follow-up concluído; zero writer; evolução seguinte exige objetivo próprio |
| `chat-codex-orchestration` | ORCH-01 em implementação isolada | `chat-codex-orchestration.md` | `../../plans/workstreams/chat-codex-orchestration.md` | estado mecânico separado do checkpoint; sem bot, produção ou dados reais |

Se dois workstreams puderem escrever simultaneamente, usar branches/worktrees
distintas. Atualizar somente a própria linha e seus arquivos.
