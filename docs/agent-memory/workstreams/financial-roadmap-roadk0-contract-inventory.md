# ROAD-K0 — inventário e reconciliação dos contratos semânticos existentes

Data: 2026-08-27
Branch: `chat/financial-roadmap-roadk0-20260827`
Base de entrada: `d3c1faccbb793d7b4f9478941442b2a073fc1123`
Status: `COMPLETE — STATIC CONTRACT INVENTORY`

## 1. Decisão de autoridade

ROAD-K0 **não cria uma segunda IR**.

A representação executável canônica continua sendo o `FinancialQueryPlan` normalizado por `normalizeFinancialQueryPlan`, conforme `docs/specs/financial-query-plan-contract.md` e `src/query/financialQueryPlan.js`.

`FinancialQuerySpec` permanece como contrato de governança/aceitação do corpus e catálogo de `domain/metric/operation/timeBasis/sourceHealth/evidence`; ele não substitui o `FinancialQueryPlan` como IR executável. Isso reconcilia a coexistência dos dois módulos sem greenfield.

A fachada `src/agent/financialSemanticReadFacade.js` permanece a fronteira read-only para o novo agente/ARQ: identidade, owner, escopo, ambiente e fonte física continuam sob autoridade do servidor; o modelo fornece somente argumentos semânticos allowlisted.

O `financialEvidenceAdequacyVerifier` permanece a prova determinística de que pessoa, período, base temporal, dimensões, fonte e ausência estão demonstrados pela leitura efetiva. O verificador numérico anterior continua composto, não substituído.

## 2. Contratos existentes reutilizados

| Contrato existente | Papel em ROAD-K0 | Decisão |
| --- | --- | --- |
| `FinancialQueryPlan` | IR executável entre interpretação e cálculo determinístico | **CANÔNICO** |
| `FinancialQuerySpec` | governança do corpus, catálogo de métricas e saúde da fonte | **AUXILIAR/NORMATIVO**, não segunda IR |
| `financialSemanticReadFacade` | envelope read-only, provenance, coverage, fallback, sanitização e autoridade server-side | **CANÔNICO para reads do ARQ** |
| `financialEvidenceAdequacyVerifier` | adequação de pessoa/período/timeBasis/dimensões/fonte/ausência | **CANÔNICO para prova de resposta** |
| `canonicalLedgerProjector` | identidade/eventos/linhas/links, datas financeiras e neutralidade de transferências/fatura | **CANÔNICO para semântica de eventos quando o ledger é a fonte** |
| `canonicalInstallmentSchedule` | identidade de schedule e ocorrências de parcelas observadas | **REUTILIZAR; não reconstruir** |
| `financialWriteLedger` | operation key, provenance sanitizada, status e receipt de escrita | **BASE do contrato de writer**, sem implementação em ROAD-K0 |

## 3. Divergências encontradas e resolução documental

### K0-D01 — vocabulário temporal divergente

`FinancialQueryPlan` aceita hoje `transaction_date`, `billing_month`, `due_date`, `budget_cycle`, `current_state`, `none`, `context`.

`FinancialQuerySpec` também conhece `purchase_date`, enquanto o roadmap v2 exige a linguagem comum `transaction_date | billing_month | due_date | settlement_date | as_of`.

Resolução:

- vocabulário **semântico canônico de resultado**: `transaction_date`, `billing_month`, `due_date`, `settlement_date`, `as_of`;
- `budget_cycle` passa a ser janela/política de período (`period.type=cycle`), não uma sexta origem temporal do fato;
- `purchase_date` é alias legado de `transaction_date` para compras, até migração consumer-first;
- `current_state` é alias legado de `as_of`;
- `context` e `none` são placeholders de planejamento e **não podem sobreviver** até uma resposta financeira final quando a base temporal altera o resultado;
- `settlement_date` ainda não está uniformemente suportado pelos validadores atuais: ROAD-01/03 devem convergir consumers, sem criar IR nova.

### K0-D02 — `evidence_state` não existe como enum único no runtime

Hoje há conceitos separados: `sourceHealth`, `coverage.status=available|empty|unavailable`, status de eventos (`settled|pending|uncertain|cancelled`) e status de schedules.

Resolução: `evidence_state` é o **estado semântico da afirmação/leitura**, derivado desses contratos; não substitui status contábil do evento.

Valores canônicos:

- `confirmed`: fato observado e suficientemente comprovado pela fonte;
- `committed`: obrigação/compromisso já constituído, ainda não necessariamente liquidado;
- `projected`: ocorrência futura determinística derivada de regra/schedule conhecido;
- `estimated`: aproximação/fallback calculado sem evidência suficiente para `confirmed`;
- `incomplete`: fonte acessível, mas cobertura insuficiente para a afirmação completa;
- `unavailable`: fonte necessária indisponível ou não autorizada.

`empty` não é `evidence_state`: é resultado de cobertura **completa** com zero itens. Zero numérico também não é estado de saúde da fonte.

### K0-D03 — coverage atual é mais simples que a necessidade do roadmap

A fachada atual expõe `coverage.status` e `itemCount`. ROAD-K0 congela o envelope mínimo futuro:

- `coverage_start`;
- `coverage_end`;
- `as_of`;
- `completeness = complete | partial | unknown | not_applicable`;
- `item_count` quando aplicável.

Compatibilidade: o envelope atual continua válido; consumers futuros enriquecem coverage sem quebrar a fachada. `empty` só pode sustentar “não houve” quando o período/escopo pedido está `complete`.

### K0-D04 — provenance de evento e provenance pública têm níveis diferentes

O ledger possui `source_type`, `source_row_ref`, hashes e idempotency key; a fachada pública bloqueia identificadores internos.

Resolução: provenance pública usa `authority`, `source`, `scope`, `fallback.used/reason`, `evidence_state` e coverage. Referências físicas/IDs internos permanecem server-side ou hash sanitizado quando indispensável para auditoria.

### K0-D05 — fonte física não pode ser escolhida pelo LLM

A arquitetura histórica prefere read-model/SQLite quando suficiente, com Sheets escopado como fallback; ARQ injeta adapters server-side.

Resolução: `source_policy` é determinística por domínio e considera cobertura/saúde. O modelo pode pedir uma capacidade, nunca selecionar `sheet_id`, `user_id`, banco, owner ou bypass de fallback.

## 4. Invariantes de dupla contagem congelados

1. Uma mesma ocorrência econômica contribui no máximo uma vez para a mesma métrica/timeBasis.
2. Compra no cartão e pagamento da fatura são eventos diferentes; pagamento da fatura é settlement/transferência de passivo e não cria novo consumo.
3. Transferência entre contas próprias é patrimonialmente neutra para renda/despesa.
4. Refund/estorno ligado ao original compensa o impacto do original; não vira renda comum. Sem vínculo suficiente, fica `incomplete/uncertain`, não “receita”.
5. Compra parcelada e ocorrências de parcelas não podem ser somadas simultaneamente na mesma métrica: `transaction_date` pode representar a compra/obrigação; `billing_month` representa as ocorrências competentes.
6. Regra recorrente e ocorrência liquidada são estados diferentes da mesma obrigação; queries devem escolher `committed/projected/confirmed` explicitamente.
7. Import/reconciliação que aponta para evento já conhecido não cria segunda contribuição financeira.

## 5. Identidade estável

- cartão: `card_id`; label/nome é apresentação, nunca chave contábil;
- evento: `event_id`/idempotency derivado da fonte canônica;
- fatura: `invoice_id` + `competence_month` + identidade estável do cartão;
- parcela: `schedule_id` + índice/total + competence da ocorrência;
- regra recorrente: `recurrence_rule_id` e ocorrência própria;
- writer: `operationKey` estável e receipt terminal.

## 6. Regra de cálculo

LLM interpreta intenção e pode redigir; ele não calcula total, saldo, orçamento, parcela, ranking, percentual ou decisão de fonte/escopo. Resultado financeiro final vem de código determinístico e deve carregar critério temporal e evidência quando isso puder alterar o valor.

## 7. Gaps que ROAD-K0 não corrige

- validadores ainda não convergem fisicamente para `settlement_date/as_of`;
- alguns consumers ainda ignoram `timeBasis` ou usam semântica própria;
- provenance de `Mês de Cobrança` histórico continua desconhecida;
- coverage cumulativa de saldo real continua externa;
- source policy detalhada de cartões/fechamento será fechada em ROAD-02;
- writers não são migrados por este gate.

Esses gaps são **entradas explícitas de ROAD-01..04**, não razão para criar um kernel paralelo.