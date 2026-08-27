# Financial Semantic Convergence Contract v1

Status: `ROAD-K0 FROZEN — DOCUMENTAL CONTRACT`
Data: 2026-08-27
Scope: consultas, evidência e writers futuros do FinançasBot
Runtime impact: nenhum

## 1. Autoridade e IR

A IR executável continua sendo o `FinancialQueryPlan` normalizado por `normalizeFinancialQueryPlan`.

`FinancialQuerySpec` permanece contrato de aceitação/governança. Ele pode descrever métricas, evidência e saúde de fontes para testes e Golden Sets, mas não vira segunda IR executável.

Toda identidade real, escopo autorizado e fonte física são resolvidos fora do LLM.

## 2. Envelope semântico mínimo

Uma leitura financeira que possa sustentar resposta deve ser representável por:

```json
{
  "query": {
    "domain": "expenses",
    "metric": "expenses_total",
    "operation": "sum",
    "scope": "family",
    "time_basis": "transaction_date",
    "period": { "type": "month", "month": 7, "year": 2026 }
  },
  "result": {
    "value": 0,
    "evidence_state": "confirmed"
  },
  "provenance": {
    "authority": "server",
    "source": "canonical_read_model",
    "scope": "family",
    "fallback": { "used": false, "reason": null }
  },
  "coverage": {
    "coverage_start": "2026-08-01",
    "coverage_end": "2026-08-31",
    "as_of": "2026-08-27",
    "completeness": "complete",
    "item_count": 0
  }
}
```

O formato exato dos adapters atuais pode ser diferente; este contrato congela **semântica**, não exige mudança de runtime dentro do ROAD-K0.

## 3. `time_basis`

Valores canônicos:

- `transaction_date`: data econômica/da transação observada; para compra de cartão, corresponde à data da compra;
- `billing_month`: competência da fatura/parcela;
- `due_date`: vencimento de obrigação;
- `settlement_date`: data de liquidação/pagamento quando essa distinção for relevante;
- `as_of`: estado/saldo em um instante ou data de corte.

Compatibilidade obrigatória:

- `purchase_date` -> alias legado de `transaction_date` para compras;
- `current_state` -> alias legado de `as_of`;
- `budget_cycle` -> janela de período, não fonte temporal do evento;
- `context`/`none` -> placeholders de planner; devem ser resolvidos antes de uma resposta em que a base temporal muda o resultado.

Uma resposta que possa surpreender o usuário deve nomear o critério temporal usado.

## 4. `evidence_state`

- `confirmed`: observado/comprovado por fonte adequada;
- `committed`: obrigação ou compromisso constituído, ainda não necessariamente liquidado;
- `projected`: ocorrência futura derivada deterministicamente de regra/schedule conhecido;
- `estimated`: aproximação calculada/fallback não suficientemente autoritativo;
- `incomplete`: fonte acessível, porém cobertura insuficiente para a afirmação completa;
- `unavailable`: fonte necessária não disponível ou não autorizada.

Regras:

- `empty` não é evidence state; significa coleção vazia **com cobertura completa**.
- `zero` não é source health; é resultado numérico comprovado.
- `partial/stale` de source health não viram automaticamente `confirmed`.
- projeção nunca é apresentada como realizado.

## 5. Coverage

Campos semânticos:

- `coverage_start`: início conhecido da cobertura, nullable;
- `coverage_end`: fim conhecido da cobertura, nullable;
- `as_of`: data/hora de corte da evidência, obrigatória para métricas de estado quando aplicável;
- `completeness`: `complete | partial | unknown | not_applicable`;
- `item_count`: contagem pública quando aplicável.

Invariantes:

- fonte indisponível ≠ zero;
- coleção vazia só permite alegação de ausência quando o recorte solicitado estiver `complete`;
- saldo “atual” exige `as_of` e cobertura suficiente; caso contrário `incomplete`/`unavailable`.

## 6. Provenance

Provenance pública mínima:

- `authority=server`;
- `source` sem identificador sensível;
- `scope` público (`personal|family|member`);
- `fallback.used` e `fallback.reason`;
- `evidence_state`/coverage associados à afirmação.

IDs físicos (`user_id`, `sheet_id`, row refs, tokens, paths, owner ids) não entram no contexto do LLM nem na resposta pública. O ledger pode manter referências internas/hash para idempotência e reconciliação.

## 7. Source policy por domínio

### Escopo/autorização
Fonte autoritativa: policy/server-side. Planilha, label ou LLM nunca ampliam escopo.

### Transações, renda e transferências
Preferir fonte canônica/read-model com cobertura suficiente. Fallback para fonte escopada existente somente com provenance explícita. Não misturar fontes sobrepostas sem reconciliação/dedup.

