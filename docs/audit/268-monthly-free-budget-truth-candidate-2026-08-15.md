# Verdade do orçamento mensal livre — candidato

Data: 2026-08-15

## Problema causal

O contrato público afirma que o orçamento livre exclui recorrentes, contas
cadastradas, transferências, dívidas e reserva. Antes deste candidato:

1. saídas em conta aplicavam essas exclusões, mas cartões eram somados sem a
   mesma elegibilidade no alerta, no dashboard e na Query Engine;
2. o dashboard associava o mês corrente ao ciclo que começaria naquele mês.
   Com início no dia 28, a visão de agosto selecionava 28/08–27/09 em vez do
   ciclo vigente 28/07–27/08;
3. o alerta mensal usava a data da compra para todo o impacto do cartão,
   enquanto dashboard e consultas usam competência/vencimento da parcela.

## Correção

- uma política compartilhada de elegibilidade exclui recorrentes, contas
  cadastradas, transferências, dívidas, investimento, caixinha e reserva;
- despesas avulsas de qualquer outra categoria continuam elegíveis;
- a mesma política é usada no alerta, dashboard e Query Engine, inclusive para
  cartão;
- o mês de relatório passa a representar o ciclo que contém o meio daquele mês,
  mantendo agosto como 28/07–27/08 quando o início é dia 28;
- parcelas de cartão impactam o total do ciclo pela competência/vencimento; o
  alerta diário continua reagindo no dia da compra para permanecer proativo;
- o fallback SQLite usa a mesma resolução temporal.

## Invariantes

- escopo pessoal/familiar e `user_id` permanecem obrigatórios;
- ausência de fonte ou orçamento não vira zero;
- nenhuma transação, configuração ou planilha é escrita por esta correção;
- pagamento de fatura, transferências internas e reserva não viram consumo;
- uma compra avulsa continua contada uma única vez.

## Evidência local

- RED causal: dashboard retornou zero para o ciclo vigente e a Query Engine
  contou a conta recorrente no cartão;
- prova focal de ciclo e cartão: 3/3;
- bateria causal de orçamento/Query Engine/dashboard/SQLite: 22/22;
- estados financeiros de orçamento: 9/9;
- suíte hermética ampla: 1.731 testes, 1.721 aprovados, zero falha e 10 skips
  esperados;
- cobertura: linhas 91,53%, branches 74,38%, funções 91,10%;
- sintaxe e `git diff --check`: verdes.

As contagens são execução local do Codex e não devem ser tratadas pelo auditor
como execução independente.

## Limite operacional observado

O orçamento vigente está ativo em escopo familiar e ciclo iniciado no dia 28.
O RX histórico continua read-only; portanto, somente lançamentos já gravados na
fonte financeira podem compor o realizado. A correção não inventa nem importa
movimentos ausentes.

## Critério de fechamento

O candidato só pode receber `GO TÉCNICO LOCAL` após auditoria independente do
hash imutável confirmar paridade entre alerta, dashboard e consulta, sem dupla
contagem, ampliação de escopo ou escrita financeira.
