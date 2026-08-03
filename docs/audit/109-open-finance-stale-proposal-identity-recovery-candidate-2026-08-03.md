# OF-ALERT-BIND-01 — recovery de identidade de proposta obsoleta

Data: 2026-08-03

## Veredito local

`CANDIDATO RECUPERADO; AUDITORIA INDEPENDENTE PENDENTE; CONFIRM BLOQUEADO`.

O commit imutável `63d7bb66dba9040047b22935760b32344e9059e1` recebeu
`NO-GO` independente. A revisão encontrou uma lacuna alta: uma mudança de conta
altera observation ref e proposal ref, de modo que a proposta anterior poderia
deixar de ser encontrada. Também exigiu prova causal mais forte de falha entre
o journal terminal e a atualização do preview, seguida de reabertura real.

Este candidato responde somente a esses dois achados. O release vigente na OCI
continua sendo `c781365d1b6b5524b3ae5ac0ce821d9461821a28`.

## Recovery de identidade estável

O preview calcula uma identidade interna autenticada por HMAC a partir de
`alias_ref`, geração e `source.transaction.id`. Essa chave é independente de
conta, observation ref, proposal ref, transaction ref, operação, principal,
descrição e valor.

Antes de criar uma proposta, o store indexa as propostas persistidas por essa
identidade estável. Se a decisão atual deslocar a referência e a fonte já tiver
uma proposta anterior:

- a proposta anterior é terminalizada como `cancelled/declined` no journal;
- a proposta substituta é bloqueada no mesmo ciclo;
- nenhuma proposta ativa fica disponível para um `sim` antigo;
- nenhuma escrita financeira é executada.

Uma colisão criada dentro da própria transação de ingestão não é convertida em
recovery: permanece `save_proposal_replay_conflict` e faz rollback atômico.
Duplicidade histórica ou identidade sem transaction id também falham fechadas.

## Provas causais novas

`source identity displacement closes the old prompt and blocks the replacement`
parte de uma confirmação preparada e muda simultaneamente conta, tipo de conta,
valor, descrição, observation ref, transaction ref, classificação e principal.
O teste exige uma única proposta terminalizada, nenhuma pendente, substituta
bloqueada e `financial_writes=0`.

`journal terminal recovers a preview rollback after restart` instala um trigger
SQLite que aborta exatamente a atualização do preview para `cancelled`. O
journal terminal é gravado, o preview faz rollback e permanece
`pending/ready`. Em seguida store e journal são fechados; o teste abre o banco
de preview diretamente, comprova o rollback, remove apenas o injetor de falha e
reabre journal, âncora e store pelos construtores reais. O ingresso seguinte
reaplica o terminal e exige `cancelled/declined`, zero pendências e zero escrita.

## Evidência local

- save proposal shadow: `12/12`;
- confirmation: `9/9`;
- family alerts: `6/6`;
- state machine: `124/124`;
- bateria causal relacionada: `151/151`;
- suíte hermética completa: exit code zero, `1.435` testes inferidos da suíte
  anterior mais os dois casos novos, `1.430` aprovados, zero falha e cinco skips
  funcionais esperados;
- syntax check do store: verde;
- todas as provas preservam `financial_writes=0`.

A contagem total é derivada da execução anterior documentada de 1.433 testes
mais os dois testes adicionados; o dado primário desta rodada é o exit code zero
da execução completa, não uma execução atribuída ao auditor externo.

## Invariantes e alcance

- `OPEN_FINANCE_SAVE_PROPOSAL_MODE=prompt`;
- `OPEN_FINANCE_WRITE_MODE=off`;
- `OPEN_FINANCE_WRITE_APPROVED=false`;
- `confirm` continua bloqueado;
- eventos ausentes no Pluggy não são sintetizados;
- alertas não-compra não ganham proposta de salvamento;
- nenhuma resposta antiga `sim` deve ser usada como smoke;
- o candidato não autoriza fechamento funcional de 9P.4.

## Próximo gate

Publicar este candidato em commit sanitizado e submeter o hash imutável à
auditoria independente. Somente com GO é permitido construir e promover um
artefato OCI, mantendo as flags seguras e exigindo ciclo Open Finance verde,
health completo e `writes=0`.
