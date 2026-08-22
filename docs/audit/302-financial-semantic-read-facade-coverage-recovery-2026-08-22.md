# ARQ-02 — recovery da semântica de cobertura

Data: 2026-08-22

## Estado

`RECOVERY CANDIDATO AGUARDANDO REAUDITORIA INDEPENDENTE`.

## Achado independente no hash anterior

O Chat confirmou integralmente o hash
`8e92d7e28c35e93e4878db98d90363aae12e4ac9`, os seis arquivos pedidos, a
autoridade confiável de identidade/escopo, os adapters reais, a sanitização, a
ausência de writer e o consumo não duplicado do envelope.

O veredito foi `NO-GO` por um único achado médio: `inferItemCount` usava a
quantidade de `snapshot.recentTransactions` para classificar toda a evidência.
Assim, um dashboard válido com KPIs e zero transações recentes podia aparecer
como `empty`. O parecer também pediu consistência para resultados financeiros
com coleção `items` vazia.

## Recovery

`inferItemCount` passou a interpretar coleções de acordo com a capacidade:

- `recent_transactions` e `readonly_aggregate`: contam somente `rows` ou o
  `rowCount` do adapter;
- `financial_query`: contam arrays em `result.value`, `value.items`,
  `result.details` ou `details.items`;
- `metric_explanation`: conta apenas quando `components` é coleção;
- `dashboard_snapshot`: não usa `recentTransactions` como proxy do dashboard;
  um snapshot válido permanece `available` mesmo sem lançamentos recentes.

Não houve alteração em fonte, cálculo financeiro, adapter, resposta pública,
flag, writer ou produção.

## Controles adicionados

1. dashboard com KPI material e `recentTransactions: []` exige
   `available/itemCount:null`;
2. consulta financeira com `value.items: []` exige `empty/itemCount:0`.

## Evidência local após o recovery

- fachada: `8/8`;
- recorte afetado de dashboard/contexto: `13/13`;
- suíte hermética ampla final: `1.764/1.774`, zero falha, dez ignorados;
- cobertura: linhas `91,64%`, branches `74,53%`, funções `91,20%`.

As contagens são execução local relatada, não execução do auditor.

## Critério de reauditoria

Confirmar no novo hash que o achado médio foi fechado sem regressão nos
controles já aprovados. Com GO, fica autorizado somente fechar tecnicamente o
ARQ-02 e iniciar o desenho do ARQ-03 em shadow. Deploy, canário, writer e
retirada do legado continuam proibidos.
