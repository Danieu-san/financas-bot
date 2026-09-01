# NEXT-00 — Desenho do contrato declarativo de provenance

Atualizado em: 2026-09-01
Estado: `CANDIDATO DE ARQUITETURA — NÃO NORMATIVO; IMPLEMENTAÇÃO BLOQUEADA`
Revisão arquitetural: `3`
Origem do finding: reauditoria do commit
`bd53f70716f5028f2421b8e27c588b3bb3b904fe`

## 1. Decisão

O contrato atual de fatos congela as oito dimensões e os IDs de evidência, mas
não congela de forma geral a relação semântica entre cada fato e o conteúdo
dos objetos referenciados. Um ID pode continuar igual enquanto período,
categoria, entidade ou aresta econômica muda atrás dele.

Não serão acrescentados novos `if`, `switch`, casos por métrica ou mutações
isoladas. A abstração proposta é um **grafo declarativo de prova de
provenance**, compilado e avaliado por operadores genéricos tipados.

Este documento desenha a abstração inteira. Ele não altera ainda o contrato
normativo de autoridade, o corpus, o oracle ou qualquer validador.

## 2. Resultado que o desenho precisa garantir

Um fato materializado só é válido quando quatro provas independentes
coincidem:

1. **claim revisado:** dimensões, unidade e estado esperados;
2. **snapshot de evidência:** nós tipados, versionados e com fingerprint dos
   campos materialmente relevantes;
3. **relações semânticas:** predicados que ligam os nós ao claim e entre si;
4. **trace de derivação:** observação externa, produzida exclusivamente pelo
   recorder, dos acessos causalmente realizados durante a execução determinística
   do metric evaluator para produzir o valor.

O verde exige igualdade entre essas quatro visões. Valor correto com vínculo
errado, ID correto com conteúdo alterado ou contrato correto sem leitura real
devem falhar fechado.

## 3. Separação de autoridades

O desenho separa responsabilidades que não podem ser fundidas:

| Artefato | Autoridade | Não pode fazer |
|---|---|---|
| claim contract | semântica revisada da pergunta | calcular o valor |
| fixture/snapshot | mundo sintético observado | declarar sozinho que a relação é correta |
| metric evaluator | cálculo determinístico content-addressed e resultado funcional tipado | escolher o claim esperado, produzir trace ou declarar metadado causal |
| evaluator contract | assinatura funcional, unidade e propriedades algébricas da fórmula | fornecer evidência, resultado, artifact root ou roles normativos |
| metric evaluator registry | única autoridade para contrato, closure, hashes e roles por evaluator | calcular valor ou repetir metadados em claims |
| provenance graph | prova revisada das relações | produzir o resultado numérico |
| value oracle | valor esperado apresentado | criar dimensões ou provenance |
| graph evaluator | verificar operadores e completude | ramificar por métrica ou fato |

O contrato de grafo não pode ser gerado do oracle durante a validação. Um
scaffolder pode sugerir nós e predicados, mas o artefato revisado é congelado
separadamente e qualquer mudança exige novo hash imutável e nova auditoria.

Separação de arquivo não equivale, sozinha, a independência epistemológica. A
independência final vem de revisão causal do commit imutável por auditor que
não produziu o candidato.

## 4. Modelo formal

Para cada fato `F`, existe um grafo dirigido e tipado `G(F) = (N, E, P, T)`:

- `N`: nós de evidência resolvidos por identidade imutável;
- `E`: arestas econômicas, temporais, de escopo ou ownership;
- `P`: predicados declarativos sobre claim, nós, arestas e conjuntos;
- `T`: trace de observação produzido exclusivamente pelo recorder externo a
  partir da execução determinística instrumentada. Nenhum metric evaluator,
  graph evaluator ou operator implementation emite, fornece, completa ou
  autodeclara metadados de trace.
- `R`: resultado funcional tipado produzido exclusivamente pelo metric evaluator
  conforme sua assinatura registrada. `R` não pertence ao log interno do
  recorder, a `derivation_trace`, a `proof_trace` nem a qualquer estrutura de
  metadado causal.

O resultado numérico pode ser produzido pelo metric evaluator, mas toda
evidência causal sobre leituras, seleção, iteração, estrutura, traversal e uso
de operandos pertence exclusivamente ao recorder externo. `derivation_trace` e
`proof_trace` são projeções do mesmo log de observação, separadas apenas pelo
campo `phase`.

A validação recebe `R` e `T` como objetos independentes. Nenhuma etapa pode
inserir `R`, seus campos ou seus outputs intermediários em `T`, no log interno do
recorder ou em qualquer projeção de trace.

Um fato recebe verde somente se:

```text
schema_valid(F, G)
AND nodes_resolve_exactly(N)
AND semantic_fingerprints_match(N)
AND all_required_obligations_are_proved(P)
AND every_predicate_is_true(P)
AND material_edges_are_consumed(E)
AND derivation_trace_matches_contract(T, G)
AND evidence_set_is_exact(T, N)
AND value_matches_oracle(R)
```

Qualquer operador, path, tipo, nó, versão ou aresta desconhecido resulta em
falha. Não há coerção permissiva nem fallback silencioso.

## 5. Schema lógico proposto

O desenho substitui o contrato de fatos v1 por um schema v2 tipado. Durante a
migração, o v1 continua congelado e não é estendido com exceções.

