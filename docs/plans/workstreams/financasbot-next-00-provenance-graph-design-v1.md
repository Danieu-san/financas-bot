# NEXT-00 — Desenho do contrato declarativo de provenance

Atualizado em: 2026-08-31
Estado: `CANDIDATO DE ARQUITETURA — NÃO NORMATIVO; IMPLEMENTAÇÃO BLOQUEADA`
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
4. **trace de derivação:** leitura efetivamente feita pelo avaliador
   determinístico para produzir o valor.

O verde exige igualdade entre essas quatro visões. Valor correto com vínculo
errado, ID correto com conteúdo alterado ou contrato correto sem leitura real
devem falhar fechado.

## 3. Separação de autoridades

O desenho separa responsabilidades que não podem ser fundidas:

| Artefato | Autoridade | Não pode fazer |
|---|---|---|
| claim contract | semântica revisada da pergunta | calcular o valor |
| fixture/snapshot | mundo sintético observado | declarar sozinho que a relação é correta |
| metric evaluator | cálculo determinístico e trace de leitura | escolher o claim esperado |
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
- `T`: trace de derivação emitido pelo avaliador determinístico.

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
AND value_matches_oracle(T)
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

1. `claim_semantics`: metric, unit e evaluator id/versão coincidem;
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

Cada metric evaluator continua responsável pelo valor financeiro, mas passa a
emitir junto um trace estruturado:

```yaml
evaluator_id: category_consumption@1
selected_nodes: [evt-snack-a]
reads:
  - {node: evt-snack-a, path: amount_minor}
  - {node: evt-snack-a, path: date}
  - {node: evt-snack-a, path: person_id}
  - {node: evt-snack-a, path: category_id}
traversed_edges: []
operations:
  - {op: sum, inputs: [evt-snack-a.amount_minor], output: -1200}
result: 1200
```

O trace nasce da execução do avaliador, não do contrato. O graph evaluator
confronta o trace com `trace_contract`:

- leitura usada e não declarada: erro;
- leitura declarada e nunca usada: erro;
- nó extra ou ausente: erro;
- aresta material ignorada: erro;
- evaluator id/versão divergente: erro;
- resultado diferente do value oracle: erro.

O sistema conserva dois traces distintos:

- `derivation_trace`, emitido pelo metric evaluator e usado para cálculo;
- `proof_trace`, emitido pelo graph evaluator e usado para predicados,
  fingerprints e obrigações.

O conjunto exato contratado é a união tipada de inputs do valor e nós exclusivos
de prova. Um nó de coverage pode não entrar na soma, mas precisa aparecer no
`proof_trace`; nenhum nó pode ficar fora dos dois.

O provenance evaluator não conhece métricas. Ele conhece somente o schema do
trace e o registry de operadores. O dispatch por métrica permanece restrito ao
kernel de cálculo, onde fórmulas diferentes são semanticamente necessárias.

Adicionar métrica não pode alterar o graph evaluator. Adicionar operador
genérico exige nova versão do registry, ADR curto, mutações de propriedade e
auditoria do contrato.

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

## 11. Compilador e evaluator

O futuro motor documental terá duas fases separadas:

### 11.1 Compile

1. validar JSON Schema e versões;
2. resolver tipos e paths;
3. construir o grafo;
4. calcular obrigações pelo schema e campos materiais presentes;
5. rejeitar nó, path, aresta ou predicado não consumido;
6. produzir IR imutável, sem executar métrica.

### 11.2 Evaluate

1. resolver snapshots da fixture por `(kind, id, version)`;
2. conferir fingerprints;
3. receber o trace do metric evaluator;
4. executar predicados via operator registry;
5. confrontar trace, conjunto exato e obrigações;
6. confrontar o resultado com o value oracle;
7. emitir lista completa de violações ou PASS.

O compilador e o evaluator não podem importar nem consultar o value oracle para
formar o contrato.

## 12. Versionamento e auditoria

O desenho propõe congelar separadamente:

- schema do grafo;
- operator registry;
- material field registry;
- claim/provenance contract;
- value oracle;
- fixture sintética.

O manifesto de freeze registra SHA-256 integral de cada artefato. Mudança em
qualquer artefato exige:

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
6. um novo kind ou operador exige versão explícita e auditoria;
7. a linguagem é pequena, tipada, fail-closed e sem código arbitrário;
8. a migração substitui a abstração inteira, sem rollout por exceção;
9. nenhum runtime, produção, writer, integração ou dado real entra no gate;
10. não existe finding HIGH de completude causal.

## 15. Condições de NO-GO

São bloqueantes:

- propor apenas hashes de objetos sem predicados semânticos;
- adicionar relações por `fact_key` ou por métrica no evaluator;
- manter strings sobrecarregadas como autoridade de escopo/período;
- aceitar nós ou campos materiais não consumidos;
- permitir `OR`, fallback ou coerção para fechar lacuna;
- usar o oracle para gerar o contrato durante a validação;
- testar apenas os quatro exemplos que motivaram o finding;
- implementar antes da revisão desta arquitetura.

## 16. Próxima fronteira

Este documento é a fronteira atual. Nenhum código do motor deve ser escrito
antes de uma revisão arquitetural independente do hash imutável que contenha
esta proposta e de uma decisão explícita sobre sua ratificação.
