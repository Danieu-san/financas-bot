# Fase 2 - Gate consolidado de contas, datas e status

Data: 2026-07-04
Status: GO para encerrar a subfatia de captura/projecao; NO-GO para saldo canonico como fonte primaria ampla

## Escopo consolidado

Este gate consolida a fatia da Fase 2 que adicionou contas financeiras reais,
datas/status e movimentos por conta ao ledger canonico em shadow/canary.

Entram neste gate:

- saldos iniciais reais em `Contas Financeiras`;
- leitura canario `accounts` junto de `transactions` e `transfers`;
- filtro de saldo por movimentos `settled`;
- movimentos marker-only datados com status concluido/pendente;
- contrato explicito `Conta Financeira` em `Saidas` e `Entradas`;
- captura conversacional de conta para gastos/entradas unitarios fora do credito;
- captura conversacional de origem/destino para transferencias unitarias;
- limpeza marker-only e restauracao do baseline de saldos.

Nao entram neste gate:

- transformar saldo canonico em fonte primaria ampla para dashboard ou todas as
  respostas de WhatsApp;
- lotes/importacoes/extratos;
- pagamentos de fatura, contas recorrentes ou dividas com conta pagadora nativa;
- remocao de legado;
- Fase 3 de recorrencias/faturas nativas.

## Evidencia resumida

| Corte | Evidencia | Decisao |
| --- | --- | --- |
| Fonte de contas reais | `ACCOUNTS_SOURCE_REAL_20260703` persistiu 4 contas reais com privacidade OK e `accounts` canary ativo | GO |
| Status de saldo | Teste RED/GREEN impediu transferencia `pending` de mover saldo atual | GO |
| Movimentos marker-only | Runner `runCanonicalLedgerAccountMovementsGate.js` cobriu gasto, entrada, transferencia settled e transferencia pending, com cleanup | GO |
| Contrato `Conta Financeira` | Headers aditivos em `Saidas`/`Entradas`; projector usa conta explicita e nao confunde `PIX`/`Debito`/`Dinheiro` com conta | GO |
| Captura gasto/entrada | Smoke produtivo R$ [redigido]/R$ [redigido] pediu conta, gravou coluna, projetou no ledger e foi limpo | GO |
| Captura transferencia | Smoke produtivo de caixinha concluida e transferencia familiar pendente/cancelada preservou origem, destino, data, status, neutralidade e cleanup | GO |

## Baseline apos limpeza

Depois da limpeza dos marcadores de gasto/entrada/transferencia, os saldos
canario voltaram ao baseline:

- conta corrente do membro A: R$ [redigido]
- conta-reserva do membro A: R$ [redigido]
- conta corrente do membro B: R$ [redigido]
- segunda conta do membro B: R$ [redigido]

Backups relevantes:

- `data/backups/canonical_ledger_shadow.pre-accounts-source-20260703T1220Z.sqlite`
- `data/backups/canonical_ledger_shadow.pre-account-movements-20260703T1800Z.sqlite`
- `data/backups/canonical_ledger_shadow.pre-transfer-smoke-cleanup-2026-07-04T04-10-15-899Z.sqlite`
- `/home/ubuntu/financas-bot-backups/.env.pre-canonical-accounts-canary-20260703T1225Z`

Flags preservadas:

- `FINANCIAL_AGENT_MODE=answer`
- `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=true`
- `FINANCIAL_CONTEXTUAL_ANALYST_MODE=answer`
- `FINANCIAL_COMMAND_PLANNER_MODE=canary`
- `INTERPRETATION_RELIABILITY_MODE=shadow`
- `CANONICAL_LEDGER_CANARY_READ_DOMAINS=transactions,transfers,accounts`

## Decisao

GO para encerrar a subfatia de Fase 2 que prova captura e projecao de
contas/datas/status para movimentos unitarios de gasto, entrada e transferencia.

NO-GO para promover `accounts` como fonte primaria ampla de saldo familiar. O
dominio esta verde como canario/diagnostico, mas ainda falta um gate especifico
de leitura que compare respostas do WhatsApp, read-model, dashboard e ledger
para perguntas de saldo por conta, saldo total, caixinha/reserva e historico por
periodo.

## Proxima fatia recomendada

Ainda dentro da Fase 2, executar um gate de leitura de saldos/contas antes de
qualquer cutover:

1. criar perguntas adversariais de saldo por conta, saldo total, caixinha,
   contas zeradas, data relativa e periodo;
2. comparar WhatsApp, read-model atual, canary `accounts`, Sheets e dashboard;
3. testar fallback quando o canary falha fechado;
4. manter escrita inalterada e sem ampliar flags;
5. decidir GO/NO-GO para usar saldo canonico em respostas especificas, ainda sem
   remover legado.