```yaml
schema_version: 2
operator_registry_version: 1
material_field_registry_version: 1
metric_evaluator_registry_version: 1
authority: reviewed_provenance_semantics

facts:
  S-16#1#1:
    fact_key: S-16#1#1
    claim:
      metric: source_coverage
      unit: state
      subject:
        kind: source
        source_state_id: source-complete-june
      period:
        kind: month
        value: 2042-06
      time_basis: source_period
      coverage: complete
      evidence_state: confirmed
      evaluator_ref:
        evaluator_id: source_coverage
        evaluator_version: 1
      operand_bindings:
        source: source

    evidence:
      nodes:
        source:
          ref_id: source-complete-june
          kind: source_state
          version: fixture-v1
          semantic_fingerprint: sha256:<material-fields-only>

      predicates:
        - id: source-period-binds-claim
          obligation: period
          op: eq
          args:
            - path: $node.source.period
            - path: $fact.claim.period.value
        - id: source-coverage-binds-claim
          obligation: coverage
          op: eq
          args:
            - path: $node.source.coverage
            - path: $fact.claim.coverage

      trace_contract:
        required_nodes: [source]
        required_reads:
          - $node.source.period
          - $node.source.coverage
        required_edges: []
        evidence_set_mode: exact
```

### 5.1 Claim tipado

`entity` e `period` deixam de depender de strings sobrecarregadas para a prova
de provenance. O schema v2 usa objetos tipados para sujeito e período. A
representação textual pode continuar existindo na conversa, mas não é a
autoridade do validador.

Tipos iniciais de sujeito:

- `family`, `person`, `account`, `card`, `category`;
- combinações estruturadas como `family_category` e `person_category`;
- `event`, `transfer_pair`, `installment_plan`, `budget`, `bill`;
- `source`, `merchant`, `turn`.

Tipos iniciais de período:

- `date`, `month`, `range`, `as_of`, `through`;
- `statement_due`, `statement_competence`, `budget_cycle`;
- `registry_snapshot`, `request_execution`.

O compilador rejeita sujeito ou período que não satisfaça o schema do próprio
tipo. Ele não interpreta delimitadores de texto em runtime.

### 5.2 Nós de evidência

Cada nó declara:

- alias local único;
- `ref_id` imutável;
- kind exato;
- versão/fingerprint de identidade;
- `semantic_fingerprint` dos campos materiais do kind;
- papel: `value_input`, `scope_proof`, `coverage_proof`, `state_proof` ou
  `link_proof`.

O mesmo nó pode cumprir mais de um papel. Todo nó precisa participar do trace
de valor ou de ao menos um predicado obrigatório. Nó não consumido é erro.

O fingerprint semântico não substitui predicados. Ele detecta drift de
conteúdo; os predicados provam que o conteúdo congelado sustenta o claim.

### 5.3 Registry de campos materiais

Um registry declarativo por kind define os campos que compõem identidade,
dimensão e aresta. Exemplo conceitual:

```yaml
event:
  identity: [id, version, state]
  dimensions:
    [date, person_id, account_id, card_id, category_id, amount_minor]
  edge_fields:
    compensates: {target_kind: event}
    transfer_pair: {target_kind: transfer_identity}
    settles_card_id: {target_kind: card}
    statement_id: {target_kind: statement}
    installment_plan: {target_kind: installment_plan}

source_state:
  identity: [id, version]
  dimensions: [period, entity_id, category_id, coverage, event_count]
  edge_fields: {}
```

O fingerprint usa canonical JSON dos campos materiais presentes. Campos
cosméticos não quebram a prova; qualquer mudança material quebra.

Um campo de aresta presente no nó gera automaticamente uma obrigação de
aresta. Ele não pode permanecer congelado no fingerprint sem também ser
consumido por relação declarativa ou trace.

O schema de cada kind é **closed-world**. Todo campo permitido precisa estar
classificado como `identity`, `dimension`, `edge` ou `non_material`. Campo não
classificado falha o compile. `non_material` exige justificativa padronizada e
não pode conter ID, data financeira, valor, moeda, estado, coverage, ownership
ou vínculo. Assim, adicionar um novo campo como `statement_id` não passa
silenciosamente fora do fingerprint e das obrigações.

`non_material` fica fora do namespace acessível aos evaluators. Todo path
presente em `derivation_trace.reads` ou `proof_trace.reads` precisa resolver
para `identity`, `dimension` ou `edge`. Se um evaluator tentar ler campo
`non_material`, o compile falha; não existe exceção local. Campo lido para
seleção, branch, ordenação, cálculo ou prova é material por definição.

### 5.4 Claims derivados

Ranking, diferença, razão e comparação podem depender de fatos já calculados,
em vez de ler novamente todos os eventos. Nesses casos, o grafo admite nó
`derived_claim` com identidade `(fact_key, evaluator_version, result_hash)` e
aresta `derived_from`.

O conjunto de claims precisa formar DAG: ciclos são proibidos. A prova é
transitiva até nós de evidência primários, e o hash do claim derivado inclui os
hashes dos pais. Alterar um operando, membro ou período invalida ranking e
diferença mesmo quando o vencedor ou resultado final coincidentemente não muda.

## 6. Operadores genéricos

O graph evaluator possui um registry finito de operadores por tipo. Nenhum
operador recebe nome de métrica, caso ou fixture.

### 6.1 Escalares e identidade

- `eq`, `not_eq`;
- `same_identity`;
- `kind_is`;
- `state_is`;
- `fingerprint_is`.

