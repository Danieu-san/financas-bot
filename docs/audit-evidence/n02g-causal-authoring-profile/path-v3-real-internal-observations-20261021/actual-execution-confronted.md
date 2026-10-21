# Confronto da execução INTERNAL normal — 21out2026

## Alcance e autoridade anterior

Objeto inteiro imutável e4af6912c83d04c1d827c03b24aa90ab80043f39,
pai737ed6c0a49b357097acc263938c239744bc6412, árvore
9d281942f6519269a3ef1fb5e51abb1b712ec683. Código/norma/corpus/deps/artefatos
herdados não foram alterados. O parecer independente e4 foi fornecido manualmente,
lido inteiro e confrontado antes de qualquer avaliação da TCB. Seu APTO é
ESTÁTICO NO ALCANCE DO PROVISIONAMENTO PROPOSTO, não uma declaração antecipada
de resultado ou crédito. Resumo anterior imutável:
`b4-02-e4-final-audit-receipt-confronted-20261021.md`, SHA256
a447095591b8abf4bd5d663fef413b19fe3fe2358dddf0f5c5eb47befe21a06f.
Nenhuma transcrição privada ou locator de navegador integra este recibo.

O operador adotou externamente os pins FIXOS revisados: freeze
sha256:5c6647ba3d13403790ff19aacf006549bf1dc742987bee87b2420d7710ccaec6,
ticket sha256:b538120d92a96fa21ada2bedd1d155f5a588dab3fef4a808e1ddec499bf18cdc.
Não foram inferidos como autoridade a partir dos valores apresentados durante
admissão. Os JSONs propostos anteriores e todos os seus flags permanecem intactos.

## Uma execução efetiva

Wrapper mecânico local `run-b4-02-internal-once-20261021.cjs`: syntax check0;
pré-medição externa do Node oficial22.17.0/x64 SHA256
39d45b5933f339d3ebdebd76474893dab5d7da1038920f65cf5bbcf0f20f3636;
medição do manifest e das QUATRO folhas TCB antes de avaliar a primeira folha;
launcher capturado original, initializer original e receiver `host.run()` original,
cada um uma vez. Nenhum require de produto substituiu o loader capturado;
nativos somente conforme receita já revisada. Limites/env/timeouts originais.
Não houve alternativa M, retry, injeção de callbacks ou alteração de flags.

Invocação já selada1c665af2-7982-4b14-b49f-1afeb85ac1f2; candidato
sha256:af435a0276d323543f62708e29d47bc923deaca8bdfb2b4f5912f55434b79f74.
Marcador local `b4-02-internal-once-20261021.started.json` preservado;
é prevenção de repetição DESTE wrapper local, não ledger global ou auth humana.

Execução normal iniciada17:48:02.171Z, encerrada17:48:05.520Z,3349ms;
comando nativo terminou0. Relatório integral:
`b4-02-internal-observations-20261021.json`,6024184bytes,
SHA256762d1859a4702a584ae068ca59a7cf07f8f9173dc80d830b04054b9d10b18119.
O host normal só resolve cada resultado após duas fases e child close0;
não há campo native_exit por mundo no resultado, portanto não foi inventado.
Confiança na plataforma nativa/OS e limites TOCTOU são premissas externas honestas,
não uma certificação derivada de hashes, vm ou da guarda JavaScript.

| Mundo | proof_satisfied REAL | Resultado funcional REAL |
| --- | --- | --- |
| C | true | money_minor / BRL_minor /169400 |
| M | false | money_minor / BRL_minor /169400 |
| S | true | money_minor / BRL_minor /169400 |

Roots reais conferem com freeze/payload ANTERIORES à execução: TCB34f059df...,
child68f0321c..., metricb4f2a9c3..., contrato4e07fd44...;
proofC/S861bf7fa... e proofM31c262dc.... A inicialização e o resultado mantêm
seus estados não financeiros; `execution_permitted:false` do recibo inicial
não foi reescrito nem interpretado como liberação financeira.

## Comparação normal dos rastros já gravados

