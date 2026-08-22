# Gate 41 — fechamento independente do cutover pós-RX

Data: 2026-08-21

## Estado

`GO TÉCNICO` para executar o cutover controlado do hash
`6e6de5ec7c8c0a28c2c847971c8858433bb1fec4`.

## Cadeia de auditoria

- candidato 288: NO-GO porque cópia crua do outbox não provava consistência
  sob SQLite/WAL;
- recovery 289: WAL fechado, mas NO-GO porque o rollback restaurava cutoff
  antigo junto com backlog `pending`;
- recovery 290: GO, zero achados e nenhuma lacuna indispensável.

O parecer final confirmou que:

- rollback ordinário nunca restaura o outbox já quarantinado;
- recuperação de desastre mantém o processo parado e reaplica o novo cutoff e
  o quarantine antes de qualquer transporte;
- `pending -> blocked` é monotônico;
- `claimNextBatch` só reclama `pending`;
- `enqueue` não recria a mesma identidade devido à unicidade e
  `INSERT OR IGNORE`;
- não permaneceu caminho autorizado para reenviar o backlog pré-cutover.

As contagens e testes relatados permaneceram evidência do executor, não
execução do auditor.