### 6.2 Tempo

- `date_in_period`;
- `period_eq`;
- `same_month`;
- `range_contains`;
- `all_dates_in_period`.

### 6.3 Conjuntos

- `set_eq`;
- `set_subset` apenas quando o contrato declarar por que cobertura parcial é
  admissível;
- `cardinality_eq`;
- `all_match`;
- `none_match`.

Para fatos com cobertura completa, evidência material usa `set_eq`. `subset`
não pode provar completude.

### 6.4 Junções e arestas

- `field_eq` entre paths tipados;
- `join_eq` entre conjuntos por campos tipados;
- `ref_targets_node`;
- `same_field`;
- `edge_pair_complete`;
- `edge_target_in_set`.

Esses operadores expressam, sem código de domínio no evaluator:

- `refund.compensates == purchase.id`;
- as duas pontas compartilham `transfer_pair`;
- `invoice_payment.settles_card_id == card.id`;
- `installment.installment_plan == plan.id`;
- `person.family_id == budget.family_id`.

### 6.5 Quantidades auxiliares

- `sum_eq`, `count_eq`;
- `opposite_sign`;
- `abs_eq`;
- `ordered_by`.

Esses operadores provam relações entre campos. O cálculo final da métrica
continua pertencendo ao metric evaluator determinístico.

### 6.6 Restrições da linguagem

São proibidos:

- `eval`, JavaScript, SQL ou expressão arbitrária no contrato;
- regex como substituto de identidade estruturada;
- operador com nome de métrica, `fact_key` ou fixture;
- `OR` implícito;
- coerção automática entre string, data, dinheiro e ID;
- fallback quando path ou operador não existe.

Disjunção só pode existir em policy versionada fora do fato e precisa preservar
as mesmas obrigações em todos os ramos. Não existe `OR` local para tornar uma
prova verde.

### 6.7 Composição sem duplicação

Predicados repetidos podem ser agrupados em templates declarativos,
parametrizados por aliases e paths, como `complete_source_scope`,
`scoped_event_set` e `linked_event_pair`. Templates:

- não contêm condição, loop, código ou nome de métrica;
- expandem para operadores do registry antes da avaliação;
- têm versão e hash próprios;
- recebem todos os parâmetros explicitamente;
- produzem IR expandida visível à auditoria.

Template não cria operador novo nem reduz obrigações. Ele apenas compõe provas
genéricas já existentes.

## 7. Obrigações de prova

Todo fato materializado precisa satisfazer estas obrigações, com IDs estáveis:

1. `claim_semantics`: metric e unit coincidem; evaluator id/versão resolvem no
   registry canônico; hashes e roles observados coincidem com essa resolução;
2. `node_identity`: kind, ID e versão de todos os nós;
3. `semantic_integrity`: fingerprint dos campos materiais;
4. `subject_scope`: sujeito do claim ligado aos nós usados;
5. `period`: período do claim ligado às datas/períodos das evidências;
6. `time_basis`: campo temporal efetivamente usado no trace;
7. `coverage`: completude ligada à fonte e ao conjunto selecionado;
8. `evidence_state`: estado compatível em todas as evidências materiais;
9. `evidence_set`: conjunto exato dos inputs materiais;
10. `economic_links`: toda aresta material presente é provada;
11. `derivation_trace`: leituras e arestas efetivamente usadas coincidem com o
    contrato.

Não existe `not_applicable` escrito livremente. O compilador determina ausência
de obrigação somente quando o schema prova que não há campo, aresta ou fonte
correspondente. Se houver campo material, ele precisa ser consumido.

## 8. Trace determinístico de derivação

Cada metric evaluator continua responsável pelo valor financeiro e possui
exatamente uma autoridade de saída: retornar o resultado funcional tipado e,
quando previstos pela assinatura revisada, outputs funcionais intermediários
explicitamente tipados. Nenhum outro output é autorizado. Durante a execução, o
proxy apenas instrumenta acessos e o recorder produz as observações externas
estruturadas.

O exemplo abaixo representa saída produzida exclusivamente pelo recorder após
a execução, a partir dos acessos instrumentados pelo proxy e das medições
fornecidas internamente pelo loader. Ele não é um objeto retornado pelo metric
evaluator. O campo
`evaluator_id` também é associado externamente à execução resolvida pelo
registry; não é aceito como declaração de identidade proveniente do código
evaluator.

```yaml
evaluator_id: category_consumption@1
observed_evaluator_contract_hash: sha256:<reviewed-contract>
observed_evaluator_artifact_root: sha256:<executed-closure>
selected_nodes: [evt-snack-a]
reads:
  - {node: evt-snack-a, path: amount_minor}
  - {node: evt-snack-a, path: date}
  - {node: evt-snack-a, path: person_id}
  - {node: evt-snack-a, path: category_id}
traversed_edges: []
operations:
  - {op: sum, inputs: [evt-snack-a.amount_minor], output: -1200}
```

Separadamente do objeto de trace, a interface funcional retorna:

```yaml
functional_result: 1200
```

Esse objeto é `R`, retornado pelo metric evaluator. Ele não pertence ao recorder,
ao log interno ou a qualquer trace. O `output` de operação mostrado no trace é
uma observação causal recebida pelo canal instrumentado, não uma cópia de `R` ou
de seus intermediários funcionais.

