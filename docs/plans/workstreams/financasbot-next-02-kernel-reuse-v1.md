# NEXT-02 — Reutilização e primeira fatia do kernel

Estado: implementação incremental; não é GO do NEXT-02.

## Inspeção do v1 e decisão AST-04

Fontes: `src/ledger/canonicalLedgerProjector.js`,
`tests/canonicalLedgerProjector.test.js`,
`docs/contracts/next/data-authority-contract-v0.md`.

| Comportamento v1 | Destino |
|---|---|
| stableStringify, hash determinístico | adaptar para JSON estrito e SHA-256 integral |
| evento estável, replay, vínculos explícitos | extrair comportamento; identidade não depende do valor mutável |
| compra e pagamento de fatura separados | preservar neutralidade de consumo |
| transferência/reserva neutras | preservar tipos e validar vínculos/escopo |
| estorno ligado à compra | preservar; rejeitar excesso acumulado, não truncar silenciosamente |
| cents inválido vira zero | não portar; centavos inteiros seguros obrigatórios |
| transferência inferida por descrição | não portar como autoridade |
| matching de nomes/linhas e acesso legado | não portar; adapters reais só NEXT-04 |
| agenda de parcelas/invoices/recorrência | mapear na fatia posterior, sem declarar coberta pela primeira |

## Fatia N02-A

Primeiro estabelecer a base append-only e determinística de observações e
eventos, com compras, receita, transferência, pagamento de fatura e estorno.
Não habilitar tipo ainda sem semântica completa: parcela, reversão, reserva,
ajuste e saldo inicial devem falhar explicitamente nesta fatia.

Entrada: observações normalizadas de import sintético e catálogo confiável
server-side. Não é adapter de arquivo ou fonte real. Policy fixa e versionada,
uma instância de fonte permitida por snapshot; sem fusão entre fontes.
Kind usa vocabulário fechado, nunca descrição livre.

Identidade estável do evento: source type + instance + record, com SHA-256
integral. Replay exige bytes canônicos iguais; colisão de ID/dedup/source
version com conteúdo diferente falha. Correções encadeiam observações sem
reescrever o histórico. Somente a última versão fica na projeção atual.

Todas as dimensões de payload referenciam a observação no field_provenance.
Isso registra origem, não afirma prova de correção externa nem substitui o
futuro motor de provenance do NEXT-00. Integrity hash também não prova verdade.
Não aceitar origem financasbot_next, nem output de modelo.

Tipos/pessoas/instrumentos/categorias são resolvidos por catálogo fechado e
validados dentro da família. Cartão pode ser compartilhado entre membros;
contas têm titular único nesta policy inicial. Refund aponta para compra exata, conserva
pessoa/instrumento/moeda/categoria e não ultrapassa cumulativamente a compra.
Transferências requerem duas pontas distintas, mesma família/data/moeda e soma
zero. Pagamento aponta para cartão da família; é neutro para consumo, sem
alegar que quitou uma fatura específica.

## Critérios da fatia

Testes causais: replay/permutação; versões/gaps/forks; anti-realimentação;
igual valor não funde identidades; adulteração por campo; ownership; links;
refund acumulado; neutralidade; input/output imutáveis; tipos não suportados.

Gate total NEXT-02 continua pendente: parcelas/time-basis, Golden Set completo
e motor de provenance. N02-A inclui consumo transaction_date, coverage de
consulta e expenses.sum pelo gateway existente, sem alegar equivalência
ao motor de provenance proposto. Não converter N02-A em GO do vertical.
