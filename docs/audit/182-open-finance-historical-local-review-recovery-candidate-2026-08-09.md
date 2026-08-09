# Gate 35 — recovery da sanitizacao do CLI local

Data: 2026-08-09

## Base e veredito anterior

O commit imutavel
`e5f510d0a439c8492de7a46a730a38d0b4e96f96` recebeu `NO-GO TECNICO LOCAL`.
O auditor leu integralmente os nove arquivos indicados e considerou consistente
o canal local, as equivalencias, a decisao coletiva exata, a persistencia, o
replay, a compatibilidade WhatsApp e a fronteira read-only. A lacuna unica foi o
stderr do CLI imprimir `error.message`: falhas nativas de filesystem poderiam
incluir o caminho privado.

## Recovery

Arquivos causais:

- `scripts/runOpenFinanceHistoricalLocalReview.js`;
- `tests/openFinanceHistoricalLocalReviewCli.test.js`.

O novo `sanitizePublicError` aceita somente codigos de dominio formados por
caracteres seguros. Argumento desconhecido e valor ausente viram codigos fixos,
sem repetir o valor recebido. Qualquer erro nativo ou inesperado vira
`historical_local_review_operation_failed`. O stderr continua contendo apenas
operacao, resultado, codigo sanitizado e `financial_writes=0`.

O teste prova que uma mensagem nativa contendo path privado, um argumento cujo
valor contem esse path e um valor ausente com o mesmo conteudo nao aparecem na
saida sanitizada. Um codigo de dominio conhecido continua observavel.

## Evidencia local

- syntax check do CLI: verde;
- teste focal do CLI: `3/3`, zero falhas;
- bateria causal Gate 35: `42/42`, zero falhas;
- suite hermetica ampla: `1566` testes, `1556` aprovados, zero falhas, `10`
  skips previstos, zero cancelados e zero TODO;
- cobertura ampla: linhas `90,90%`, branches `73,58%`, funcoes `90,57%`;
- executor amplo: `valid=true`, `exit_status=0`, rede bloqueada e stderr vazio;
- nenhum dado real, snapshot privado, producao, SSH ou WhatsApp foi acessado;
- `financial_writes=0` em toda a fronteira.

## Criterio da reauditoria

Confirmar no novo hash que nenhum erro alcancavel pelo CLI pode devolver path,
argumento ou mensagem nativa; que os codigos permitidos nao carregam conteudo
livre; e que o recovery nao altera o contrato funcional previamente considerado
consistente. Ate GO independente, permanece `HOLD ANTES DE DADOS REAIS`.