O trace decorre causalmente da execução instrumentada, mas é produzido
exclusivamente pelo recorder externo, nunca pelo código executado. O proxy expõe
somente handles instrumentados e o recorder registra as observações
correspondentes.
O graph evaluator confronta o trace com `trace_contract`:

- leitura usada e não declarada: erro;
- leitura declarada e nunca usada: erro;
- nó extra ou ausente: erro;
- aresta material ignorada: erro;
- evaluator id/versão divergente: erro.

O trace validator confronta `T` com o contrato de provenance. Um result validator
separado confronta `R` com o value oracle. A aceitação do fato exige ambos, sem
fundir `R` e `T` ou construir envelope comum denominado trace.

O sistema conserva duas views do mesmo log externo de observação:

- `derivation_trace`, produzido pelo recorder a partir dos acessos instrumentados
  pelo proxy durante o cálculo;
- `proof_trace`, produzido pelo mesmo recorder a partir dos acessos
  instrumentados pelo proxy durante predicados, fingerprints e obrigações.

A fronteira de autoridade é absoluta: evaluators e operators não possuem API
para escrever em `reads`, `selected_nodes`, `traversed_edges`, operações
estruturais, roles observados ou qualquer outro metadado causal. Esses campos
existem somente como saída do recorder externo.

O metric evaluator pode retornar apenas seu resultado funcional tipado e,
quando necessário pela assinatura revisada, valores intermediários
explicitamente definidos como outputs funcionais. Esses outputs não constituem
trace e não podem substituir observações do recorder.

O graph evaluator e os operators também não fornecem `proof_trace`; eles
executam contra handles instrumentados, e o recorder observa externamente os
acessos realizados durante `phase: proof`.

Qualquer estrutura de trace recebida de código evaluator/operator é entrada
inválida e causa falha fechada.

Qualquer `read`, `selected_node`, `traversed_edge`, operação observada, role
observado, evaluator identity observada, hash/root observado ou outro metadado
que descreva como a execução chegou ao resultado é metadado causal. Metric
evaluator, graph evaluator e operator implementation não podem criar, retornar,
fornecer, completar, sugerir ou influenciar diretamente esses campos. Se código
executado retornar estrutura desse tipo, a execução falha fechada.

Outputs funcionais autorizados pertencem exclusivamente à assinatura funcional
registrada. Nenhum output funcional pode possuir tipo, campo ou estrutura cuja
finalidade seja comunicar `read`, `selected_node`, `traversed_edge`, observação
estrutural, `phase`, role observado, evaluator identity observada, hash/root
observado ou outro fato sobre como a execução chegou ao resultado. Intermediários
funcionais não são canal de evidência e não podem substituir observação
instrumentada.

### Invariante de autoria causal

O recorder é o único proprietário e writer do estado de trace. Materializar ou
escrever trace significa transformar observação ou medição externa em estado do
namespace de trace, inclusive determinar existência, ausência, nome, tipo,
valor, ordem, associação, agregação, canonicalização, serialização ou inclusão
em `L`, `derivation_trace` ou `proof_trace`. A definição independe do verbo usado:
criar, montar, capturar, registrar, preencher, anexar, emitir, produzir,
completar ou serializar conteúdo do namespace de trace são atos de
materialização. Somente o recorder pode realizá-los.

A fronteira de execução possui quatro domínios tipados e disjuntos. O símbolo `I`
é usado para instrumentação porque `E` permanece reservado às arestas do grafo:

1. `R` — functional output channel, produzido pelo metric evaluator, contendo
   somente resultado funcional tipado e intermediários expressamente autorizados;
2. `I` — instrumentation event channel, emitido transitoriamente pelo proxy e
   consumido somente pelo recorder, com observações em tipos próprios que não são
   estruturalmente compatíveis com trace;
3. `M` — measurement channel, produzido transitoriamente pelo loader e consumido
   somente pelo recorder, contendo apenas hashes/roots medidos, nunca valores
   esperados ou autoridade normativa;
4. `L` — recorder trace state, propriedade exclusiva do recorder e único
   namespace do qual traces podem ser projetados.

Formalmente:

```text
derivation_trace = project(L, phase=derivation)
proof_trace = project(L, phase=proof)
```

Não existe fluxo autorizado de `R` para `L`, `derivation_trace` ou `proof_trace`.
Fornecer evento bruto por `I`, medição bruta por `M` ou resultado funcional por
`R` não constitui materialização porque esses objetos pertencem a namespaces e
tipos distintos do trace.

A divisão operacional é fechada:

- proxy apenas instrumenta acessos, intercepta operações e emite eventos `I` à
  interface interna do recorder; não recebe nem retorna tipos de trace, não
  persiste, agrega, estrutura, nomeia, serializa nem produz trace ou view;
- loader apenas mede hashes/roots dos bytes efetivamente carregados e fornece
  medições `M` à interface do recorder; não recebe nem retorna tipos de trace,
  referência, builder ou callback de mutação e não determina representação;
- recorder recebe eventos instrumentados e medições e é o único componente que
  os transforma em estado de trace, incluindo `reads`, `selected_nodes`,
  `traversed_edges`, operações estruturais, roles observados, hashes/roots
  observados e qualquer outro campo causal.

`derivation_trace` e `proof_trace` são exclusivamente projeções produzidas pelo
recorder a partir do mesmo log interno, discriminadas por `phase`.

