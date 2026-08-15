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
- o fallback SQLite também entrega o catálogo `Contas` ao matcher compartilhado,
  em vez de reclassificar uma conta cadastrada como gasto livre;
- o escopo familiar permite reconhecer uma conta de um membro paga no cartão
  do outro membro, sem liberar usuários fora do escopo autorizado.
- o read-model SQLite persiste e reconstrói `Saídas.Recorrente`, inclusive em
  bancos já existentes por migração aditiva de schema.

Cartões não possuem uma coluna autônoma `Recorrente` no contrato vigente da
planilha. Neles, uma cobrança recorrente é excluída por correspondência com o
catálogo `Contas`; saídas em conta continuam usando também a coluna
`Recorrente`. Nenhuma coluna sintética foi inventada neste candidato.

## Invariantes

- escopo pessoal/familiar e `user_id` permanecem obrigatórios;
- ausência de fonte ou orçamento não vira zero;
- nenhuma transação, configuração ou planilha é escrita por esta correção;
- pagamento de fatura, transferências internas e reserva não viram consumo;
- uma compra avulsa continua contada uma única vez.

## Evidência local

- RED causal: dashboard retornou zero para o ciclo vigente e a Query Engine
  contou a conta recorrente no cartão;
- o primeiro hash `def2fdb90f33adb8371848e7761688c7aeade155` permaneceu
  pendente por acesso parcial do auditor e revelou duas quebras confirmadas
  localmente: catálogo ausente no fallback SQLite e pagamento familiar
  divergente no dashboard; esse hash não foi implantado;
- RED corretivo: os dois cenários retornaram R$ 70,00 em vez de R$ 20,00;
- o segundo hash `306f3b6ce8c3f4573e3eeab1844d248934a89f1c`
  recebeu `NO-GO` porque o fallback SQLite descartava
  `Saídas.Recorrente`; esse hash também não foi implantado;
- RED da recorrência no fallback: R$ 60,00 contra R$ 20,00; após persistir e
  reconstruir o campo, o mesmo cenário ficou verde;
- provas focais de cartão/dashboard e fallback SQLite: 26/26;
- bateria causal afetada: 175/175;
- suíte hermética ampla do candidato corrigido: 1.733 testes, 1.723 aprovados,
  zero falha e 10 skips
  esperados;
- cobertura final pós-correção: linhas 91,52%, branches 74,31%, funções 91,10%;
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
