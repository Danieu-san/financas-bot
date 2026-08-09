# OF-NUMERIC-SAVE-OCI-05 - prioridade numerica promovida

Data: 2026-08-09

Hash de produto promovido:
`f5806e1b071b47d6441354928740d2139fb5ae51`.

## Auditoria e artefato

- a auditoria independente em conversa normal do Chat confirmou o SHA, o pai
  e os seis arquivos do diff;
- o veredito foi `GO` para promocao operacional controlada, com zero achado
  critical, high ou medium e um low probatorio nao bloqueante;
- o artefato foi reconstruido exatamente do hash auditado;
- pacote e instalador passaram nos checksums local e remoto;
- o manifesto remoto confirmou 810 arquivos;
- os quatro arquivos de entrada ficaram em diretorio `0700` e modo `0600`.

## Preflight e promocao

- a infraestrutura vigente foi redescoberta como Oracle/OCI; a AWS historica
  nao participou;
- havia exatamente um PM2 `financas-bot` online no release anterior, no cwd
  esperado, com health, SQLite e WhatsApp verdes;
- as flags estavam em `canary/canary/canary/prompt/off/false`;
- os cinco bancos operacionais estavam privados, o state store estava em
  `0600` e os sidecars ativos do SQLite tambem estavam privados;
- o slot foi preparado com `production_changed=false`;
- o plano vinculou o rollback ao release anterior
  `ce49c0705120ea9a421e05fd60a9373aea889019`;
- a promocao terminou com `promoted=true`, sem rollback e sem bootstrap de
  state store.

## Verificacao posterior

- um unico processo permaneceu online no script do hash promovido e no cwd
  esperado;
- health local e publico, SQLite, WhatsApp e liveness ficaram verdes;
- as seis flags permaneceram exatamente seguras;
- cinco bancos e state store permaneceram privados; nenhum rollback journal
  residual foi encontrado;
- outbox, preview, propostas, journal e journal terminal foram abertos somente
  em modo read-only e responderam por agregados;
- nao havia lease vencido, preview pendente expirado, proposta pendente
  expirada ou confirmacao pronta expirada;
- os marcadores severos encontrados na cauda eram historicos; nenhum ocorreu
  depois do restart atual;
- nenhum marcador de segredo, identidade privada ou
  `financial_writes` diferente de zero foi encontrado;
- a regra SSH `/32` temporaria foi removida e a porta voltou a ficar fechada.

Nenhum polling foi forcado, nenhuma transacao foi criada, nenhuma mensagem foi
enviada pelo Codex e nenhuma resposta foi dada nos celulares.

## Decisao

`PROMOCAO VERDE; GATE 34 AINDA AGUARDA SMOKE NATURAL`.

O release novo corrige a prioridade do lote numerado sobre alertas comuns sem
habilitar escrita. O fechamento do Gate 34 continua condicionado a um lote
numerado genuinamente novo e ao smoke familiar controlado. Ate la,
`OPEN_FINANCE_WRITE_MODE=off`, aprovacao falsa e `financial_writes=0` permanecem
obrigatorios.