Eventos `I` e medições `M` podem carregar fatos brutos, como path acessado ou
digest medido, mas não escolhem nome, posição, agrupamento, canonicalização,
serialização ou representação desses fatos em `L`. Somente o recorder realiza
essa transformação. Se a mesma quantidade numérica de `R` for observável por
instrumentação, a observação chega exclusivamente por `I`; nunca é copiada do
functional output channel.

O recorder, fora dos evaluators, marca cada acesso com `phase: derivation` ou
`phase: proof` e só então produz as duas views. Graph evaluator e operadores
recebem apenas handles tipados do proxy; nunca recebem snapshot, fixture ou
objeto cru.

Reads estruturais também são observações causais. O proxy instrumenta acesso a
campo e, adicionalmente, existência de propriedade, enumeração de chaves,
iteração, índice, ordem, membership, cardinalidade, `length` e traversal de
aresta; o recorder registra as observações correspondentes. API não instrumentada
é inacessível dentro do runner hermético.

A instrumentação trata como observação causal não apenas leitura de valor, mas
também toda operação cuja resposta possa alterar controle de fluxo ou resultado:

- property existence;
- enumeração de own keys;
- iteração e obtenção de iterator;
- acesso por índice;
- ordem observada;
- membership;
- cardinalidade e `length`;
- seleção e filtro;
- traversal de edge;
- early termination decorrente da estrutura observada.

Nós de prova são records prototype-free; propriedade herdada é inválida, não
uma fonte adicional de resolução. Não existe acesso estrutural gratuito fora do
trace.

O conjunto exato contratado é a união tipada de inputs do valor e nós exclusivos
de prova. Um nó de coverage pode não entrar na soma, mas precisa aparecer no
`proof_trace`; nenhum nó pode ficar fora dos dois.

O provenance evaluator não conhece métricas. Ele conhece somente o schema do
trace e o registry de operadores. O dispatch por métrica permanece restrito ao
kernel de cálculo, onde fórmulas diferentes são semanticamente necessárias.

Adicionar métrica não pode alterar o graph evaluator. Adicionar operador
genérico exige nova versão do registry, ADR curto, mutações de propriedade e
auditoria do contrato.

### 8.1 Semântica content-addressed do evaluator

O trace de inputs não prova, sozinho, a fórmula. Cada entrada do metric
evaluator registry resolve `(evaluator_id, evaluator_version)` para dois hashes:

- `evaluator_contract_hash`: hash integral do contrato revisado de assinatura
  funcional, unidade e propriedades algébricas esperadas; os roles normativos
  dos operandos pertencem exclusivamente à entrada correspondente do metric
  evaluator registry;
- `evaluator_artifact_hash`: Merkle root do closure executável hermético
  realmente carregado, não hash isolado do entry module.

O closure contém entry module, todos os imports transitivos, helpers, tabelas
estáticas, código gerado e configuração capaz de alterar comportamento. O root
é calculado sobre os bytes pós-transformação realmente executados e um
manifesto canônico de paths/roles. Import dinâmico, resolução fora do closure,
plugin não pinado e código carregado por rede são proibidos.

Closure executável significa o conjunto fechado de todos os bytes controlados
pelo projeto capazes de influenciar o comportamento daquela execução após
transformação. Inclui necessariamente:

- entry module;
- imports diretos e transitivos;
- helpers e módulos compartilhados;
- tabelas e constantes comportamentais;
- código gerado e templates compilados em código;
- configuração comportamental;
- helpers/adapters internos puros usados pela função;
- qualquer recurso interpretado como lógica durante a execução.

Helpers/adapters deste closure não podem realizar I/O nem acessar serviço
externo. Resolução por lookup externo, fallback de filesystem, search path não
congelado, dynamic import, plugin não pinado, código remoto ou carregamento
condicional fora do manifesto são inválidos.

Recurso puramente operand/evidence não entra no closure apenas por ser lido via
proxy; qualquer recurso que altere lógica de avaliação, seleção, cálculo ou
transformação é código/configuração comportamental e precisa estar no root.

Build hermético registra também toolchain/build-recipe hash para
reprodutibilidade, mas a identidade da função executada é o Merkle root dos
bytes efetivos. O loader executa somente objetos resolvidos por esse root.

O metric evaluator registry é a única autoridade de
`(evaluator_id, evaluator_version) -> contract hash, artifact root, roles`.
Claim guarda somente `evaluator_ref` e bindings de aliases aos roles; freeze
manifest referencia o hash integral do registry; trace contém os valores
medidos pelo loader e materializados pelo recorder. Claims, traces e manifestos
não redefinem hashes ou roles.

Definir role e referenciar role são operações distintas. O metric evaluator
registry é o único artefato que define o conjunto normativo de operand roles,
sua identidade semântica e o binding esperado para cada
`(evaluator_id, evaluator_version)`. Outros artefatos podem somente referenciar
identificadores de roles resolvidos do registry.

Claim, evaluator contract, provenance graph, fixture, trace e freeze manifest
não podem declarar o conjunto normativo de roles, alterar seu significado,
introduzir role adicional, substituir role ou atribuir semântica normativa a um
role. Nomes locais de parâmetros presentes no evaluator contract são
identificadores funcionais locais e não constituem operand roles normativos.

Essa autoridade é não duplicável. Nenhum claim, trace, freeze manifest,
fixture, provenance graph ou evaluator contract pode publicar segunda cópia
normativa de `contract hash`, `artifact root` ou `roles` para metric evaluator.

