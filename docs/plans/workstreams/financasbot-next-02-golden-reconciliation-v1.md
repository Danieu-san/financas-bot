# NEXT-02 — Reconciliação do Golden Set com o vertical

Data: 2026-09-07.
Estado: N02-E — CORPUS COMPLEMENTAR PREPARADO; VALIDAÇÃO LOCAL PASS;
AUDITORIA INDEPENDENTE PENDENTE; SEM ALTERAÇÃO DE RUNTIME.
Base: `c0c762786d81db71cf82681915750efb2f23f9e7`, N02-D aprovada focalmente.

## Autorização e escopo N02-E

Daniel autorizou em 2026-09-07 preparar o corpus complementar preservando o
v1 congelado. Isso autoriza a preparação, não ratifica os novos resultados
nem fecha o Golden Set integral. A nomenclatura abaixo de recomendação/decisão
registra o diagnóstico que motivou essa autorização.

Escopo: três fixtures complementares, testes de caracterização e integração
ao gate existente como N02-E. Nenhuma alteração em src/next, runtime v1,
dependências, runner amplo, bot ou artefatos v1 congelados. A allowlist de
delta N02-E é restrita a dez paths de fixtures/teste/gate/documentação.

Arquivos complementares em `tests/fixtures/financasbot-next/`:

- `next02-expense-observations-v1.json`: 17 registros explícitos, incluindo
  os 16 IDs legados e uma compra nova. Tabela com colunas fixas e null explícito;
  currency=BRL/status=active são constantes declaradas. O helper somente embala
  esses registros no schema de observação aprovado, adiciona identidade/hash e
  provenance por campo. Não calcula valor, data ou vínculo financeiro faltante.
- `next02-expense-expectations-v1.json`: 23 consultas com valores, zero/empty e
  conjuntos exatos de registros esperados; cinco recusas. Expectativas escritas
  separadamente do kernel e não produzidas por sua saída. Mesma autoria local
  não é independência epistemológica: revisão externa continua obrigatória.
- `next02-golden-traceability-v1.json`: todos os 56 turnos inventariados uma
  única vez, sem remover os 76 fatos antigos. Relação pode ser somente invariante,
  cenário alterado, seleção de eventos equivalente ou pendente. Nenhuma dessas
  categorias certifica uma conversa inteira ou gera percentual de GO global.

O teste `tests/next02GoldenExpenses.test.js` reutiliza kernel/read model
aprovados. Compara valor, unidade, entidade, período, lente, estado, filtros,
coverage e conjunto de evidências. IDs de eventos são resolvidos pelo snapshot
e observation_refs; o conjunto esperado contém IDs de registros explícitos,
nunca seleção derivada de valores. Isso testa evidências da implementação
atual; não substitui o motor independente de grafos/traces do NEXT-00.

Nas parcelas, três eventos e a compra aparecem como evidência da agenda,
mesmo quando só uma parcela entra no valor. A presença de eventos projetados
como prova não promove seu valor a confirmado. Hashes v1 são comparados com
CRLF normalizado para LF, sem outra transformação; os arquivos Git ficam intactos.

## Evidência local e próxima fronteira

Primeira execução: seis propriedades passaram e NEXT02E:GATE falhou com
unknown_next02_slice. Esse RED é da integração do gate; os cenários financeiros
já passaram com o runtime existente. Após integrar a fatia, gate 64/64,
57 regressões A/B/C/D + sete propriedades E, zero skip/todo. O novo teste
exercita 23 consultas e cinco recusas dentro dessas sete propriedades, não
28 testes top-level nem 28 conversas executadas.

Bateria afetada: 137/137 PASS, zero falhas/skips/todos. Validador v1:
48 casos/56 turnos/76 fatos/39 avaliadores, PASS. Isso prova preservação do
validador antigo, não execução de todas essas métricas pelo kernel novo.

Revisão adversarial: remoção individual de referência esperada, drift de
valor, refund retargetado, compra original ausente, cada parcela ausente,
competência nula, subcategoria divergente e null relevante. Trocar categoria
do combustível preserva total e IDs de evidência familiares, mas falha na
consulta de supermercado: valor agregado igual não basta. Gate rejeita skip,
todo, nesting/arquivo errado, ID ausente/duplicado, fail e stdout forjado.

