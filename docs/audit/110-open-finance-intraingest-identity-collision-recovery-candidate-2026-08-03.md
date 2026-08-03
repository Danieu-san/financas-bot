# OF-ALERT-BIND-01 — recovery de colisão de identidade intraingest

Data: 2026-08-03

## Veredito local

`CANDIDATO RECUPERADO; AUDITORIA INDEPENDENTE PENDENTE; CONFIRM BLOQUEADO`.

O commit `f5768a03ea57fa7665dd1b0f5fd2dea5749fe9b6` recebeu NO-GO
independente com um achado alto. O índice de identidade estável era montado a
partir do estado anterior ao ingest, mas não recebia a proposta recém-inserida.
Duas representações aceitas no mesmo lote, com a mesma transação fonte e
referências distintas, poderiam portanto ficar simultaneamente pendentes.

## Recovery

Depois de cada inserção, o store registra imediatamente no índice transacional
a associação entre a identidade HMAC estável e a nova proposal ref. Se uma
segunda decisão no mesmo ingest representar a mesma fonte com outra proposal
ref, ela encontra a primeira. Como essa primeira referência pertence ao conjunto
`insertedThisRun`, a execução lança `save_proposal_replay_conflict` e a transação
SQLite inteira faz rollback.

O recovery não converte a colisão intraingest em cancelamento parcial, não
mantém a primeira proposta e não cria journal terminal para um estado que nunca
deve ser commitado. O resultado exigido é zero proposta total, zero pendente e
zero escrita financeira.

## Prova causal

O teste `duplicate stable source identity in one ingest rolls back atomically`
cria duas representações aceitas com o mesmo `source.transaction.id`, alias e
geração, mas contas, tipos, observation refs, proposal refs e transaction refs
distintos. Ele executa o store real, exige
`save_proposal_replay_conflict` e comprova que nenhuma linha sobrevive.

As provas anteriores permanecem no mesmo conjunto:

- deslocamento de identidade persistida encerra a proposta antiga e bloqueia a
  substituta mesmo sob mudanças simultâneas;
- falha injetada depois do journal e antes do preview deixa o preview
  `pending/ready` e é recuperada após fechar e reabrir journal, âncora e store;
- colisão por transaction ref já permanecia atômica;
- todos os caminhos preservam `financial_writes=0`.

## Evidência local

- save proposal shadow: `13/13`;
- confirmation: `9/9`;
- family alerts: `6/6`;
- state machine: `124/124`;
- bateria causal relacionada: `152/152`;
- suíte hermética: `1.436` testes, `1.431` aprovados, zero falha e cinco
  skips funcionais esperados;
- cobertura: linhas `90,59%`, branches `72,90%`, funções `90,15%`;
- syntax check, `git diff --check` e workflow versionado: verdes.

## Invariantes e alcance

- `OPEN_FINANCE_SAVE_PROPOSAL_MODE=prompt`;
- `OPEN_FINANCE_WRITE_MODE=off`;
- `OPEN_FINANCE_WRITE_APPROVED=false`;
- `confirm` continua bloqueado;
- produção permanece em `c781365d1b6b5524b3ae5ac0ce821d9461821a28`;
- este candidato não autoriza deploy antes de nova auditoria independente.

## Próximo gate

Completar a validação local, publicar um novo hash imutável e repetir a auditoria
independente com foco na atualização intraingest do índice e no rollback total.
Somente um GO autoriza construir e promover o artefato OCI com flags seguras.
