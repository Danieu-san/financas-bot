# Workstreams ativos

Este índice é lido somente quando a conversa não corresponde ao gate raiz.
Cada conversa/worktree trabalha em um objetivo e preserva seu próprio estado.

| Workstream | Estado | Checkpoint | Plano | Regra |
|---|---|---|---|---|
| `wgl-03-wgl-04` | pausado no SSD | `../current.md` | `../../plans/current-gate.md` | gate raiz; não sobrescrever por outro assunto |
| `aws-oracle-migration` | em outra conversa; inventário pendente aqui | `aws-oracle-migration.md` | `../../plans/workstreams/aws-oracle-migration.md` | não presumir destino remoto nem usar caminhos AWS históricos |

Se dois workstreams puderem escrever simultaneamente, usar branches/worktrees
distintas. Atualizar somente a própria linha e seus arquivos.
