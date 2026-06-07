# Packet 10 - Dashboard and Summaries

## Objetivo

Alinhar dashboard, KPIs, graficos, resumos e explicacoes do WhatsApp com as
mesmas regras da Query Engine, preservando seguranca do token e privacidade.

## Referencias

- `docs/specs/financial-query-architecture.md`
- `docs/specs/financial-query-coverage-matrix.md`
- `docs/specs/financial-query-plan-contract.md`
- `docs/specs/financial-query-migration-roadmap.md`
- `docs/audits/financial-query-legacy-map.md`

## Arquivos provaveis

- `src/query/financialQueryEngine.js`
- `src/services/userSheetAnalyticsService.js`
- `src/services/dashboardServer.js`
- `src/handlers/messageHandler.js`
- `src/services/readModelService.js`
- `tests/dashboardApiContracts.test.js`
- `tests/dashboardAuthSecurity.test.js`
- `tests/financialExplainability.test.js`

## O que nao pode mudar

- Token de dashboard continua curto, bearer e sanitizado em logs.
- Dashboard admin amplo continua bloqueado por padrao.
- Nao recalcular KPIs por caminho paralelo ao WhatsApp.
- Nao expor dados de terceiros por token admin.
- Nao mudar emissao de link sem revisar seguranca.

## Criterios de aceite

- WhatsApp e dashboard usam a mesma base para os mesmos KPIs.
- Dashboard mostra criterio temporal quando o numero puder ser ambiguo.
- Categorias de cartao aparecem nos graficos quando fazem parte do criterio.
- Resumos nao duplicam calculo fora da Query Engine ou servico equivalente.
- API e UI continuam sem expor token em logs/referrer.

## Testes obrigatorios

- Contratos da API do dashboard.
- Seguranca de token valido, expirado e escopo invalido.
- Comparacao WhatsApp vs dashboard para mesmo periodo.
- Mes com cartao, saida, entrada, transferencia, reserva e orcamento.
- Regressao visual ou estrutural para graficos nao cortados.

## Perguntas de validacao

- `por que o dashboard mostra esse saldo?`
- `por que meu disponivel e diferente do saldo?`
- `o dashboard esta contando cartao?`
- `qual criterio desse grafico?`
- `me resume meu mes igual ao dashboard`

## Riscos

- Dashboard e WhatsApp divergirem.
- Grafico omitir categoria de cartao.
- Token encaminhado permitir acesso indevido.
- Reintroduzir admin amplo por conveniencia de beta.

## Criterio de pronto

Dashboard e resumos usam os mesmos criterios da Query Engine, com tokens
seguros e sem acesso cruzado indevido.
