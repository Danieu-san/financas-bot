# NEXT-00 — Validação do Golden Conversation Set v1

Data: 2026-08-30
Fatia: `NEXT00-04`, corrigida durante `NEXT00-05`
Estado: `VALIDADO LOCALMENTE APÓS AUDITORIA — AGUARDANDO REAUDITORIA`

## Escopo

Esta evidência valida somente o corpus sintético exigido pelo charter do
FinançasBot Next. Não implementa agente, kernel, tool, writer, integração,
dashboard, migração nem comportamento de produção.

## Artefatos

- `tests/fixtures/financasbot-next/golden-financial-fixture-v1.json`;
- `tests/fixtures/financasbot-next/golden-conversation-set-v1.json`;
- `tests/fixtures/financasbot-next/golden-claim-oracles-v1.json`;
- `scripts/agent/validateFinancasBotNextGoldenSet.mjs`.

O relógio é fixo em `2042-06-15T12:00:00-03:00`. Família, pessoas, contas,
cartões, categorias, eventos, propostas e valores são inteiramente fictícios.

## Distribuição obrigatória independente do corpus

| Classe | Casos | IDs |
|---|---:|---|
| simples | 16 | `S-01` a `S-16` |
| multi-tool | 16 | `M-01` a `M-16` |
| follow-up | 8 | `F-01` a `F-08` |
| negativa | 8 | `N-01` a `N-08` |
| **total** | **48** | — |

O validador fixa esses números e os 48 IDs no próprio contrato de teste; não
aceita que o corpus reduza a exigência alterando `required_class_counts`.

## Oracle factual

Os 48 casos contêm 56 turnos. Cada turno referencia exatamente uma entrada do
oracle tipado:

- 44 respostas materializadas;
- 6 insuficiências por coverage;
- 2 indisponibilidades;
- 3 bloqueios;
- 1 recusa de estimativa.

Toda claim materializada informa `metric`, valor tipado, unidade, entidade,
período, base temporal, coverage, evidence state e referências sintéticas de
evidência. Perguntas de total, comparação, ranking, saldo, fatura, orçamento,
ritmo, renda, conta a pagar, zero, estorno, transferência e parcelas não podem
mais ficar verdes apenas com marcadores como `ranking_from_kernel`.

O validador também recalcula da fixture sentinelas centrais: total familiar,
totais por pessoa, ranking, classes flexível/essencial e saldo da conta.

## Cobertura das dimensões críticas

| Dimensão | Casos |
|---|---:|
| pessoa/família | 14 |
| conta/cartão | 18 |
| categoria | 18 |
| período | 26 |
| base temporal | 17 |
| transferência | 3 |
| pagamento de fatura | 3 |
| estorno | 3 |
| projeção | 6 |
| zero | 3 |
| vazio | 3 |
| incompleto | 4 |
| indisponível | 4 |
| coverage de fonte | 14 |

As 14 dimensões e o piso de três casos são constantes independentes do JSON.

## Rastreabilidade causal dos contratos

Os 67 IDs agora nascem diretamente dos oito contratos primários, incluindo os
catálogos normativos `DA`, `SW`, `CP` e `MB`; o relatório intermediário dos
contratos 1 a 4 deixou de ser fonte do inventário.

Cada ID aparece uma única vez e obedece a uma policy independente:

- `mixed`: guard conversacional atual, mas verde causal ainda depende da fase;
- `documentary_static`: propriedade demonstrável no contrato/matriz atual;
- `deferred_executable`: nenhuma conversa é apresentada como prova.

Lease, epoch, retry, timeout, split-brain, CAS concorrente, rollback, retenção,
RPO/RTO, custo, latência, adapters e paridade runtime permanecem explicitamente
deferidos. `67/67` significa inventário completo e classificação causal, não
execução prematura de 67 propriedades.

## Sanitização e vocabulário

- eventos realizados usam o evidence state canônico `confirmed`;
- `realized` permanece apenas uma lente de consulta documentada;
- proposta apresentável usa `presented`, não `pending`;
- toda categoria referenciada existe no registry sintético;
- detecção cobre nomes reais conhecidos, URL, email, telefone, CPF/CNPJ, UUID,
  hashes/tokens longos, JWT, chaves e credenciais comuns;
- labels humanos permanecem na allowlist sintética `Pessoa A` a `Pessoa C`.

## Resultado reproduzível

```powershell
node scripts/agent/validateFinancasBotNextGoldenSet.mjs
```

```text
NEXT00-04 GOLDEN SET: PASS
cases=48,turns=56
classes={"simple":16,"multi_tool":16,"follow_up":8,"negative":8}
dimensions={"person_family":14,"account_card":18,"category":18,"period":26,"time_basis":17,"transfer":3,"invoice_payment":3,"refund":3,"projection":6,"zero":3,"empty":3,"incomplete":4,"unavailable":4,"source_coverage":14}
oracles=56,dispositions={"materialized":44,"insufficient":6,"unavailable":2,"refused":1,"blocked":3}
contract_traceability=67/67,source=primary_contracts,policy=causal-trace-v2
fixture_ids=50
```

## Prova negativa do validador

O comando `node scripts/agent/testValidateFinancasBotNextGoldenSet.mjs`
executa o baseline e sete mutações isoladas. Todas produziram RED no motivo
causal esperado, incluindo oracle quantitativo, classificação executável,
constantes autorreferenciais, sanitização, vocabulário e evidence ref.

## Interpretação

O conjunto agora congela tanto o comportamento conversacional quanto os fatos
materiais esperados. Ele ainda não prova um runtime inexistente: todas as
propriedades executáveis continuam nos gates futuros e NEXT-01 permanece
fechado até reauditoria e decisão explícita de Daniel.
