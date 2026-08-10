# Gate 38.2 - recovery probatorio da escrita de entrada

Data: 2026-08-10

## Estado proposto

`CANDIDATO DE RECOVERY LOCAL VERDE; AGUARDA REAUDITORIA; SEM DEPLOY`.

## NO-GO que originou o recovery

O auditor independente leu os 11 arquivos do hash
`9a7f20d6f106a8c9dda311d371faa1e87bc5563b` e encontrou zero achado
critico ou alto e um achado medio exclusivamente probatorio. A implementacao
estatica passou nas fronteiras funcionais, mas o teste publico contava apenas
linhas aceitas por um double de Google que ja deduplicava `operationKey`.
Assim, uma segunda invocacao indevida do writer poderia ficar invisivel. O
cenario tambem nao demonstrava explicitamente replay depois de reabertura.

## Fechamento aplicado

- o harness passou a registrar cada tentativa de `appendRowToSheet` antes de
  qualquer deduplicacao do double externo;
- o caminho publico exige uma unica tentativa de append antes e depois do
  replay imediato;
- depois do commit, o modulo de finalizacao e recarregado e seus stores
  duraveis sao reabertos pelo codigo de produto;
- o replay apos essa fronteira de restart deve retornar o recibo terminal, com
  zero escrita e sem uma segunda tentativa de append;
- o teste continua usando handler, vault, stores, reconciliador, catalogo,
  conversa e finalizador reais. Somente Google/WhatsApp permanecem bordas
  sinteticas; o manifesto nao as caracteriza mais como writer real.

## Evidencia causal antes da suite ampla

- handler publico do Gate 38.2: `1/1`;
- promocao, confirmacao e finalizacao: `28/28`;
- sintaxe do teste alterado: verde.
- suite hermetica ampla final: `1599/1589/0/10`, zero falhas;
- cobertura: linhas `91,04%`, branches `73,68%`, funcoes `90,69%`.

As contagens sao execucao local do Codex, nao execucao do auditor. A
reauditoria pertence ao novo hash imutavel.

## Limites

Nenhuma flag, planilha, sessao WhatsApp, Pluggy ou servidor real foi alterado.
Este recovery nao autoriza deploy e nao inicia o Gate 38.3 sem GO independente.
