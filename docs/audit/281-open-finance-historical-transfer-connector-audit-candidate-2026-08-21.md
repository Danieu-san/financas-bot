# Gate 41 — nova superfície de auditoria da reconciliação estrita

Data: 2026-08-21

## Estado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

## Escopo

Este commit não altera produto nem teste. Ele cria um novo hash imutável para
uma única tentativa de auditoria com o conector GitHub disponível. A correção
causal permanece a publicada em
`c1e6deda511ca1348cf8101dde8e87f838b22531`; a prova curta permanece a
publicada em `afe9c93ea0b47f3964a32be1fb076824454acf78`.

## Arquivos que devem ser lidos integralmente

1. este manifesto;
2. `docs/audit/280-open-finance-historical-transfer-audit-access-recovery-candidate-2026-08-17.md`;
3. `tests/openFinanceHistoricalTransferStrictReconciliation.test.js`;
4. os patches completos dos commits `c1e6deda511ca1348cf8101dde8e87f838b22531`
   e `afe9c93ea0b47f3964a32be1fb076824454acf78`.

Os patches são a mudança causal canônica. O teste curto chama a função pública
`planOpenFinanceHistoricalImport`; snapshots sintéticos fornecem somente a
entrada e não substituem a decisão do produto.

## Questões de auditoria

1. A reconciliação de transferências exige igualdade textual direta para
   descrição, origem, destino, método, observação, status e `user_id`, aceitando
   equivalência de representação apenas para o valor monetário?
2. A prova curta percorre o planejador público nos caminhos familiar,
   unilateral revisado e reserva?
3. Cada variante negativa isolada mantém o item como `ready`, impedindo que uma
   linha divergente seja tratada como existente?
4. Resta defeito material ou lacuna causal indispensável dentro desse escopo?

## Limite

Contagens de testes permanecem evidência local relatada, não execução do
auditor. Mesmo um `GO TÉCNICO LOCAL` não autoriza escrita real: snapshot
vigente, plano e fingerprint novos, backup e rollback isolado continuam
obrigatórios antes do writer.
