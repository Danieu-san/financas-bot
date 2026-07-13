# Gate da Fase 4B - API de dashboard v2

Data: 2026-07-13

## Escopo

Implementacao exclusiva dos cinco passos oficiais de `4B - API de dashboard
v2`: contrato sanitizado, testes dos blocos, endpoint sobre o mesmo motor
financeiro, privacidade recursiva e fallback seguro por fonte. A interface
mobile-first da 4C, os indicadores completos da 4D e qualquer troca do
dashboard padrao ficaram fora do escopo.

## Contrato

`GET /dashboard/api/v2/summary` devolve `dashboard-summary-v2` e onze blocos:

1. caixa atual e contexto economico do periodo;
2. realizado por competencia;
3. reserva;
4. orcamento por categoria/ciclo;
5. contas;
6. faturas;
7. previsoes;
8. metas;
9. dividas;
10. qualidade;
11. lancamentos recentes.

Cada bloco declara status e criterio. Fonte parcial nao derruba os demais
blocos. Valor desconhecido fica `null`, com `source_unavailable`, e nunca vira
zero. Contas usam o snapshot sanitizado somente como fallback explicito.

## Autoridades e criterios

- Snapshot atual/read-model: contexto economico, reserva, metas, dividas e
  recentes.
- Query Engine: total e categorias por competencia.
- Contrato da 4A: orcamento por categoria e ciclo.
- Ledger canonico: saldos atuais de contas, faturas e previsoes.
- Qualidade: somente indicadores fornecidos por fonte confiavel. Ausencia nao e
  convertida em contagem zero; a cobertura detalhada continua na 4D.

Caixa atual usa saldo das contas. Entradas, saidas diretas e compromissos de
cartao do periodo sao contexto economico por data da transacao e permanecem em
campos separados. O realizado por competencia usa criterio de cobranca do
Query Engine. Assim, a API nao mistura caixa, competencia ou patrimonio.

## Privacidade e isolamento

A identidade do token e a unica autoridade da rota v2. Parametro `user` e
sempre rejeitado, inclusive para admin e com a excecao beta
`DASHBOARD_ADMIN_ALL_USERS_ENABLED=true`. Familia expande somente por vinculos
ativos da planilha compartilhada. A sanitizacao recursiva bloqueia ids internos,
hashes, chaves de idempotencia, referencias de planilha, OAuth, tokens e dados
crus em qualquer profundidade.

## Evidencia local

- Estado RED inicial: modulo v2 ausente e rota inexistente.
- Bateria especifica de contrato/composicao/seguranca: `19/19`.
- Bateria sequencial dos componentes compartilhados: `123/123`.
- Suite completa existente: `770/770`.
- O novo arquivo de testes foi incluido em `npm test` e `npm run test:unit`
  depois da execucao completa; seus quatro casos ja estavam aprovados na bateria
  especifica, portanto a suite integral nao foi repetida.
- Auditoria de dependencias em nivel high: `0 vulnerabilities`.
- Sintaxe dos modulos alterados: aprovada.
- `git diff --check`: aprovado, com apenas avisos esperados de LF/CRLF.

## Decisao

`GO local` para a Fase 4B. Nenhuma flag, `.env`, planilha real, dado financeiro
real ou interface visual foi alterado. O GO de producao depende de commit/push,
deploy por fast-forward, testes remotos, saude do processo, bloqueio de token e
escopo, e smoke estrutural read-only do endpoint sem imprimir valores
financeiros. Depois do fechamento, o proximo passo oficial e `4C - Dashboard
familiar v2 mobile-first`.