`evaluator_ref` identifica a entrada do registry. `operand_bindings` liga
aliases locais aos roles definidos pelo registry, mas não redefine esses roles.
Loader mede hashes/roots dos bytes carregados e recorder registra os valores
observados no trace. Essas medições precisam ser iguais ao registry e não
constituem segunda autoridade. Divergência falha antes da aceitação do resultado.

O freeze manifest também fixa:

- `proof_engine_artifact_root`, closure de graph evaluator e operators;
- `validation_tcb_root`, closure mínimo de loader, sandbox, proxy e recorder.

Todo código controlado pelo projeto que verifica roots, resolve artefatos,
transforma ou carrega módulos, cria ou configura sandbox, fornece proxies ou
registra observações pertence ao `validation_tcb_root`.

Isso inclui qualquer bootstrap mantido no repositório ou produzido pelo build
do projeto que valide roots antes do carregamento. Não existe bootstrap
controlado pelo projeto simultaneamente fora do `validation_tcb_root` e
autorizado a decidir quais bytes serão executados.

Fora do `validation_tcb_root` permanece somente a fronteira mínima declarada de
runtime/CI necessária para iniciar e executar o TCB. Essa fronteira é
explicitamente identificada e pinada pelo build environment. NEXT-00 não afirma
provar sistema operacional, hypervisor, runner ou plataforma de CI.

Runtime/CI externo não pode fornecer código comportamental do projeto, plugin,
helper, configuração de evaluator ou resolução alternativa de módulo. Se
fornecer elemento capaz de alterar a execução validada, ele precisa entrar no
closure/root correspondente ou a execução falha fechada.

Divergência falha antes do cálculo. O loader calcula os hashes/roots dos bytes
efetivamente carregados e fornece essas medições ao recorder pela interface
interna do TCB. O recorder é o único componente que materializa esses valores no
trace; nenhum valor de hash informado pelo evaluator é aceito.
Isso reutiliza a autoridade determinística do kernel; o provenance graph não
ganha uma segunda DSL de fórmulas.

Metric evaluator, graph evaluator e operators executam hermeticamente e só
acessam operandos pelo proxy tipado. I/O, rede, relógio implícito, aleatoriedade,
variável global, acesso direto à fixture ou leitura fora do proxy são proibidos.
Relógio, policy e registry necessários entram como operandos explícitos e
versionados. O proxy instrumenta os acessos reais e o recorder gera `reads`,
roles observados e selected nodes; nenhum evaluator pode omiti-los.

Operandos têm papéis tipados. Diferença declara `left` e `right`; razão declara
`numerator` e `denominator`; ranking declara população, chave e direção. Aresta
`derived_from` sem papel não é suficiente para operação sensível à ordem.

Cada evaluator possui propriedades discriminantes independentes do Golden Set.
Exemplos: trocar `left/right`, usar `abs(left-right)` ou inverter ordenação
precisa falhar em witness sintético que produza resultado diferente. Se o
corpus corrente não distingue duas fórmulas, o registry cria witness adicional;
coincidência do Golden Set nunca prova a fórmula.

## 9. Exemplos causais obrigatórios

### 9.1 Source coverage

`source-complete-june` precisa provar simultaneamente:

- período da fonte igual ao período do claim;
- cobertura da fonte igual ao estado do claim;
- entidade/categoria, quando presentes, iguais ao escopo do claim;
- fingerprint semântico íntegro.

Mudar junho para julho mantendo o ID deve falhar por fingerprint e por
`period_eq`.

### 9.2 Vazio por categoria

`source-empty-health` precisa provar:

- período igual;
- categoria igual;
- coverage `complete`;
- `event_count == 0`;
- consulta determinística retorna conjunto vazio para o mesmo escopo.

Mudar a categoria para outra categoria existente precisa falhar mesmo que o
resultado numérico continue zero.

### 9.3 Transferência

As duas pontas precisam:

- existir no conjunto exato de evidência;
- compartilhar a mesma identidade `transfer_pair`;
- ter sinais opostos e soma zero na moeda canônica;
- pertencer ao escopo familiar consultado;
- usar o período do claim.

Retarget, remoção ou divergência de uma ponta falha sem operador especial de
transferência.

### 9.4 Estorno

O evento de refund precisa apontar por campo tipado para o ID do evento alvo.
O alvo precisa estar no grafo e a aresta precisa ser percorrida pelo trace.
Trocar `compensates` por outro evento válido do mesmo kind falha.

### 9.5 Pagamento de fatura

Neutralidade de consumo e correspondência com fatura são provas diferentes.
`settles_card_id` prova apenas o cartão. Correspondência com uma fatura exige
`statement_id` ou competência/versão inequívoca; sem isso o contrato não pode
usar a palavra `correspondente`.

## 10. Propriedades e mutações geradas

A bateria não enumera exemplos. Ela deriva mutações do schema, do registry de
campos materiais e de cada grafo.

### 10.0 Átomos de prova e ortogonalidade

Compiler e registries decompõem a validade em átomos identificáveis:

`claim`, `identity`, `fingerprint`, `subject`, `period`, `time_basis`,
`coverage`, `evidence_state`, `evidence_set`, `edge`, `trace`, `evaluator`.

Cada mutant declara `expected_violations`. O harness compara o conjunto exato
de violações observado, não apenas `RED` global.

Toda classe precisa de mutant isolado em que as demais barreiras relevantes
permaneçam válidas:

- fingerprint: alterar somente o fingerprint esperado, mantendo conteúdo e
  predicados;
