# NEXT-00 — Validação do Golden Conversation Set v1

Data: 2026-08-31
Fatia: `NEXT00-04`, corrigida durante `NEXT00-05`
Estado: `VALIDADO LOCALMENTE APÓS SEGUNDA REAUDITORIA; NOVO SHA PENDENTE`

## Escopo

Esta evidência valida somente o corpus sintético do FinançasBot Next. Não
implementa agente, kernel, tool, writer, integração, dashboard, migração ou
comportamento de produção.

## Artefatos causais

- `golden-financial-fixture-v1.json`: fonte sintética;
- `golden-conversation-set-v1.json`: 48 casos e 56 turnos;
- `golden-claim-oracles-v1.json`: resultados esperados;
- `validateFinancasBotNextFacts.mjs`: registro determinístico de métricas;
- `validateFinancasBotNextGoldenSet.mjs`: invariantes do corpus;
- `testValidateFinancasBotNextGoldenSet.mjs`: mutações negativas.

O relógio é fixo em `2042-06-15T12:00:00-03:00`. Todas as identidades, datas e
quantias são fictícias.

## Cobertura independente

- 48 casos fixos: `16 simples / 16 multi-tool / 8 follow-ups / 8 negativos`;
- 56 turnos, cada um com exatamente um oracle;
- 14 dimensões críticas fixas, todas com ao menos três casos;
- 67/67 IDs extraídos dos oito contratos primários e classificados pela policy
  `causal-trace-v2`.

## Oracle factual causal

As 44 respostas materializadas contêm 76 fatos. Cada fato informa métrica,
valor, unidade, entidade, período, base temporal, coverage, evidence state e
evidence refs. Os 12 turnos restantes são fail-closed: 6 insuficientes, 2
indisponíveis, 3 bloqueados e 1 recusado.

O registro possui 39 avaliadores e recalcula todos os 76 fatos a partir da
fixture. Também restringe unidade, base temporal, evidence state e tipos de
evidência por métrica. Nenhum fato materializado fica verde apenas porque está
estruturalmente presente.

M-05 não afirma mais que um pagamento ligado ao cartão quita a fatura exibida.
Sem `statement_id` ou competência explícita, materializa
`statement_payment_correspondence=unproven`. M-15 também congela o resultado
vazio do Calendar.

## Resultado focal reproduzível

```powershell
node scripts/agent/validateFinancasBotNextGoldenSet.mjs
```

```text
NEXT00-04 GOLDEN SET: PASS
cases=48,turns=56
classes={"simple":16,"multi_tool":16,"follow_up":8,"negative":8}
dimensions={"person_family":14,"account_card":18,"category":18,"period":26,"time_basis":17,"transfer":3,"invoice_payment":3,"refund":3,"projection":6,"zero":3,"empty":3,"incomplete":4,"unavailable":4,"source_coverage":14}
oracles=56,dispositions={"materialized":44,"insufficient":6,"unavailable":2,"refused":1,"blocked":3},facts=76,metric_evaluators=39
contract_traceability=67/67,source=primary_contracts,policy=causal-trace-v2
fixture_ids=50
```

## Prova negativa

`node scripts/agent/testValidateFinancasBotNextGoldenSet.mjs` executa dois
baselines verdes e 18 mutações isoladas. Todas ficaram RED no motivo causal:
valor sentinela e não sentinela, unidade, entidade, período, base temporal,
evidência existente de tipo errado, saída do Calendar ausente, relação falsa
fatura/pagamento, evidence state incompatível, modo causal, constantes de
cobertura, sanitização, vocabulário, referência desconhecida e alteração de
limiar fora das antigas regexes.

## Interpretação

O corpus congela comportamento e fatos esperados sem apresentar propriedades
de runtime como provadas. Lease, concorrência, exactly-once, adapters, custo,
latência, retenção e paridade em execução permanecem deferidos. NEXT-01 segue
fechado.
