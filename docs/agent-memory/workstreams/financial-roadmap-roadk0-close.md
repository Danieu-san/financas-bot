# Fechamento ROAD-K0 — contrato mínimo de convergência semântica

Data: 2026-08-27
Status: `GO ROAD-K0 — DOCUMENTAL/SEM RUNTIME`

## Resultado

ROAD-K0 congelou a linguagem financeira comum sem criar segunda IR e sem alterar código funcional.

Artefatos:

- `financial-roadmap-roadk0-contract-inventory.md` — inventário/reconciliação dos contratos existentes;
- `docs/specs/financial-semantic-convergence-contract-v1.md` — contrato semântico comum;
- `financial-roadmap-roadk0-fixtures.json` — fixtures de normalização, evidência e double-count.

## Decisões fechadas

1. `FinancialQueryPlan` normalizado continua a IR executável canônica.
2. `FinancialQuerySpec` é governança/aceitação, não segunda IR.
3. Base temporal canônica de resultado: `transaction_date | billing_month | due_date | settlement_date | as_of`.
4. `purchase_date -> transaction_date`, `current_state -> as_of`; `budget_cycle` pertence ao período; `context/none` não podem sobreviver quando material.
5. `evidence_state = confirmed | committed | projected | estimated | incomplete | unavailable`.
6. `empty` e zero são resultados comprovados, não saúde da fonte.
7. Coverage comum: `coverage_start`, `coverage_end`, `as_of`, `completeness`, `item_count`.
8. Provenance pública continua server-side, sanitizada e com fallback explícito.
9. `card_id` e IDs canônicos são identidade; labels são apresentação.
10. Transferência interna e pagamento de fatura não criam novo consumo; refund ligado compensa original; compra total e parcelas mensais não somam juntas na mesma métrica.
11. Saldo absoluto exige `as_of` e cobertura cumulativa suficiente.
12. Budget de ciclo não pode ser substituído por gasto diário.
13. Writer futuro deve preservar preview/confirmation quando aplicável, `operationKey`, provenance, estado e receipt, sem implementação em ROAD-K0.

## Evidência de escopo

Entre o HEAD de entrada `d3c1faccbb793d7b4f9478941442b2a073fc1123` e o candidato antes deste fechamento, somente três arquivos documentais/fixtures foram adicionados. Nenhum arquivo em `src/`, `scripts/`, `tests/`, configuração ou runtime foi alterado.

Por isso o gate específico de ROAD-K0 não exige auditoria independente de código: ele a exige **se houver mudança material de código**, o que não ocorreu. As decisões continuam sujeitas a testes/implementação e auditoria nos gates que modificarem runtime.

## Gate de saída

- IR única identificada: `SATISFIED`;
- `timeBasis` comum: `SATISFIED`;
- evidence/provenance/coverage: `SATISFIED`;
- source policy por domínio: `SATISFIED` no nível contratual;
- unavailable/empty/zero: `SATISFIED`;
- realized/committed/projected: `SATISFIED`;
- saldo e budget: `SATISFIED` no nível contratual;
- writer futuro: `SATISFIED` no nível contratual;
- fixtures de serialização/precedência/double-count: `SATISFIED`;
- zero runtime/produção: `SATISFIED`.

## Resíduos deliberados para ROAD-01..04

- validadores atuais ainda precisam convergir para `settlement_date/as_of`;
- consumers podem ignorar `timeBasis` na execução;
- identidade de cartão ainda diverge em consumers;
- source provenance de billing month, saldo real e schemas reais continuam em gates específicos;
- nenhuma migração ou writer foi executado.

## Próximo gate

`ROAD-01 — schema/identidade consumer-first` pode ser aberto. Toda mudança deve apontar para `financial-semantic-convergence-contract-v1.md` e não criar regras concorrentes.