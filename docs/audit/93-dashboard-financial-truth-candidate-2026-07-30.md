# DASH-DATA-01 — candidato de verdade financeira dos dashboards

Data: 2026-07-30

## Veredito local

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

Este documento não autoriza deploy, mudança de flags, restart, leitura adicional
de produção nem promoção do dashboard v2.

## Problemas reproduzidos

1. O comando simples `dashboard` entrega o dashboard v1; v2 continua opt-in.
2. V1 calculava `Saldo` como resultado econômico do período e apresentava uma
   posição de contas estimada por saldo inicial mais lançamentos.
3. V2 podia obter contas pelo leitor canônico e faturas pela previsão, portanto
   não compartilhava uma única posição atual com v1.
4. O cofre Open Finance já separava saldo de conta, fatura formal, limite total,
   limite disponível e limite usado, mas não projetava esses dados para os
   dashboards.
5. Linhas controladas `TESTE_APAGAR_<identificador>` podiam aparecer e afetar
   agregações públicas, embora precisassem permanecer no histórico de auditoria.

## Contrato implementado

- O novo `dashboardFinancialTruthService` abre o cofre de staging em modo
  SQLite somente leitura.
- O escopo permitido deriva dos `user_id` financeiros autorizados e dos nomes
  ativos Daniel/Thaís; alias ou cartão não concede acesso.
- Contas bancárias usam `balance_cents`.
- Cartões mantêm `currentInvoice`, `totalLimit`, `availableLimit` e `usedLimit`
  em campos distintos. A fatura vem exclusivamente da entidade formal `Bill`;
  limite usado nunca é renomeado como fatura.
- A fatura corrente é a primeira fatura formal com vencimento igual ou posterior
  ao dia observado.
- A observação carrega `observedAt`. Acima de oito horas por padrão, ou do valor
  configurado, o status vira `partial`/`stale`; os valores não são apresentados
  como atuais confirmados.
- Fonte ausente não vira zero. A conta derivada do ledger pode permanecer apenas
  como `fallback` e `ledger_estimate`; fatura e limites desconhecidos ficam
  `null`.
- V1 e V2 recebem a mesma fotografia autorizada de contas e cartões. Previsão
  continua separada da fatura formal e resultado econômico do mês continua
  separado do saldo bancário.
- O comando simples `dashboard` continua explicitamente no v1; somente os
  comandos com `v2`/`novo` abrem a interface de avaliação.

## Exclusão não destrutiva de testes

Antes de qualquer agregado público:

- a leitura da planilha remove linhas com marcador controlado de gastos,
  entradas, cartões, transferências, configurações, metas, dívidas, contas e
  contas financeiras;
- o consumidor v2 pede ao Query Engine a mesma exclusão para tabelas, orçamento
  canônico e qualidade;
- eventos, linhas do ledger, planilha e evidências de teste não são excluídos,
  alterados nem regravados;
- consultas normais do bot não recebem o filtro implícito.

## Provas

Fixtures financeiras são sintéticas e não reproduzem valores reais.

- prova focal final: `12/12`;
- prova transversal anterior à troca puramente sanitizante da fixture:
  `98/98`;
- suíte hermética ampla no mesmo código de produto:
  `1.395` testes, `1.390` aprovados, zero falha e cinco skips esperados;
- sintaxe dos sete arquivos JavaScript afetados: verde;
- `git diff --check`: verde.

A troca posterior dos números da fixture removeu valores de conferência antes
do commit público. Nenhum código de produto mudou depois da suíte ampla; a
fixture sanitizada passou novamente na prova focal final.

## Limites

- Nenhuma leitura real adicional foi feita por este gate.
- O dashboard não força atualização do banco/Meu Pluggy; o runtime continua com
  polling mínimo de seis horas.
- Resultado por data da transação e gasto por competência são conceitos
  deliberadamente distintos e aparecem rotulados.
- A interface v2 não foi promovida a padrão.
- A correção ainda exige commit público sanitizado e auditoria independente por
  hash imutável.