### Cartões/faturas/parcelas
Identidade por `card_id`. Competência usa evidence/provenance; `closingDay` e labels são fallback/apoio, não identidade nem confirmação de competência. Precedência detalhada fica em ROAD-02.

### Saldo/contas
Usar snapshot reconciliado com `as_of` ou ledger cumulativo com cobertura demonstrada. Recorte mensal de movimentos não prova saldo atual.

### Budget
Cálculo determinístico sobre eventos elegíveis e janela de ciclo. `budget_cycle` pertence ao período. Pagamento de fatura e transferências internas não criam gasto de consumo adicional.

### Refund/estorno
Evento de compensação ligado ao original. Sem vínculo suficiente, não classificar como renda comum; marcar evidência insuficiente.

### Recorrências
Regra e ocorrência são entidades distintas. Regra futura = `projected/committed` conforme obrigação; liquidação observada = `confirmed`. Escopo ausente falha fechado.

### Personal sheet
Fonte só pode ser usada sob contexto de planilha autorizado e provenance explícita; indisponibilidade não autoriza fallback para outra família/owner.

## 8. Dupla contagem

Para qualquer métrica, definir explicitamente `economic_contribution_key` ou equivalente determinístico. A mesma ocorrência econômica não pode contribuir duas vezes no mesmo recorte.

Regras mínimas:

1. compra no cartão conta como consumo/obrigação conforme `time_basis`; pagamento da fatura não soma novo consumo;
2. transferências entre contas próprias são neutras para renda/despesa;
3. refund/estorno reduz/compensa o original quando o vínculo é comprovado;
4. compra parcelada total e ocorrências mensais nunca são somadas juntas na mesma métrica;
5. regra recorrente e settlement observado não são duas despesas;
6. evento importado reconciliado com evento existente não cria duplicata.

## 9. Identidade estável

- cartão: `card_id`;
- evento: `event_id`/idempotency server-side;
- fatura: identidade estável de cartão + competência, materializada em `invoice_id` quando disponível;
- schedule: `schedule_id`;
- recurring: `recurrence_rule_id` + occurrence id;
- write: `operationKey` + receipt.

Nome, descrição e label são atributos de apresentação/pesquisa, não chaves contábeis.

## 10. Contrato de saldo

Uma resposta de saldo deve informar ou ser internamente capaz de provar:

- `as_of`;
- saldo/snapshot de abertura ou ponto inicial conhecido;
- movimentos cumulativos necessários até `as_of`;
- completeness da cobertura;
- fonte/provenance.

Se a cobertura começa depois do ponto necessário, retornar `incomplete`, não saldo absoluto confirmado.

## 11. Contrato de budget

Uma resposta de orçamento deve separar:

- `period.type=cycle` e seus limites;
- `spent_cycle`/realizado do ciclo;
- `spent_today` quando pedido;
- committed/projected quando incluídos;
- regras de elegibilidade;
- evidence state e source coverage.

`spent_today` jamais substitui `spent_cycle` para operação `sum` do orçamento do ciclo.

## 12. Contrato futuro de writer

ROAD-K0 não implementa writer. Todo writer futuro deve, no mínimo:

1. resolver actor/scope server-side;
2. produzir preview determinístico antes do efeito quando o comando exigir confirmação;
3. vincular confirmação ao preview/versão correspondente;
4. gerar `operationKey` idempotente;
5. registrar provenance sanitizada e versão de validação;
6. persistir estado `pending | committed | uncertain | failed` e receipt;
7. não ampliar fonte/escopo por conteúdo do LLM;
8. aplicar as mesmas regras de identidade, evidence state e double-count do read path;
9. suportar replay seguro ou recusar replay ambíguo;
10. separar claramente “pedido interpretado” de “efeito financeiro confirmado”.

`financialWriteLedger` é a base já existente para operation key/status/provenance/receipt; ROAD-07 decidirá convergência por comando.

## 13. Determinismo e papel do LLM

LLM pode:

- interpretar intenção;
- escolher entre capacidades semânticas allowlisted;
- pedir esclarecimento;
- redigir uma explicação a partir de evidência adequada.

LLM não pode:

- decidir autorização real;
- escolher `user_id`, owner, sheet/database/path;
- calcular valor financeiro final;
- converter source unavailable em zero;
- promover projected/estimated para confirmed;
- executar writer a partir de pergunta read-only.

## 14. Critério de adoção pelos próximos gates

ROAD-01..04 devem apontar para este contrato e registrar qualquer exceção explicitamente. Nenhum deles pode criar enum temporal, evidence state, regra de zero/unavailable, identidade ou double-count concorrente sem reabrir ROAD-K0.