- predicado: alterar o conteúdo, recalcular fingerprint e manter estrutura,
  para que apenas a relação semântica rejeite;
- aresta: retargetar a relação, recalcular fingerprint e reparar representações
  auxiliares sem mudar o claim;
- trace: remover/trocar leitura com snapshots e predicados intactos;
- evaluator: trocar artefato, hash, papel de operando ou fórmula usando witness
  discriminante.

Grupos atômicos são proibidos. Cada átomo precisa de witness ortogonal próprio.
Se a arquitetura não conseguir isolar um átomo, o resultado é
`UNSATISFIED_MUTATION_WITNESS` e o gate falha; não se reduz a granularidade de
`expected_violations` para acomodar a limitação.

### 10.1 Nós

Para cada nó:

- substituir por outro ID válido do mesmo kind;
- alterar versão/fingerprint;
- remover, duplicar ou acrescentar nó;
- alterar cada campo material por outro valor válido do mesmo tipo.

### 10.2 Predicados

Para cada predicado:

- remover o predicado;
- trocar um operando por path válido mas errado;
- inverter ou retargetar a relação;
- alterar operador por outro compatível em tipo, porém semanticamente errado;
- inserir operador/path desconhecido.

### 10.3 Arestas

Para cada campo de aresta presente:

- remover a aresta;
- retargetar para nó válido do mesmo kind;
- quebrar apenas uma ponta de par;
- manter os valores finais iguais e mudar a identidade econômica.

### 10.4 Trace

Para cada leitura e aresta do trace:

- omitir;
- acrescentar leitura não declarada;
- mudar path para campo do mesmo tipo;
- mudar conjunto selecionado preservando o total;
- mudar evaluator id ou versão.

### 10.5 Cardinalidade

As contagens esperadas são calculadas do próprio schema compilado:

```text
mutations_expected =
  material_node_fields
  + predicates
  + material_edges
  + trace_reads
  + trace_edges
  + structural_mutations
```

Não existe número hardcoded que possa continuar verde após inclusão de novo
nó, campo, aresta ou fato.

### 10.6 Witness obrigatório e fail-closed

Cada mutação enumerada precisa produzir um witness schema-valid e
discriminante. O gerador segue esta ordem:

1. reutilizar alternativa válida do closed world;
2. sintetizar alternativa mínima a partir do schema do kind;
3. comprovar que somente os átomos declarados foram invalidados;
4. executar o mutant e confrontar `expected_violations`.

Se não conseguir materializar witness, o resultado é
`UNSATISFIED_MUTATION_WITNESS` e o gate falha. Nunca há `skip`, redução da
cardinalidade esperada ou aceitação por ausência de alternativa.

O relatório registra `expected`, `generated`, `executed` e `matched`; os quatro
totais precisam ser iguais.

## 11. Compilador e evaluator

O futuro motor documental terá duas fases separadas:

### 11.1 Compile

1. validar JSON Schema e versões;
2. resolver tipos e paths;
3. construir o grafo;
4. calcular obrigações pelo schema e campos materiais presentes;
5. rejeitar qualquer trace-read de campo `non_material`;
6. resolver evaluator contract/artifact e papéis tipados dos operandos;
7. rejeitar nó, path, aresta ou predicado não consumido;
8. produzir IR imutável, sem executar métrica.

### 11.2 Evaluate

1. resolver snapshots da fixture por `(kind, id, version)`;
2. conferir fingerprints;
3. resolver no metric evaluator registry o evaluator, contract hash, artifact
   root e roles esperados;
4. conferir `evaluator_artifact_hash` contra o closure pós-transformação
   efetivamente carregado antes da execução;
5. executar metric evaluator no runner hermético, fornecendo exclusivamente
   handles tipados do proxy, e obter `R` pela interface funcional registrada;
6. obter exclusivamente do recorder externo o `derivation_trace` da execução;
7. executar graph evaluator e operators no mesmo modelo hermético, também
   exclusivamente por handles do proxy;
8. obter exclusivamente do recorder externo o `proof_trace` da fase de prova;
9. conferir hashes medidos, roles observados, trace, conjunto exato, leituras
   estruturais e obrigações contra registry e contrato;
10. confrontar o resultado funcional do metric evaluator com o value oracle;
11. emitir violações por átomo ou PASS.

Nenhum passo de Evaluate aceita trace fornecido por metric evaluator, graph
evaluator ou operator implementation.
Nenhum passo insere `R` ou intermediário funcional no log ou nas projeções de
trace, e nenhum envelope ou alias pode reunir `R` e `T` sob uma autoridade única.

O compilador e o evaluator não podem importar nem consultar o value oracle para
formar o contrato.

## 12. Versionamento e auditoria

O desenho propõe congelar separadamente:

- schema do grafo;
- operator registry;
- material field registry;
- metric evaluator registry, cujo hash integral referencia canonicamente seus
  evaluator contracts, evaluator artifact roots e roles;
- compiler, graph evaluator e operator implementation artifacts quando
  existirem;
- `validation_tcb_root` de loader, sandbox, proxy e recorder;
- claim/provenance contract;
- value oracle;
- fixture sintética.

O freeze manifest registra hashes/roots das autoridades congeladas conforme sua
fronteira.

Para metric evaluators, registra somente o hash integral do metric evaluator
registry como autoridade canônica. Contract hashes, evaluator artifact roots e
roles permanecem conteúdos normativos desse registry e não são replicados em
segunda tabela autoritativa no freeze manifest.

