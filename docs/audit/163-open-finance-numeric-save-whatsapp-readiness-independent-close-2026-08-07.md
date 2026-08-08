# OF-NUMERIC-SAVE-OCI-02 - fechamento independente do recovery de readiness

Data: 2026-08-07

Hash imutavel auditado:
`ce49c0705120ea9a421e05fd60a9373aea889019`.

## Veredito independente

`GO TECNICO LOCAL`.

O Chat confirmou o hash final, a comparacao completa desde a base e a leitura
dos seis arquivos no mesmo SHA. Resultado:

- CRITICAL: zero;
- HIGH: zero;
- MEDIUM: zero;
- LOW: um, aceito;
- lacunas indispensaveis: nenhuma no escopo.

O MEDIUM anterior foi fechado: duas chamadas concorrentes compartilham a mesma
promessa rejeitada, ambas sao consumidas e a limpeza permite uma nova execucao
real do metodo original. O LOW de cancelamento tambem foi fechado: o controller
inclui `cancelled` no predicado da tentativa ativa, bloqueia a avaliacao depois
do `await` e nao agenda novo timer.

O LOW residual e uma anexacao da biblioteca que nunca conclui. Nesse caso o
single-flight permanece pendente ate teardown, sem abrir health ou criar loop de
retry. O watchdog solicita recuperacao pelo supervisor e o release OCI continua
limitado por health e rollback. O risco foi aceito sem adicionar um segundo
timeout concorrente ao cliente.

## Evidencia local

- testes focados: `16/16`;
- testes diretamente afetados: `61/61`;
- sintaxe, workflow e `git diff --check`: verdes;
- producao permaneceu na release anterior saudavel depois do rollback;
- regra SSH temporaria removida;
- nenhuma segunda promocao, polling forcado, mensagem ou escrita financeira.

O Chat nao executou os testes nem reproduziu OCI. Seu parecer foi estatico e nao
autoriza deploy por si so.

## Estado

`RECOVERY ENCERRADO LOCALMENTE; GATE 34 LIBERADO PARA NOVO ARTEFATO E NOVA
PROMOCAO CONTROLADA`.

O artefato deve ser construido exatamente do hash auditado. A promocao continua
exigindo preflight imediato, rollback preservado, 60 tentativas de health,
flags seguras e Daniel presente para o smoke familiar.
