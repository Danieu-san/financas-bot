# OF-NUMERIC-SAVE-OCI-04 - promocao e observacao natural

Data: 2026-08-08

Hash de produto promovido:
`ce49c0705120ea9a421e05fd60a9373aea889019`.

## Promocao

- o preflight imediato confirmou um unico PM2 online, release de rollback
  ativa, health, SQLite e WhatsApp verdes;
- as flags permaneceram em `canary/canary/canary/prompt/off/false`;
- os quatro arquivos enviados coincidiram com os checksums auditados e ficaram
  em diretorio `0700`, com arquivos `0600`;
- o slot foi preparado com `production_changed=false`;
- o plano prendeu o rollback a
  `1a1630949cf6acb301a2a054e61987d1cf516fb4`;
- a promocao terminou com `promoted=true`, sem rollback e sem bootstrap de
  estado vazio.

## Verificacao posterior

- um unico PM2 ficou online no script do hash promovido e no cwd esperado;
- health, SQLite, WhatsApp e liveness ficaram verdes;
- cinco bancos operacionais e o state store permaneceram privados, sem
  sidecars SQLite residuais;
- nao houve linha de erro posterior ao restart; cinco advertencias pertencem
  somente a inicializacao do WhatsApp, que terminou pronta;
- a verificacao de logs encontrou zero segredo, zero identidade privada e zero
  `financial_writes` diferente de zero. Um padrao numerico inicialmente
  suspeito foi classificado sem expor seu valor e corresponde somente a versao
  tecnica do WhatsApp;
- outbox, preview, journal e retencao foram lidos somente por agregados. Nao ha
  lease vencido, backlog retryable anterior ao cutoff, proposta pendente
  expirada, preview pendente expirado ou entrada terminal nova;
- a regra SSH `/32` temporaria foi removida e a porta voltou a ficar fechada.

## Observacao natural

Um ciclo Open Finance natural posterior ao restart terminou em `GO`, com quatro
observacoes novas, zero retry e `financial_writes=0`. As quatro entregas aceitas
foram distribuidas aos dois destinatarios, mas a verificacao cifrada agregada
provou que elas eram alertas comuns, sem `proposal_ref`. As propostas numeradas
ja existentes sao anteriores ao restart e nao podem ser reutilizadas como smoke
do novo release.

Nenhum polling foi forcado, nenhuma mensagem foi criada pelo Codex e nenhuma
resposta foi enviada nos telefones.

## Decisao

`PROMOCAO VERDE; GATE 34 AINDA SEM GO`.

Falta somente observar um evento genuinamente novo elegivel que produza um lote
numerado e executar o smoke familiar controlado descrito no charter. Ate la, o
slot anterior continua sendo o rollback e `OPEN_FINANCE_WRITE_MODE=off`.
