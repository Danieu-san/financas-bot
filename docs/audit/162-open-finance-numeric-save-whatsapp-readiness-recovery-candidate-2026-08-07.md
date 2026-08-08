# OF-NUMERIC-SAVE-OCI-02 - recovery de readiness do WhatsApp

Data: 2026-08-07

## Incidente operacional

O preflight do gate 34 terminou verde e a promocao do artefato
`2219590411fbea993bc8baa608e6a86c372dea27` foi iniciada com 60 tentativas de
health e rollback automatico.

A candidata iniciou Google, SQLite e dashboard, autenticou o WhatsApp e chegou
a 100% de carregamento. A unica tentativa de `ready rescue`, porem, falhou e o
evento `ready` nao ocorreu dentro da janela limitada. O health permaneceu
fechado e o controlador executou rollback automatico.

A release anterior `1a1630949cf6acb301a2a054e61987d1cf516fb4` voltou com um
unico PM2 online, health, SQLite e WhatsApp verdes. O instalador terminou, a
regra SSH temporaria foi removida e nenhuma segunda promocao foi executada.
Nenhuma flag de escrita foi ligada e nenhuma escrita financeira foi autorizada.

## Causa

`scheduleReadyRescue` agendava uma unica tentativa. Uma falha transitoria de
`attachEventListeners` era sanitizada e registrada, mas encerrava o mecanismo
de recuperacao mesmo quando o cliente continuava autenticado e pendente.

O health e o rollback funcionaram corretamente. A lacuna estava na ausencia de
retry limitado dentro do proprio runtime do WhatsApp.

## Recovery candidato

- executar no maximo tres tentativas enquanto a inicializacao continuar
  pendente;
- reutilizar o atraso configurado entre tentativas, sem ampliar a janela do
  release;
- parar imediatamente quando `ready`, QR, falha de autenticacao ou desconexao
  cancelarem a recuperacao;
- tornar o cancelamento idempotente e limpar o timer corrente;
- manter erros apenas como nome/codigo sanitizados e registrar esgotamento sem
  payload privado;
- preservar health fail-closed, supervisor, rollback e flags financeiras.

## Evidencia local

- testes focados: `11/11`;
- testes diretamente afetados: `56/56`;
- sintaxe dos tres arquivos alterados: verde;
- `git diff --check`: verde;
- nenhuma chamada externa, mensagem, polling forcado ou escrita financeira nos
  testes.

## Estado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

O gate 34 continua `NO-GO` para nova promocao. Somente um commit imutavel,
publicado e aprovado pelo Chat pode gerar novo artefato e nova tentativa
operacional. A confirmacao de que a AWS antiga esta parada veio de Daniel; nao
foi revalidada independentemente nesta execucao.
