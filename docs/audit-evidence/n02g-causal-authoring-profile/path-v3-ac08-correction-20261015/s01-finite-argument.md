# AC08 e argumento finito S01 — preparação do novo candidato, 15out2026

Estado: correção LOCAL validada, argumento do executor PENDENTE de revisão
independente; não certificado, norma nova, segundo compiler ou descarga de flags.
Nenhuma mudança nos schemas, guards normais, corpus, quotas ou dependências.
AC08 reusa o codegen genérico original de uniqueItems/Ajv8.17.1 para strings,
com contexto temporário restaurado em finally. Custo quadrático explícito, não
alegar prova universal de desempenho. BUILD RAW d01f9f3b7f00275dc61c41d48cd3d9f1ead7c472a7f8d04a7f0f4295f15ad16e;
pin correspondente atualizado somente na referência schema existente.
RED0051FAIL na causa __proto__ duplicado; focal005/0062PASS, SCHEMA001–0066PASS,
PATH0791PASS e integração AUTHORING001/003/004/005+TCB001/002+FINANCIALHOST001/002/003
9PASS. Integração164275ms, child0/zero demais/errors[],202fontes antes/depois/atuais
154371599ae24abff2d9776937ea4e89378c67559a3cf0ee5adc9efa6db1a7ff iguais;
report8ccef0f6a1551a6d9c0286211057e6c948cf38602f1e689c272a542dc508c88d.
Esses testes não executaram fresh PATHv3 nem concedem revisão operacional.

#### Objeto e hipótese explícita

Instância: S-01#1#1/link_2_refund_sign/same_type_wrong_path. Predicado authored:
economic_links/edge/opposite_sign, argumentos field(evt_refund_b,amount_minor)
e field(evt_restaurant_b,amount_minor). Sites0/1 alteram respectivamente SOMENTE
args[0].field ou args[1].field; não trocam operadores/IDs/outros argumentos.
Método72fc/blob82112 §3 exige MESMO ramo/kind/tipo nominal/unidade/forma; logo
não se exige importar campos money_minor de outro kind para este L de event.

Argumento a verificar: se o pacote baseline inteiro for admitido pelo pipeline
NORMAL, schemas/deps/checkers forem os bytes confrontados e o frame de troca
única for genuíno, cada um dos30locators abaixo preserva os12passes de admissão.
Isso é uma implicação estática condicionada: NÃO afirma baseline executado,
revisão independente concluída, A/W efetivos, primeiroW ou autoridade de execução.
Não usar resultados de compilar M como fundamento para escolher/classificar L.

#### L integral e valores autorais — não deduplicar por valor

pathLocatorDomainV3.domain(fieldPath) enumera todos anchors do kind original,
todos campos declarados e retém o nominal exato. O registry event tem somente
amount_minor de money_minor; seus outros campos são id/date/ref/enum/integer
refinado, nenhum segundo money_minor. Os16anchors event abaixo são snapshot,
não validated_parent; todos presentes no grafo. Unidade BRL_minor e forma
scalar money_minor são preservadas. Cada site remove somente seu locator original:
15+15, inclusive anchors com o mesmo valor. Ordem lexicográfica da autoria.

| Anchor event | amount_minor autoral | Em L0 | Em L1 |
| --- | ---: | --- | --- |
| evt_bill_projected | -80000 | sim | sim |
| evt_cinema_b | -3200 | sim | sim |
| evt_fuel_a | -20000 | sim | sim |
| evt_gift_b | -5000 | sim | sim |
| evt_installment_1 | -10000 | sim | sim |
| evt_installment_2 | -10000 | sim | sim |
| evt_installment_3 | -10000 | sim | sim |
| evt_invoice_payment | -60000 | sim | sim |
| evt_market_a | -30000 | sim | sim |
| evt_refund_b | 4500 | original | sim |
| evt_rent_a | -100000 | sim | sim |
| evt_restaurant_b | -4500 | sim | original |
| evt_salary_a | 500000 | sim | sim |
| evt_snack_a | -1200 | sim | sim |
| evt_transfer_in | 15000 | sim | sim |
| evt_transfer_out | -15000 | sim | sim |

Dados públicos sintéticos, não financeiros reais. Resolver snapshot por
(kind,ref_id,version), não pelo valor ou pelo nome do alias. Os16 têm version
sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b.
Fontes RAW: graphs-v2.json e9c852034d8cc887e1d8645a61d9597176409f72a28eaf0de4c95f17c0c8358d;
material-field-registry-v1.json ee7ef3eff146bc2e9cea2cc986c398371acbff3cf35d858ced8386a9758a4d62;
snapshot-manifest-v1.json 2547229db3c07f2dd0941601ab5164bf89981ce966e4e23a2e3058124edba8c4.
Esses hashes identificam os dados; a derivação acima não é provada pelo hash.

#### Três lemas específicos — corpos normais, não um solver

1. package_schemas: provenance-graph.schema definitions.fieldPath exige
   exatamente node+segments, ambos os originais/30alternativas satisfazem a
   mesma definição. A branch args.field não muda; IDs obedecem ao mesmo pattern,
   segments=[amount_minor] preserva tipo/pattern/minItems. Comprimentos, demais
   chaves, const/enum, required e documents externos não mudam. uniqueItems de
   predicates não pode criar igualdade integral entre IDs distintos: id fica
   intacto e único. Igualmente graphs não colidem por fact_key distinto intacto.
   As demais arrays com uniqueItems permanecem byte-equivalentes. A correção
   AC08 conserva a semântica normativa de unicidade; não dispensa baseline com
   os NOVOS validators compilados e standalone/deps. Corpo real da chamada:
   graphCompiler.compileAuthoring validate(graphs/claims/registry/evaluator/
   snapshot); BUILD compileSchemaDocuments partilhado pelos dois builders.
