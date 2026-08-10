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
| `open-finance-historical-rx` | gates 36-38.2 GO local; gate 38.3 ativo | `open-finance-historical-rx.md` | `../../plans/workstreams/open-finance-historical-rx.md` | Gate 38.3 somente reembolso vinculado; gates 34-35 preservados; escrita off |

Se dois workstreams puderem escrever simultaneamente, usar branches/worktrees
distintas. Atualizar somente a própria linha e seus arquivos.
