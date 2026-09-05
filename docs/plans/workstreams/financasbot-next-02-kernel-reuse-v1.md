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
alegar que quitou uma fatura específica. O `settles_card_id` observado é
preservado como `card_id` canônico do pagamento e mantém proveniência explícita;
não vira link evento→evento enquanto N02-A não possui evento de fatura.

A porta pública `expenses.sum` nunca expõe os IDs internos usados pelo kernel.
Labels server-side completas traduzem filtros públicos na entrada e voltam no
claim; entidade usa label pública e evidências usam handles locais à resposta.
Essa tradução é boundary do adapter, não nova autoridade financeira.

## Critérios da fatia

Testes causais: replay/permutação; versões/gaps/forks; anti-realimentação;
igual valor não funde identidades; adulteração por campo; ownership; links;
refund acumulado; neutralidade; input/output imutáveis; tipos não suportados.

Gate total NEXT-02 continua pendente: parcelas/time-basis, Golden Set completo
e motor de provenance. N02-A inclui consumo transaction_date, coverage de
consulta e expenses.sum pelo gateway existente, sem alegar equivalência
ao motor de provenance proposto. Não converter N02-A em GO do vertical.

## N02-B — agenda observada interna (candidato local)

Escopo implementado: projetor interno e integração por policy explícita
next02-import-v2. Default v1 preservado; campos de parcelas constam do payload
e field_provenance. Relações e agendas são calculadas do snapshot corrente;
history não afirma reconstrução histórica completa das relações.
Seleção temporal pública, coverage por lente e estornos por competência abaixo
continuam planejamento posterior, não alegações implementadas nesta unidade.

### Planejamento temporal posterior

Base de comportamento já inspecionada: `canonicalLedgerProjector.js`, função
de projeção de compras de cartão, e os testes que distinguem compra em maio,
competência em junho e agenda de duas parcelas em junho/julho. Preservar uma
compra econômica e parcelas vinculadas; não importar o módulo legado, matching
por descrição nem inferência do total a partir de agenda incompleta.

Autoridade: Data Authority Contract, seção 7, itens 4 e 5. `transaction_date`
seleciona a compra total; `billing_period` seleciona parcelas por competência.
Nunca somar as duas representações na mesma métrica. Cada parcela deve possuir
vínculo explícito `installment_of`, identidade e origem próprias.

Antes do patch funcional, fechar o schema de entrada sintética e o contrato de
coverage por lente. O intervalo de transação de N02-A não pode ser reutilizado
implicitamente como prova de cobertura por competência. Agenda incompleta não
autoriza inventar parcelas, ratear valores nem inferir ausência.

REDs previstos, ainda não implementados:

- compra de 100000 centavos em maio e parcelas de 50000 em junho/julho:
  transaction_date retorna 100000 em maio; billing_period retorna 50000 em
  cada competência; nenhuma consulta retorna compra mais parcelas;
- duas compras com mesmo valor/descrição permanecem distintas por vínculo;
- parcela órfã, duplicada, de outra família/instrumento ou soma incompatível
  falha; correção/replay mantém histórico e identidade;
- ausência de competência ou cobertura específica produz incomplete, não zero;
- confirmado/projetado não se confundem: Golden Set possui parcela confirmada
  e duas projetadas; não promover projeção a consumo confirmado;
- pagamento de fatura permanece neutro em ambas as lentes;
- estorno exige política temporal explícita antes de ser habilitado nesta lente;
  não atribuir competência por heurística ou copiar a data da compra.

Próxima leitura dirigida: módulo `buildCanonicalInstallmentSchedules` usado
pelo projector v1 e seus testes; contratos/claims do Golden Set relativos a
parcelas, projeção e bases temporais. Só depois fixar o escopo implementável
de N02-B e seus IDs executáveis. Não alterar fixtures/contratos congelados para
acomodar a implementação. Due date, settlement date e motor de provenance
continuam pendentes; esta seção não declara essas propriedades implementadas.

### Resultado da leitura dirigida do módulo v1

`src/ledger/canonicalInstallmentSchedule.js` e
`tests/canonicalInstallmentSchedule.test.js` foram lidos integralmente.
Reutilizar por comportamento: índice/total válidos, ordenação por índice,
competência atravessando ano, vínculo de cada parcela, identificação explícita
de lacunas e separação compra/agenda. Não portar `purchaseGroupingKey` baseado
em descrição/valor nem `appendToBestGroup` dependente de ordinal: N02-B exige
referência explícita à compra. Não portar `totalPurchaseCents = first.amount *
count` quando faltam parcelas, normalização permissiva de datas/status ou
descarte silencioso de linhas inválidas.

Menor unidade implementável a seguir: projetor puro de agenda sintética
explicitamente vinculada, antes de habilitar billing_period em expenses.sum.
Entrada proposta: compra com ID e valor inteiro explícitos; parcelas com IDs,
purchase_ref, index, total, billing_period, amount_minor e evidence_state.
Usar JSON estrito/clonagem e freezeDeep já presentes no kernel; comparar soma
com BigInt e não estimar total. Agenda completa exige índices únicos 1..N e
soma exata; agenda parcial conserva missing_indexes e não declara completude.
Valores projetados permanecem projetados. Sem geração automática de parcelas,
sem arredondamento implícito e sem chamada pública nesta primeira unidade.

Essa unidade não resolve coverage de consultas nem política temporal de
estornos. Esses pontos permanecem pré-requisitos explícitos para integrar a
lente billing_period, não motivo para alterar silenciosamente N02-A.
