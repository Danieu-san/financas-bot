# OPS-05 — janela limitada de readiness do WhatsApp no release OCI

Data: 2026-07-31

## Incidente

O recovery `OPS-04` recebeu `GO TÉCNICO LOCAL` independente no hash
`ce43a8f8f6c4080bda5ab92e697388753da598d8`. O artefato passou build,
checksums, manifesto e preparo isolado.

Na promoção:

- Google, Sheets, SQLite, read-model e dashboard do candidato iniciaram;
- o WhatsApp autenticou, mas não chegou a `ready` dentro da janela padrão de
  aproximadamente 60 segundos;
- o health novo permaneceu fechado porque exige WhatsApp saudável;
- o promotor removeu o candidato e restaurou script, `.env` e snapshot;
- durante a troca, a sessão recebeu `LOGOUT` e exigiu novo QR;
- depois do QR, o runtime anterior voltou a `ready`, cron ativo e Open Finance
  com `writes=0`.

Nenhuma escrita financeira foi habilitada. Uma segunda promoção não foi
executada.

## Causa operacional

O contrato do health ficou mais rigoroso que o legado, mas a CLI do promotor
não expunha a configuração `healthAttempts` já existente na função de produto.
Na VM OCI pequena, a inicialização real do WhatsApp pode ultrapassar 60
segundos sem que isso represente falha do restante do runtime.

## Recovery

`scripts/release/ociArtifactRelease.js` passa a aceitar:

```text
--health-attempts <12..60>
```

Com intervalo fixo de cinco segundos, `60` tentativas limitam a janela a cerca
de cinco minutos. O parser:

- preserva `12` como padrão;
- aceita somente inteiro decimal;
- recusa menos de `12`, mais de `60`, fração ou texto;
- falha com código sanitizado antes de qualquer inventário ou restart.

O health continua exigindo HTTP bem-sucedido, `ok=true` e `sqlite=true`. O
recovery não afrouxa readiness, não ignora WhatsApp e não altera rollback,
estado, flags ou processo.

## Prova causal

O teste novo mantém o candidato não saudável por doze verificações e o torna
saudável somente na décima terceira. Ele exige:

- exatamente treze consultas de health;
- uma única sequência `jlist → delete → start → save`;
- nenhuma exclusão do candidato e nenhum start de rollback.

Outro teste exige padrão `12`, aceita `60` e recusa `0`, `11`, `61`, fração e
texto.

## Evidência executada pelo Codex

- release/OPS-03/04/05: `23/23`;
- sintaxe e `git diff --check`: verdes;
- runtime anterior recuperado: um PM2 online, WhatsApp `ready`, cron ativo,
  Open Finance `writes=0`.

Uma auditoria independente não deve tratar essas contagens como execução
própria.

## Estado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

Nova promoção permanece bloqueada até parecer independente sobre o hash.
