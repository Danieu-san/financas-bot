# Packet 02 - Cards, Invoices and Installments

## Objetivo

Migrar cartoes, faturas e parcelamentos para `query_engine_primary`, cobrindo
valor de fatura, itens de fatura, compras futuras, parcelas abertas,
agrupamento por cartao e explicacao de bases temporais.

## Referencias

- `docs/specs/financial-query-architecture.md`
- `docs/specs/financial-query-coverage-matrix.md`
- `docs/specs/financial-query-plan-contract.md`
- `docs/specs/financial-query-migration-roadmap.md`
- `docs/audits/financial-query-legacy-map.md`

## Arquivos provaveis

- `src/query/financialQueryPlan.js`
- `src/query/financialQueryEngine.js`
- `src/handlers/messageHandler.js`
- `src/services/calculationOrchestrator.js`
- `src/services/readModelService.js`
- `tests/unit.test.js`
- `tests/readModelSqlite.test.js`
- `tests/financialExplainability.test.js`

## O que nao pode mudar

- Cadastro de cartoes e lancamento de compras continuam Command Engine.
- Nao alterar abas reais de cartao sem necessidade.
- Nao esconder a diferenca entre compra, fatura, vencimento e parcela.
- Nao tratar pagamento de fatura como gasto novo.
- Nao enviar detalhes crus de fatura ao Gemini.

## Criterios de aceite

- Perguntas de fatura geram `domain=cards` ou `domain=transfers` quando forem
  pagamento de fatura.
- Itens de fatura e parcelamentos sao agrupados de forma auditavel.
- Compra parcelada aparece como compra unica quando a pergunta pedir compra, e
  como parcelas quando a pergunta pedir vencimentos/parcelas.
- Resposta declara `purchase_date`, `billing_month`, `due_date` ou ciclo usado.
- Fallback legado de faturas/parcelamentos fica removido ou isolado apos
  paridade.

## Testes obrigatorios

- Fatura atual, anterior e futura.
- Compra a vista e compra parcelada.
- Itens por cartao especifico.
- Cartao com maior valor em aberto.
- Parcelas futuras agrupadas por compra.
- Pergunta ambigua sobre "este mes" pedindo ou declarando criterio.

## Perguntas de validacao

- `quanto esta a fatura deste mes?`
- `quais compras compoem a fatura?`
- `me mostra os itens da fatura`
- `quais parcelas ainda tenho para pagar?`
- `qual cartao tem mais valor em aberto?`
- `e no nubank thais?`

## Riscos

- Contar parcela como compra duplicada.
- Deixar fatura zerada por erro de fonte.
- Misturar cartao por data da compra em uma resposta de fatura.
- Nao separar pagamento de fatura de consumo no cartao.

## Criterio de pronto

Cartoes, faturas e parcelamentos respondem pela Query Engine, com base temporal
explicita e sem calculo legado principal.