2. graph_structure: argument reconhece a mesma branch field e chama nodeField;
   node(alias) exige own(graph.nodes,alias), field(event,[amount_minor]) exige
   kind declarado/campo material/um segmento. Cada alternativa satisfaz essas
   verificações sem travessia/ref/parent. Aridade, metadata/obrigações, sets,
   windows, edges, seleção e trace declarations são iguais. Ler o corpo inteiro
   de validateGraphStructureInternal: suas verificações posteriores usam essas
   declarações intactas, não vinculam o valor do field ao resultado do predicado.
   A troca não cria nova branch nem altera required_reads para fabricar aceitação.
3. predicate_types: fieldDescriptor retorna o mesmo descriptor money_minor;
   fieldValue constrói scalar money_minor/unit BRL_minor nos dois casos, apenas
   known pode mudar. opposite_sign.args é [number:U,number:U]. Nenhum argumento
   é literal; as refinements por known de literais/calendário/janela/enum não
   se aplicam. unifyOperatorTypes consome scalar/NUMBERS/unit e liga U=BRL_minor
   para os dois operands, sem ler known. O loop de inferência de sets não usa
   opposite_sign e a troca não cria set/template. Outros predicados/windows
   permanecem intactos. O IR de tipos mantém os descritores, MAS source deve
   refletir o novo locator; não exigir/alegar IR inteiro inalterado.

Corpos RAW a confrontar: graphCompiler.js fe938a128cfd4dccda0d8ddc1f2e6965b623feecc6d1854ef0306700efda1016;
graphStructure.js 927a4e76b6a7c9f8ad8656e21a44766a745c2edd3113b82ff7231a1c2bc79e50;
predicateTypes.js 7ec5e1dc0348599bf42aa642a575233bb3642371fb2a48bea77b2558de6a25b8;
operatorTypes.js 573db750922769a1626fe11c938458271b7cd09fdc5571df5c7b6786fa8d493c.
Não trocar a branch ordinary por qualification/M mensal, nem importar autoridade
de selected-day. Os testes de preservação são controles, não premissa autoral.

#### Composição com os outros nove passes existentes

Cada linha é obrigação de revisão sobre o corpo/checker normal e TODOS os seus
participantes, não prova por ausência de um nome no target. As projeções fechadas
existentes retêm raízes integrais e metadata antes de qualquer matching de args.

| Pass normal | Dependência que permanece íntegra nesta troca |
| --- | --- |
| schema_registry_projection | registry+schemas externos inteiros; não recebe grapharg |
| static_evidence | nodes/edges/snapshots/material registry; não lê predicate.args |
| graph_dependencies | claim/evaluator/roles/parents/graph roots; não lê predicate.args |
| operand_bindings | claim operand bindings e nodes/sets/registry/contracts intactos |
| template_references | todos templates/bindings e set peers retidos; field direto não cria template/set |
| obligation_bindings | IDs/atoms/obrigações e todos argumentos sensíveis identity/fingerprint/ref_targets_node intactos; alvo economic_links/opposite_sign não muda esses argumentos |
| claim_requirements | direct claim roots e todos anchors subject/period/time/coverage/state retidos; dois field não criam claim/root |
| collection_requirements | todos anchors coverage/evidence_set, snapshots/fixture membership e roots intactos |
| selection_bindings | metadata e argumentos de TODOS IDs referenciados por selected/excluded preservados; o alvo não é um desses IDs em S01 |

Exigir vínculo da projeção aos corpos reais/bytes, não apenas igualdade de hashes
das projeções. Compilar apenas o alvo ou omitir referências de outro predicado
não serve. O resultado condicionado é preservação dos12passes para cada locator;
as seis premissas reais seguem false no snapshot de preparação até sua evidência.

#### Discriminação e fronteiras ainda abertas

A referência independente existente define opposite_sign por inteiros não zero
com sinais distintos; scalarProofCore normal tem a mesma condição de sinais.
Baseline autoral4500/-4500 satisfaz. Em site0, negativos contra -4500 discriminam
(13); salário/transfer_in positivos não (2). Em site1, positivos contra4500
discriminam (refund/salário/transfer_in:3); os12negativos não. Valores iguais não
fundam equivalência necessária; os14não discriminantes só o são neste snapshot.
Primeiro candidato CONDICIONAL é site0/locator0 evt_bill_projected.amount_minor,
expected_violations=[edge] do fundamento existente. A atribuição completa de
violações/observações/resultado e o primeiroW efetivo continuam dependentes da
composição revisada e da invocação fresh normal, não desta conta de sinais.

Não executar as30alternativas para escolher o negativo. Contradição dos C/M/S
posteriores invalida o selo, não ajusta o expected. Dois controles unknown_path,
um por site, precisam C/S positivos normais/M negativo autêntico/handle_attempts0
e vínculo exato dos sites; não crédito por recusa M. TCB externa/runtime medido/
pin revisado/ticket antes de handles ainda são pré-requisitos distintos.

Próxima evidência: recaptura RAW do NOVO BUILD/TCB/snapshot e seus deps, sem
guest/qualificação; uma ampla hermética final quando estável; commit sanitizado
novo com este argumento e fonte inteira; UMA auditoria independente do candidato
inteiro. O velho247e948f/cf6/C9 e parecer INCOMPLETA ficam históricos, não atuais.
Nenhuma conclusão autônoma de APTO/discharged/A/W/exec/qualified/credit/GO aqui.