Ampla única concluída após pausa: 1.993 testes, 1.983 PASS, zero falhas,
10 SKIP previstos, runner valid=true. Evidência detalhada em
`financasbot-next-02-validation-v1.md`. Próximo: commit com parent acima,
gate vinculado e auditoria independente por hash, sem repetir a ampla verde.
Não concluir N02-E antes do
parecer nem abrir NEXT-03. Não classificar métricas pendentes como dispensadas
do roadmap: sua aplicabilidade e a provenance integral ainda exigem resolução.

## Objetivo e evidência

O roadmap v2, seções 9.2 e 12/NEXT-02, exige kernel properties e Golden Set
cobrindo os invariantes críticos do vertical. As aprovações A/B/C/D não
demonstram essa integração nem a implementação do motor completo de provenance.

Leitura local dos artefatos congelados:

- `tests/fixtures/financasbot-next/golden-financial-fixture-v1.json`;
- `tests/fixtures/financasbot-next/golden-claim-oracles-v1.json`;
- `tests/fixtures/financasbot-next/golden-fact-contracts-v1.json`;
- `scripts/agent/validateFinancasBotNextFacts.mjs`;
- `docs/contracts/next/data-authority-contract-v0.md`, seção 7;
- planos de reutilização NEXT-02 e N02-C.

S-01#1 espera consumo familiar de 169400 centavos em junho/2042, com
time_basis=event_date. O derivador antigo soma despesas/compensações confirmadas
pela data de cada linha, incluindo evt-installment-1 (10000). Um cálculo
isolado sobre a fixture reproduziu 169400; excluindo apenas linhas com
installment_plan, obteve 159400. Esse segundo número NÃO é resultado esperado
proposto para o kernel: falta a observação da compra original.

As três linhas plan-01 têm data, índice, total, valor e estado, mas não têm
compra de origem/installment_of nem billing_period explícito. A data e o valor
da compra integral não são recuperáveis sem nova hipótese. Somar três parcelas
não comprova a identidade/data da compra. O nome installment_plan não fornece
a aresta exigida no Data Authority, seção 7.5.

N02-B/C preservam a seção 7.4: transaction_date seleciona compra integral;
billing_period seleciona parcelas explícitas sem somar a compra novamente.
N02-C proíbe inferir competência da data. Portanto event_date não pode ser
renomeado automaticamente para qualquer dessas lentes.

## Interpretação limitada

Isto demonstra incompatibilidade de representação para uma integração direta,
não um bug executado do kernel e não invalida todos os casos do corpus v1.
O cálculo acima caracteriza o derivador antigo; não executa o vertical sobre
essas entradas. Nenhum PASS integral do Golden Set foi alegado.

O corpus também possui métricas de saldo, orçamento, calendário e outras fora
do vertical. A aplicabilidade de cada fato/turno ainda precisa de inventário
explícito; não se autoriza excluir casos difíceis nem contar skips como prova.

## Recomendação para a decisão

Preservar integralmente os artefatos v1 e seus hashes. Preparar um corpus
complementar versionado e auditável para NEXT-02, com observações sintéticas
explícitas de compra, installment_of, competências, cobertura por lente/estado
e resultados revisados. Manter rastreabilidade para os casos/invariantes v1,
identificando equivalência demonstrada, alteração de cenário e fora de escopo.

Reutilizar kernel, agenda, read model e boundaries já aprovados. Não criar
uma lente legada apenas para obter o total antigo, não copiar o oracle como
resultado do kernel e não gerar campos faltantes a partir do resultado esperado.
Resultados numéricos e conjuntos causais novos precisam de revisão independente,
não somente de hash ou de cálculo pelo mesmo código sob teste.

## Critérios e parada

Direção para preparação recebida; integração de teste realizada conforme o
escopo N02-E acima. Campos novos continuam separados dos preservados. A
auditoria deve avaliar a semântica das expectativas e não apenas seus PASS.
Não prometer GO global enquanto provenance ou invariantes estiverem abertos.

O diagnóstico inicial alterou somente checkpoints. A preparação autorizada
adicionou fixtures/testes e gate, sem mudança de kernel, fixture/oracle
congelados, bot, produção ou dados reais. NEXT-03 continua fechado.