O freeze manifest registra separadamente roots de outras autoridades
executáveis que não pertencem ao metric evaluator registry, incluindo
`proof_engine_artifact_root` e `validation_tcb_root`.

Valores de evaluator observados em runtime aparecem somente como medições no
trace e precisam coincidir com a resolução do registry.

Mudança em qualquer autoridade congelada exige:

1. justificativa causal;
2. bateria de mutações regenerada;
3. uma suíte ampla somente após estabilidade;
4. novo commit imutável;
5. auditoria independente.

O auditor precisa confirmar tanto a completude arquitetural quanto ao menos um
RED por classe de drift: campo, nó, aresta, conjunto, trace e versão.

## 13. Migração sem remendo

A incorporação, se o desenho for aprovado, será feita em uma troca única de
abstração:

1. ratificar este desenho;
2. publicar schema v2 e registries genéricos;
3. autorar e revisar os grafos dos 76 fatos, sem gerá-los do oracle, e então
   compilá-los somente para validação;
4. implementar compiler/evaluator sem branches por métrica;
5. gerar propriedades para todo o grafo;
6. retirar relações isoladas do schema v1;
7. executar testes focais e uma única suíte ampla;
8. publicar novo candidato para reauditoria.

Não será permitido migrar primeiro `source.period`, depois `category_id`, depois
`transfer_pair` e depois `compensates`. Isso repetiria exatamente a classe de
remendo proibida.

## 14. Critérios de aprovação desta arquitetura

O desenho só pode virar contrato normativo se a revisão independente confirmar:

1. nenhuma prova depende de branch por métrica ou fato;
2. IDs, conteúdo, dimensões e arestas são cobertos simultaneamente;
3. toda leitura real aparece no trace e todo nó contratado é consumido;
4. campos materiais e arestas geram obrigações automaticamente;
5. mutações são derivadas do schema, não de exemplos selecionados;
6. cada átomo tem mutant ortogonal e violação esperada verificada;
7. evaluator e fórmula executados são content-addressed pelo closure completo,
   com operandos tipados e witnesses discriminantes;
8. calculation e proof reads são capturados externamente, inclusive operações
   estruturais;
9. campo lido por qualquer trace é material e nunca `non_material`;
10. witness ausente falha o gate em vez de reduzir a bateria ou agrupar átomos;
11. registry é a única autoridade de hashes/roles e as demais representações
    são referências ou medições;
12. um novo kind ou operador exige versão explícita e auditoria;
13. a linguagem é pequena, tipada, fail-closed e sem código arbitrário;
14. a migração substitui a abstração inteira, sem rollout por exceção;
15. nenhum runtime, produção, writer, integração ou dado real entra no gate;
16. não existe finding HIGH de completude causal.

## 15. Condições de NO-GO

São bloqueantes:

- propor apenas hashes de objetos sem predicados semânticos;
- adicionar relações por `fact_key` ou por métrica no evaluator;
- manter strings sobrecarregadas como autoridade de escopo/período;
- aceitar nós ou campos materiais não consumidos;
- aceitar RED global sem conferir os átomos de violação esperados;
- permitir leitura causal de campo `non_material`;
- executar evaluator cujo closure completo não corresponda ao Merkle root do
  registry;
- permitir acesso de metric/proof evaluator ou operator fora do proxy externo;
- autodeclarar `proof_trace` ou omitir observação estrutural;
- duplicar hashes/roles como autoridade em claim, trace ou freeze manifest;
- aceitar trace, read-set, selected-node set, traversal ou metadado causal
  fornecido pelo próprio metric evaluator, graph evaluator ou operator;
- permitir bootstrap controlado pelo projeto fora do `validation_tcb_root`;
- permitir runtime/CI externo injetar código ou configuração comportamental não
  incluídos em root;
- manter segunda autoridade de contract hash, evaluator artifact root ou roles
  fora do metric evaluator registry;
- permitir que componente diferente do recorder determine existência, nome,
  valor, ordem, associação, agregação, serialização ou inclusão de conteúdo do
  trace, independentemente do verbo usado para descrever o ato;
- permitir que artefato diferente do metric evaluator registry defina ou altere
  o significado normativo de operand role;
- aceitar de evaluator/operator qualquer output causal além do resultado
  funcional tipado e dos intermediários funcionais previstos pela assinatura;
- incluir `R` ou output funcional intermediário em `L`, `derivation_trace` ou
  `proof_trace`;
- usar `T` na comparação com value oracle em vez de `R`;
- permitir que proxy ou loader emitam objeto estruturalmente pertencente ao
  namespace de trace;
- permitir que recorder obtenha metadado causal de `R` em vez de `I` ou `M`;
- criar envelope, alias ou sinônimo que reúna `R` e `T` como autoridade única;
- permitir que evento `I` ou medição `M` declare sua representação em `L`;
- agrupar átomos para evitar witness ortogonal;
- ignorar mutação porque não foi possível gerar witness;
- permitir `OR`, fallback ou coerção para fechar lacuna;
- usar o oracle para gerar o contrato durante a validação;
- testar apenas os quatro exemplos que motivaram o finding;
- implementar antes da revisão desta arquitetura.

## 16. Próxima fronteira

Este documento é a fronteira atual. Nenhum código do motor deve ser escrito
antes de uma revisão arquitetural independente do hash imutável que contenha
esta proposta e de uma decisão explícita sobre sua ratificação.