`compare-b4-02-internal-observations-20261021.cjs` chama SOMENTE o comparador
existente `proofAcceptance.comparePhaseCoverage` e projeções normais de metadados
do pacote autoral anterior. Não chama run/launcher/openProof/inspectProofPredicates,
não gera novo transporte/candidato/referência nem modifica os rastros.
Autoridade do pacote compara exatamente ao freeze revisado; transportes D/P dos
três mundos são iguais às projeções originais e aos bytes selados publicados.
Expected vem do trace_contract autoral; roots vêm do freeze e artefatos propostos,
nunca são aprendidos do trace actual. Oráculo original S-01#1/fact0 vale169400.

Primeira leitura mecânica terminou `canonical_json_invalid` ANTES de comparar
qualquer fase: projeções normais contêm objetos de protótipo nulo. Foi corrigida
somente a serialização do leitor para o plain JSON já usado no transporte normal.
O relatório anterior `b4-02-internal-coverage-20261021.json` foi preservado.
Não é RED de produto, não relaxou canonicalValue e não repetiu BUILD ou D/P.

Comparação normal posterior terminou native0:
`b4-02-internal-coverage-normal-20261021.json`,2527322bytes,
SHA256cf592594bf3ae789f17ba8a3e6f330931490fa1975305191d2eb9db1ce508592.
As SEIS fases matchedtrue, eventos originais355D/3426P por mundo, todos com
um único proprietário, nenhum descartado/unsupported/invalid/projection overlap.
Não somar componentes como aprovações distintas. `read_edges.matched:false`
isolado é previsto pelo contrato de composição: mismatches0; os eventos fora de
sua projeção são cobertos explicitamente por selection/operand/access/measurement.
O resultado vinculante `comparePhaseCoverage.matched` é true nas seis fases.

Propriedade por mundo: D=measurements4/read_edges198/access_metadata94/
operand_sets25/selection34; P=measurements2/read_edges979/access_metadata2029/
operand_sets382/selection34. Civil_dates0 é aplicabilidade sem eventos nesse caso,
não dispensa de cobertura. Oráculo, booleano da referência pré-M e roots conferem.

## Confronto causal sem reexecutar o negativo

Comparação byte-a-byte dos arrays de eventos já gravados: C===S em D e P.
Entre C e M, D difere SOMENTE na medição do root proof, sequence3.
P difere SOMENTE nessa medição, sequence356, e no read sequence3564:
C lê `evt_refund_b.amount_minor`=4500; M lê
`evt_bill_projected.amount_minor`=-80000, ambos role `proof/snapshot`.
Todos os outros eventos e outcomes, inclusive o outro operando-4500, permanecem.

Isso coincide com a única substituição do fonte C→M previamente confrontada:
`operands.node("evt_refund_b").get("amount_minor")` por
`operands.node("evt_bill_projected").get("amount_minor")`.
C/S265402chars, M265408chars; nenhum outro delta de fonte, mesmas configurações.
A referência independente pré-M para `link_2_refund_sign`,opposite_sign,
espera C/Strue e Mfalse, expected_violations=[edge]. Os resultados reais concordam.

O runtime NORMAL não emite um array de false_predicates por site. A atribuição
da única rejeição a esse alvo é INFERÊNCIA CAUSAL composta do programa real
conforme, único delta, controles positivos, eventos diferenciais e referência;
não foi apresentada como telemetria direta de diagnóstico por predicado.
O julgamento independente deve confrontar sua suficiência segundo§4/v2;
não criar exceção, inventar false_predicates ou repetir em modo assertion-fault.

## Preservação e próxima fronteira

895fontes atuais antes/depois de execução E comparação iguais,
digest183ba87724616c2226e7b1893fb8c3b5fa978631b116d99d23307ec9e782a6d7,
mismatches[]. Snapshotada954eb... intacto. Ampla2788/2778PASS/10SKIP exatos,
report42e6126d... preservada, sem repetição por metadados/leitor.

qualified=false/semantic_mutation_credit0/finance=false/globalGO=false/NEXT03=false.
Nenhum novo qualificador implementado nem flag BUILD histórica promovida.
Há evidência fresh REAL, mas ainda não fechamento integral de todos os rows e do
N02-G. Próxima ação: publicar estes bytes e wrappers mecânicos como suplemento
MATERIAL do MESMO objeto inteiro e obter um julgamento integrado do alcance e
lacunas restantes, não auditoria isolada de helper/predicado nem novo9+1.
Os76graphs/39evaluators/parents/outras famílias e a migração total permanecem.
