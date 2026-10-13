# Fronteira A — fontes normative integrais

CODE cf6e43cbaa7c378f2b64590c50d0818700a3bdd0. Navegação, sem veredito.

## docs/contracts/next/provenance-v2/authoring-contract-v1.md

SHA-256 7040d3cee24341a15af3fb3ca6acf84df6a207b10af13828739f545f87ae1328; Git blob 24cd320b71e110e6598837067536e8f24810bdf0; bytes 9498.

```markdown
# Provenance v2 — contrato de preparação N02-F

Estado: RASCUNHO DE AUTORIA; NÃO É REGISTRY EXECUTÁVEL NEM GATE APROVADO.
Data: 2026-09-09. Autoridade superior: desenho NEXT-00 ratificado e CP-02.

## 1. Fronteiras de artefatos

| Artefato a preparar | Conteúdo | Não confundir com |
|---|---|---|
| Schema de claim | tipos e obrigatoriedade de identidade, semântica e referências | resultado esperado pelo oracle |
| Schema de grafo | nós, predicados, arestas e trace_contract | trace observado |
| Material field registry | classificação de cada campo por kind | lista seletiva dos campos que os testes atuais leem |
| Operator registry | assinaturas/semântica dos operadores genéricos aprovados | fórmula de cada métrica |
| Metric evaluator registry | resolução canônica de contrato, closure e operand roles | hashes repetidos no claim ou no freeze |
| Grafos revisados | binding causal de cada fact_key | cópia das evidence_refs v1 |
| Rastreabilidade de autoria | fontes semânticas e estado de revisão por grafo | prova de execução ou aprovação independente |

Um arquivo futuro não deve ser chamado de congelado/medido apenas porque
possui campos com esses nomes. Os roots executáveis só podem ser fixados com
os respectivos bytes existentes. Nesta preparação, ausência de executável é
uma pendência explícita que impede execução; não uma exceção ao hash exigido.
A proposta em `type-and-identity-contract-v2.md` e no schema de registry
separa authoring não executável de execution. Ela continua sujeita à auditoria;
não permite `null`, zero ou placeholder como comprovação de execução.

## 2. Inventário de partida conferido

Fonte: `tests/fixtures/financasbot-next/golden-fact-contracts-v1.json`.
Inspeção mecânica na base N02-F: 76 fact_keys únicos, 39 métricas e 27 refs
distintas. As unidades existentes são `BRL_minor`, `count`, `entity_ids` e
`state`. Isso orienta tipos de resultado; não prova completude dos grafos.

Os períodos incluem datas, mês, intervalos, as_of, through e statement_due.
Os sujeitos incluem composição de família/pessoa/categoria, orçamento/pessoa,
par de transferência, agenda, fonte e execução de turno. Separar delimitadores
de strings não basta: o autor deve conferir o significado no diálogo e na
fixture. Não interpretar essas strings como autoridade em runtime.

O inventário usa o contrato semântico v1, não os valores do oracle. Os 76
grafos ainda não foram autorados ou revisados nesta abertura.

Catálogo observado em `golden-financial-fixture-v1.json` (união dos campos
presentes, não schema deduzido nem registry completo):

| Coleção | Objetos | Campos observados |
|---|---:|---|
| families | 2 | id, label, members |
| people | 3 | family_id, id, label |
| accounts | 3 | id, label, opening_balance_as_of, opening_balance_minor, owner_id, type |
| cards | 3 | closing_day, due_day, id, label, owner_id |
| categories | 12 | budget_class, id, kind, label |
| events | 16 | account_id, amount_minor, card_id, category_id, compensates, date, id, installment_number, installment_plan, installment_total, merchant_key, person_id, settles_card_id, state, transfer_pair |
| budgets | 2 | category_id, evidence_state, family_id, id, limit_minor, period, source |
| bills | 1 | amount_minor, due_date, evidence_state, id, person_id, source, status |
| source_states | 4 | category_id, coverage, entity_id, event_count, id, period, source |
| proposals | 3 | expires_at, id, source_version, state |
| reminders | 0 | não observável nesta fixture |
| calendar_events | 0 | não observável nesta fixture |
| side_effects | 0 | não observável nesta fixture |
| merchant_rules | 1 | application, category_id, evidence_state, id, merchant_key, reversible, source |

Consequências para a autoria: coleções vazias não provam ausência de campos ou
de obrigações; `statement_id` não aparece nos eventos e não pode ser inventado
para provar correspondência de fatura; versões dos snapshots precisam de
representação explícita, pois nem todo registro possui `version`. Campos `source`
e IDs de vínculo precisam de tipos/semântica conferidos, não inferidos pelo nome.
Não classificar `label` como non_material sem conferir se alguma operação o
usa causalmente. Este catálogo preserva a evidência de partida e não autoriza
adicionar os campos faltantes à fixture v1.

## 3. Catálogo obrigatório do claim

| Campo/conceito | Autoridade e requisito de autoria |
|---|---|
| claim_id interno | identidade no escopo definido pelo contrato; distinto de fact_key e evidence ref; ausência/colisão/misbinding precisam ser recusados |
| fact_key | identidade do fato no corpus; não é identidade pública nem identidade de execução |
| metric | operação revisada da pergunta, resolvida para evaluator_ref |
| unit | tipo/unidade compatível com assinatura funcional e expectativa revisada |
| subject | união tipada com campos explícitos por kind; sem parsing de delimitador em runtime |
| period | união tipada com limites e inclusividade explícitos por kind |
| time_basis | lente explicitamente relacionada aos campos temporais da evidência |
| coverage / evidence_state | ligados ao mesmo claim, fontes e conjuntos; presença não prova completude |
| evaluator_ref | somente id/version; hashes e roles normativos resolvidos no registry |
| operand_bindings | referências aos roles do registry e aos aliases locais; não redefine role |
| vínculo ao resultado | resultado funcional R validado separadamente e associado ao claim correto; não inserido no trace |
| vínculo à evidência | conjunto exato dos nós de valor e prova, incluindo arestas materiais |

A política proposta de escopo/binding do claim_id está em
`type-and-identity-contract-v2.md` e ainda precisa ser revisada. Não usar
automaticamente fact_key, hash estável público ou sequência global como solução.
Claims derivados preservam a identidade ratificada
`(fact_key, evaluator_version, result_hash)` e ancestry dos pais; esse requisito
não elimina claim_id nem permite trocar a ordem dos operandos.

## 4. Envelope público separado

`ClaimEnvelope` é projeção minimizada de um claim já validado, com identidade
efêmera limitada ao request. Não expõe fact_key, IDs internos, roots estáveis,
row/source IDs ou provenance privada. Labels/ref efêmeras não são prova de
ownership: autorização e binding antecedem a projeção.

A futura especificação deve definir separadamente: identidade interna,
identidade pública efêmera, escopo de unicidade, tabela interna de binding e
recusa de referência fora do request. Não copiar o shape atual de
`typedEvidenceVerifier` como se ele validasse `entity.label` público: hoje exige
`entity.ref`. Nenhuma implementação desse mapeamento faz parte desta abertura.

## 5. Requisitos do grafo e dos canais

Cada nó terá kind/ref/version/fingerprint, alias e papéis de evidência. Cada
campo permitido deve ser identity, dimension, edge ou non_material justificado.
Campo desconhecido/não classificado falha; non_material fica inacessível aos
evaluators. Toda aresta presente gera obrigação, mesmo protegida por hash.

As onze obrigações da seção 7 do desenho e os átomos da seção 10 são conjuntos
distintos; o schema deve mapear ambos sem perder granularidade. Não há
not_applicable livre ou grupo atômico para evitar witness ortogonal.

E permanece arestas. R é resultado funcional. I são eventos instrumentados.
M são medições do loader. L é estado exclusivo do recorder. T são projeções de
L por phase. O grafo contém trace_contract, não trace autodeclarado. Nem R nem
seus intermediários pertencem a L/T. Prova de valor e prova causal são exigidas
simultaneamente e continuam separadas.

## 6. Evidência de autoria exigida por fato

Para cada fact_key, registrar a pergunta/contrato de origem, sujeito/período
tipados, fontes da fixture, relações semânticas, evaluator_ref, bindings,
obrigações e requisitos de leitura/estrutura/arestas. Referenciar a revisão
independente somente depois de recebida. Grafo autorado não é grafo aprovado.

Se o mundo sintético não sustentar uma relação, registrar pendência com a
evidência que falta. Não inferir statement_id de card_id nem fabricar coverage
complete a partir de lista vazia. Nenhum fato pode desaparecer por ser de
domínio futuro ou por não ter witness imediato.

## 7. Entregas em rascunho e pendências

Os schemas iniciais de claim/metric evaluator registry, o material field
registry e o operator registry já existem como rascunhos. A semântica dos dois
últimos está em `registry-semantics-v1.md`; suas contagens e checks de inventário
não representam aprovação ou execução. Ainda faltam:

1. Revisão dos schemas de payload/grafo e manifest de snapshots já escritos.
2. Revisão das propostas de identidade e de executáveis futuros já escritas,
   incluindo o preimage de derived_claim e binding ao grafo anterior definidos
   em `graph-binding-contract-v1.md`.
3. Contratos e entradas de metric evaluator registry, templates e bindings
   completos, sem inventar roots de artefatos executáveis ainda inexistentes.
4. Grafos autorados e revisados 76/76, sem geração a partir do oracle.
5. Revisão independente integral antes do compiler/evaluator.

Este documento é preparação rastreável, não alegação de fechamento de G07,
G08, G11 ou G14 e não autoriza execução antecipada.
```

## docs/contracts/next/provenance-v2/causal-authoring-candidates/README.md

SHA-256 1c018f2e87d96ea4bb504574751171e1ad192820aa60a1e32976d83964bd9b1b; Git blob 99bb2b0364decd4f5a2bdcbaaf202e311326bd70; bytes 7330.

````markdown
# Perfis candidatos de autoria causal — não normativos

2026-09-21. Implementação local do método documental revisado em
`8b9c4fca93186c9f747ba1a868bf1616ba15d92a`. O APTO do método permite construir
estes candidatos, não ratifica suas decisões semânticas ou seu delta. Nenhum
perfil aqui é carregado pelo runtime; o gerador não aplica sua saída.

Atualização 2026-09-21 (UTC 2026-09-22): a regra/delta fechado dos seis perfis
recebeu APTO documental condicionado em 6f66556a256577c1bcdbc9678090b91dc43536ec.
Aplicação externa local somente dos cinco campos derivacionais, preservando
proof/seleção/inventário e os 70 outros grafos, está em validação; não é GO.
Relatórios históricos abaixo permanecem congelados. Reexecutar o relatório
sobre a nova autoria mantém os seis candidatos, mas produz delta zero;
isso não torna normative_application_allowed verdadeiro nem aprova grafos.
Decisão e condições: docs/plans/workstreams/financasbot-next-02-n02g-instrument-authoring-decision-v1.md.

## Escopo e decisões explícitas

Somente consumption_by_instrument e statement_total. Os seis passos do
programa são operações fechadas; não há expressão executável, callback ou
consulta a actual/expected. Ordem diferente, operação/campo/ramo sem suporte
aborta, inclusive quando um campo opcional não está presente nos dados.

1. Validar coverage/evidence_state/time_basis pelos valores declarados.
2. Conferir a identidade do instrumento contra o sujeito do claim.
3. Construir a janela civil: mês do evento, ou ciclo de fechamento
   `(previous_close, current_close]`. Validar due_day, mês anterior exato e
   calendário declarado; sem Date/timezone do ambiente, clamp ou statement_id.
4. Examinar identidade e classificação de toda a população de categorias.
5. Examinar todos os candidatos: identidade, data, estado, presença/referência
   do tipo de instrumento consultado, categoria e compensação quando presente.
   A categoria efetiva da compensação vem de sua fonte. Cadeia de compensações
   e categoria incoerente abortam. Todas essas guardas são observadas antes de
   filtrar financeiramente; esta é uma decisão explícita do perfil candidato.
   A fonte de compensação deve ter a classe elegível expense; income/neutral
   não podem apenas excluir a contribuição silenciosamente. Essa guarda vale
   também quando a compensação tem estado projected ou está fora do escopo.
6. Declarar a leitura de amount_minor apenas para contribuições elegíveis.
   Não somar, emitir R ou impor nova aceitação financeira por magnitude/sinal;
   essas responsabilidades continuam nos gates próprios. Valores materiais
   diferentes, mantendo os discriminantes, não mudam obrigações de leitura.

A política `identity_for_every_resolved_target` exige identidade e versão
também do alvo estrangeiro antes de excluí-lo. Sua justificativa proposta é
que a relação resolvida deve ter identidade nominal validada, não apenas um
texto coincidente. O pertencimento ao instrumento ligado exige o mesmo ID e
a mesma versão; outra versão admitida do mesmo ID permanece alvo observado,
mas não contribuição desse instrumento. Essa escolha é candidata à revisão, não inferência do
runtime. A alternativa reconhecida na fronteira
`identity_version_only_for_matching_id` não possui interpretação implementada:
a geração com ela aborta, sem escolher um default.

Não se propõe consultar person_id/owner_id quando o escopo é o instrumento,
nem a referência ao outro tipo de instrumento. Para datas já civis, o perfil
de fatura consulta calendar, mas não converte timezone. São diferenças que
precisam de revisão explícita do delta, não autorização para apagar leituras
da autoria antiga ou do runtime. As relações econômicas de proof continuam
inteiras e fora da saída do gerador. Seleção ratificada nunca é reescrita.

## Fronteiras e evidência

`scripts/agent/nextCausalAuthoring.cjs` recebe somente strings JSON; projeta
topologia, campos permitidos do claim e bindings. Exclui trace_contract antigo,
proof, sets, selections, predicates, selected_nodes, fact_key e resultados.
O núcleo recebe snapshots materiais e descritores de campos tipados, não
handles de execução. Não importa avaliador, compiler, recorder ou oracle.
Reutiliza apenas canonicalValue/digest, primitiva pura de JSON/hash.

Manifesto separado fixa schemas de claim/snapshot, registries material e de
métricas, contrato, perfil, manifesto de snapshots e todas as suas fontes.
Admissão confere hashes, schemas, roles, tuplas, relações fornecidas e
fingerprints semânticos. Referência exigida ausente/ambígua aborta a geração.
Isso não autentica a raiz ou o host e não reexecuta todos os mapeamentos de
authorship dos snapshots contra fontes. Os testes sintéticos que mudam dados
e recalculam fingerprints continuam candidatos autoadmitidos, não evidência
de origem externa. Alteração de fonte exige revisão de autoria independente.

A saída contém apenas cinco dimensões de obrigações, justificativas e digests.
`graph_accepted=false` e `normative_application_allowed=false` são invariantes.
Não emite resultado financeiro, selected_nodes ou autorização de produção.

`scripts/agent/reportNextCausalAuthoring.cjs` gera primeiro; só depois compara
com a derivation antiga. Lista cada adição com sua regra e cada ausência como
remoção proposta que exige revisão. Confere que o corpus inteiro e os claims
não foram alterados; registra o hash das partes protegidas de cada grafo.
Somente os seis claims dos dois contratos são candidatos; os outros 70
permanecem fora do perfil. Nenhum caminho de aplicação existe.

O CLI usa explicitamente UTF-8/LF para a fixture sintética, como os testes do
corpus. Os hashes são dos bytes LF fornecidos, não medição dos arquivos crus
do host. Saída opcional apenas em arquivo novo diretamente em .codex-temp;
recusa sobrescrita, diretório linkado, caminho externo e opção desconhecida.

```text
node scripts/agent/reportNextCausalAuthoring.cjs
node scripts/agent/reportNextCausalAuthoring.cjs --output .codex-temp/candidate-new.json
node --test tests/next/provenance/causalAuthoring.cases.js
```

## Primeiro delta observado — ainda não autorizado

Seis grafos, sem alteração de qualquer um dos 76 originais:

| Dimensão | Adições propostas | Remoções propostas |
| --- | ---: | ---: |
| Nós consumidos | 8 | 0 |
| Reads de snapshots | 11 | 155 |
| Reads do claim | 12 | 0 |
| Arestas | 0 | 148 |
| Observações estruturais | 192 | 0 |

A magnitude das remoções exige confronto semântico, não aprovação por
contagem ou coincidência com runtime. Exemplo: person_id e referência ao outro
instrumento são omitidos pelo programa; has é declarado para as duas guardas
opcionais por candidato. Não houve comparação com actual neste gerador.
O relatório integral identifica cada obrigação em
`docs/audit-evidence/n02g-causal-authoring-profile/candidate-report.json`, com
extrato completo separado e verificador mecânico. Bateria hermética afetada:
93 PASS; ampla da composição local: 2.359 PASS/0 FAIL/10 SKIP esperados,
candidato inalterado. Esses resultados não autorizam o delta. Auditoria
independente do novo código/perfil permanece pendente.
````

## docs/contracts/next/provenance-v2/causal-authoring-candidates/consumption-by-instrument-profile-v1.json

SHA-256 4c2be2d8f773b85e008d8f476d37196bdab9b0bac58848c616294f685fcda99a; Git blob 3ec83767262fcf9f852d6ecb165bb7a80459438a; bytes 1205.

```json
{
  "profile_version": 1,
  "evaluator_id": "consumption_by_instrument",
  "evaluator_version": 1,
  "metric": "consumption_by_instrument",
  "contract_hash": "sha256:e32bc36ae9642c1db0d0eb6dce05c3861a80d967b974613eafc8fc6a341dbd37",
  "foreign_reference_policy": "identity_for_every_resolved_target",
  "program": [
    { "op": "claim_context", "required": { "coverage": ["complete"], "evidence_state": ["confirmed"], "time_basis": ["event_date"] } },
    { "op": "instrument", "role": "instrument", "kinds": ["account", "card"] },
    { "op": "civil_window", "rule": "claim_month" },
    { "op": "classification_population", "role": "categories", "kind": "category", "field": "kind", "values": ["expense", "income", "neutral", "compensation"] },
    { "op": "economic_candidates", "role": "events", "kind": "event", "date_field": "date", "state_field": "state", "required_state": "confirmed", "reference_by_kind": { "account": "account_id", "card": "card_id" }, "category_field": "category_id", "compensation_field": "compensates", "eligible_class": "expense", "compensation_class": "compensation", "guards": "observe_all_before_filtering" },
    { "op": "contribution", "field": "amount_minor" }
  ]
}
```

## docs/contracts/next/provenance-v2/causal-authoring-candidates/statement-total-profile-v1.json

SHA-256 12cd0fa53fb62121068cdb85ededa91a0b5faec6976d2a9eb3a8045502485723; Git blob d836914cfebe270f03fae81a9f151415444341c3; bytes 1358.

```json
{
  "profile_version": 1,
  "evaluator_id": "statement_total",
  "evaluator_version": 1,
  "metric": "statement_total",
  "contract_hash": "sha256:cca2c51e9d89ef572d069eb019d30924fc41409724c1d07abc7d2a215ce1d002",
  "foreign_reference_policy": "identity_for_every_resolved_target",
  "program": [
    { "op": "claim_context", "required": { "coverage": ["complete"], "evidence_state": ["confirmed"], "time_basis": ["statement_due_date", "statement_competence"] } },
    { "op": "instrument", "role": "card", "kinds": ["card"] },
    { "op": "civil_window", "rule": "previous_close_exclusive_current_close_inclusive", "policy_role": "policy", "calendar_field": "calendar", "calendar": "proleptic_gregorian", "closing_field": "closing_day", "due_field": "due_day" },
    { "op": "classification_population", "role": "categories", "kind": "category", "field": "kind", "values": ["expense", "income", "neutral", "compensation"] },
    { "op": "economic_candidates", "role": "events", "kind": "event", "date_field": "date", "state_field": "state", "required_state": "confirmed", "reference_by_kind": { "card": "card_id" }, "category_field": "category_id", "compensation_field": "compensates", "eligible_class": "expense", "compensation_class": "compensation", "guards": "observe_all_before_filtering" },
    { "op": "contribution", "field": "amount_minor" }
  ]
}
```

## docs/contracts/next/provenance-v2/claim-contract.schema.json

SHA-256 b69ef61b562061f057a9bf08f47623ae432c723f565e8775f3dbe6eb942ea998; Git blob 40f4a97483a359d77ddf649a167ebc67b9b6286e; bytes 6124.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "urn:financasbot:next:claim-contract:2",
  "title": "N02-F internal authored claim contract (not runtime output or public envelope)",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "contract_id", "claims"],
  "properties": {
    "schema_version": {"const": 2},
    "contract_id": {"$ref": "#/definitions/id"},
    "claims": {"type": "array", "minItems": 1, "items": {"$ref": "#/definitions/claim"}}
  },
  "definitions": {
    "id": {"type": "string", "pattern": "^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},
    "alias": {"type": "string", "pattern": "^[a-z][a-z0-9_]{0,63}$"},
    "factKey": {"type": "string", "pattern": "^[SMFN]-[0-9]{2}#[1-9][0-9]*#[1-9][0-9]*$"},
    "date": {"type": "string", "pattern": "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$", "format": "date"},
    "month": {"type": "string", "pattern": "^[0-9]{4}-(0[1-9]|1[0-2])$"},
    "evaluatorRef": {
      "type": "object", "additionalProperties": false,
      "required": ["evaluator_id", "evaluator_version"],
      "properties": {"evaluator_id": {"$ref": "#/definitions/alias"}, "evaluator_version": {"type": "integer", "minimum": 1}}
    },
    "binding": {
      "oneOf": [
        {"type": "object", "additionalProperties": false, "required": ["kind"], "properties": {"kind": {"const": "claim_context"}}},
        {"type": "object", "additionalProperties": false, "required": ["kind", "alias"], "properties": {"kind": {"const": "node"}, "alias": {"$ref": "#/definitions/alias"}}},
        {"type": "object", "additionalProperties": false, "required": ["kind", "aliases"], "properties": {"kind": {"const": "node_set"}, "aliases": {"type": "array", "uniqueItems": true, "items": {"$ref": "#/definitions/alias"}}}},
        {"type": "object", "additionalProperties": false, "required": ["kind", "fact_key"], "properties": {"kind": {"const": "parent_claim"}, "fact_key": {"$ref": "#/definitions/factKey"}}}
      ]
    },
    "subject": {
      "oneOf": [
        {"type": "object", "additionalProperties": false, "required": ["kind", "person_ids"], "properties": {"kind": {"const": "person_comparison"}, "person_ids": {"type": "array", "minItems": 2, "maxItems": 2, "uniqueItems": true, "items": {"$ref": "#/definitions/id"}}}},
        {"type": "object", "additionalProperties": false, "required": ["kind", "ref_id"], "properties": {"kind": {"enum": ["family", "person", "account", "card", "category", "event", "transfer_pair", "installment_plan", "budget", "bill", "source", "merchant", "turn"]}, "ref_id": {"$ref": "#/definitions/id"}}},
        {"type": "object", "additionalProperties": false, "required": ["kind", "family_id", "category_id"], "properties": {"kind": {"const": "family_category"}, "family_id": {"$ref": "#/definitions/id"}, "category_id": {"$ref": "#/definitions/id"}}},
        {"type": "object", "additionalProperties": false, "required": ["kind", "person_id", "category_id"], "properties": {"kind": {"const": "person_category"}, "person_id": {"$ref": "#/definitions/id"}, "category_id": {"$ref": "#/definitions/id"}}},
        {"type": "object", "additionalProperties": false, "required": ["kind", "budget_id", "person_id"], "properties": {"kind": {"const": "budget_person"}, "budget_id": {"$ref": "#/definitions/id"}, "person_id": {"$ref": "#/definitions/id"}}}
      ]
    },
    "period": {
      "oneOf": [
        {"type": "object", "additionalProperties": false, "required": ["kind", "value"], "properties": {"kind": {"enum": ["date", "as_of", "through", "statement_due"]}, "value": {"$ref": "#/definitions/date"}}},
        {"type": "object", "additionalProperties": false, "required": ["kind", "value"], "properties": {"kind": {"enum": ["month", "statement_competence", "budget_cycle"]}, "value": {"$ref": "#/definitions/month"}}},
        {"type": "object", "additionalProperties": false, "required": ["kind", "start", "end", "start_inclusive", "end_inclusive"], "properties": {"kind": {"const": "range"}, "start": {"$ref": "#/definitions/date"}, "end": {"$ref": "#/definitions/date"}, "start_inclusive": {"type": "boolean"}, "end_inclusive": {"type": "boolean"}}},
        {"type": "object", "additionalProperties": false, "required": ["kind", "snapshot_version"], "properties": {"kind": {"const": "registry_snapshot"}, "snapshot_version": {"$ref": "#/definitions/id"}}},
        {"type": "object", "additionalProperties": false, "required": ["kind", "turn_id"], "properties": {"kind": {"const": "request_execution"}, "turn_id": {"type": "string", "pattern": "^[SMFN]-[0-9]{2}#[1-9][0-9]*$"}}}
      ]
    },
    "claim": {
      "type": "object", "additionalProperties": false,
      "required": ["claim_id", "fact_key", "metric", "unit", "subject", "period", "time_basis", "coverage", "evidence_state", "evaluator_ref", "operand_bindings"],
      "properties": {
        "claim_id": {"$ref": "#/definitions/id"},
        "fact_key": {"$ref": "#/definitions/factKey"},
        "metric": {"$ref": "#/definitions/alias"},
        "unit": {"enum": ["BRL_minor", "count", "entity_ids", "state"]},
        "subject": {"$ref": "#/definitions/subject"},
        "period": {"$ref": "#/definitions/period"},
        "time_basis": {"enum": ["event_date", "transaction_date", "billing_period", "budget_cycle", "due_date", "settlement_date", "installment_competence", "mixed_declared", "registry_current", "request_execution", "scheduled_at", "source_period", "statement_competence", "statement_due_date", "15_full_days_after_as_of"]},
        "coverage": {"enum": ["complete", "partial", "unavailable"]},
        "evidence_state": {"enum": ["confirmed", "projected", "estimated"]},
        "evaluator_ref": {"$ref": "#/definitions/evaluatorRef"},
        "operand_bindings": {"type": "object", "minProperties": 1, "propertyNames": {"$ref": "#/definitions/alias"}, "additionalProperties": {"$ref": "#/definitions/binding"}},
        "filters": {"type": "object", "additionalProperties": false, "required": ["budget_class"], "properties": {"budget_class": {"enum": ["essential", "flexible"]}}}
      }
    }
  }
}
```

## docs/contracts/next/provenance-v2/claims-v2.json

SHA-256 4810612761ea7f232e4445c0d192ae53ebf0761f0ba8752da758efb826b30494; Git blob 0f0ade4e0f174966ae9f2660df97cc0b29d2d775; bytes 64240.

```json
{
  "schema_version": 2,
  "contract_id": "NEXT-GOLDEN-CLAIMS-V2",
  "claims": [
    {"claim_id":"claim-S-01#1#1","fact_key":"S-01#1#1","metric":"consumption_total","unit":"BRL_minor","subject":{"kind":"family","ref_id":"family-example"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"consumption_total","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"family":{"kind":"node","alias":"family_example"}}},
    {"claim_id":"claim-S-02#1#1","fact_key":"S-02#1#1","metric":"consumption_total","unit":"BRL_minor","subject":{"kind":"person","ref_id":"person-a"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"consumption_total","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"family":{"kind":"node","alias":"family_example"}}},
    {"claim_id":"claim-S-03#1#1","fact_key":"S-03#1#1","metric":"category_consumption","unit":"BRL_minor","subject":{"kind":"family_category","family_id":"family-example","category_id":"food.market"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"category_consumption","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"family":{"kind":"node","alias":"family_example"}}},
    {"claim_id":"claim-S-04#1#1","fact_key":"S-04#1#1","metric":"movement_ids","unit":"entity_ids","subject":{"kind":"account","ref_id":"account-a"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"movement_ids","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"account":{"kind":"node","alias":"account_a"}}},
    {"claim_id":"claim-S-05#1#1","fact_key":"S-05#1#1","metric":"statement_total","unit":"BRL_minor","subject":{"kind":"card","ref_id":"card-blue"},"period":{"kind":"statement_due","value":"2042-06-17"},"time_basis":"statement_due_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"statement_total","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"card":{"kind":"node","alias":"card_blue"},"policy":{"kind":"node","alias":"evaluation_policy_v1"}}},
    {"claim_id":"claim-S-06#1#1","fact_key":"S-06#1#1","metric":"account_balance","unit":"BRL_minor","subject":{"kind":"account","ref_id":"account-a"},"period":{"kind":"as_of","value":"2042-06-14"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"account_balance","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"account":{"kind":"node","alias":"account_a"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]}}},
    {"claim_id":"claim-S-07#1#1","fact_key":"S-07#1#1","metric":"owned_cards","unit":"entity_ids","subject":{"kind":"person","ref_id":"person-a"},"period":{"kind":"as_of","value":"2042-06-15"},"time_basis":"registry_current","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"owned_cards","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"cards":{"kind":"node_set","aliases":["card_blue","card_green","card_offline"]},"person":{"kind":"node","alias":"person_a"}}},
    {"claim_id":"claim-S-08#1#1","fact_key":"S-08#1#1","metric":"consumption_effect","unit":"BRL_minor","subject":{"kind":"transfer_pair","ref_id":"transfer-01"},"period":{"kind":"date","value":"2042-06-12"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"consumption_effect","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_transfer_out","evt_transfer_in"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]}}},
    {"claim_id":"claim-S-09#1#1","fact_key":"S-09#1#1","metric":"consumption_effect","unit":"BRL_minor","subject":{"kind":"event","ref_id":"evt-invoice-payment"},"period":{"kind":"date","value":"2042-06-13"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"consumption_effect","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_invoice_payment"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]}}},
    {"claim_id":"claim-S-10#1#1","fact_key":"S-10#1#1","metric":"net_consumption","unit":"BRL_minor","subject":{"kind":"event","ref_id":"evt-restaurant-b"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"net_consumption","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_restaurant_b","evt_refund_b"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]}}},
    {"claim_id":"claim-S-11#1#1","fact_key":"S-11#1#1","metric":"installments_realized","unit":"count","subject":{"kind":"installment_plan","ref_id":"plan-01"},"period":{"kind":"through","value":"2042-06-15"},"time_basis":"installment_competence","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"installments_realized","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"plan":{"kind":"node","alias":"plan_01"}}},
    {"claim_id":"claim-S-11#1#2","fact_key":"S-11#1#2","metric":"installments_projected","unit":"count","subject":{"kind":"installment_plan","ref_id":"plan-01"},"period":{"kind":"range","start":"2042-07-01","end":"2042-08-31","start_inclusive":true,"end_inclusive":true},"time_basis":"installment_competence","coverage":"complete","evidence_state":"projected","evaluator_ref":{"evaluator_id":"installments_projected","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"plan":{"kind":"node","alias":"plan_01"}}},
    {"claim_id":"claim-S-11#1#3","fact_key":"S-11#1#3","metric":"installments_projected_amount","unit":"BRL_minor","subject":{"kind":"installment_plan","ref_id":"plan-01"},"period":{"kind":"range","start":"2042-07-01","end":"2042-08-31","start_inclusive":true,"end_inclusive":true},"time_basis":"installment_competence","coverage":"complete","evidence_state":"projected","evaluator_ref":{"evaluator_id":"installments_projected_amount","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"plan":{"kind":"node","alias":"plan_01"}}},
    {"claim_id":"claim-S-12#1#1","fact_key":"S-12#1#1","metric":"account_balance","unit":"BRL_minor","subject":{"kind":"account","ref_id":"account-reserve"},"period":{"kind":"as_of","value":"2042-06-11"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"account_balance","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"account":{"kind":"node","alias":"account_reserve"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]}}},
    {"claim_id":"claim-S-13#1#1","fact_key":"S-13#1#1","metric":"eligible_event_count","unit":"count","subject":{"kind":"family_category","family_id":"family-example","category_id":"health.general"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"eligible_event_count","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"source":{"kind":"node","alias":"source_empty_health"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"family":{"kind":"node","alias":"family_example"}}},
    {"claim_id":"claim-S-16#1#1","fact_key":"S-16#1#1","metric":"source_coverage","unit":"state","subject":{"kind":"source","ref_id":"source-complete-june"},"period":{"kind":"month","value":"2042-06"},"time_basis":"source_period","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"source_coverage","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"source":{"kind":"node","alias":"source_complete_june"}}},
    {"claim_id":"claim-M-01#1#1","fact_key":"M-01#1#1","metric":"consumption_total","unit":"BRL_minor","subject":{"kind":"person","ref_id":"person-a"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"consumption_total","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"family":{"kind":"node","alias":"family_example"}}},
    {"claim_id":"claim-M-01#1#2","fact_key":"M-01#1#2","metric":"consumption_total","unit":"BRL_minor","subject":{"kind":"person","ref_id":"person-b"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"consumption_total","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"family":{"kind":"node","alias":"family_example"}}},
    {"claim_id":"claim-M-01#1#3","fact_key":"M-01#1#3","metric":"ranking_winner","unit":"entity_ids","subject":{"kind":"family","ref_id":"family-example"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"ranking_winner","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"left":{"kind":"parent_claim","fact_key":"M-01#1#1"},"right":{"kind":"parent_claim","fact_key":"M-01#1#2"},"people":{"kind":"node_set","aliases":["person_a","person_b"]},"sort_key":{"kind":"node","alias":"evaluation_policy_v1"},"sort_direction":{"kind":"node","alias":"evaluation_policy_v1"}}},
    {"claim_id":"claim-M-01#1#4","fact_key":"M-01#1#4","metric":"consumption_difference","unit":"BRL_minor","subject":{"kind":"person_comparison","person_ids":["person-a","person-b"]},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"consumption_difference","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"left":{"kind":"parent_claim","fact_key":"M-01#1#1"},"right":{"kind":"parent_claim","fact_key":"M-01#1#2"}}},
    {"claim_id":"claim-M-02#1#1","fact_key":"M-02#1#1","metric":"consumption_by_instrument","unit":"BRL_minor","subject":{"kind":"account","ref_id":"account-a"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"consumption_by_instrument","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"instrument":{"kind":"node","alias":"account_a"}}},
    {"claim_id":"claim-M-02#1#2","fact_key":"M-02#1#2","metric":"consumption_by_instrument","unit":"BRL_minor","subject":{"kind":"card","ref_id":"card-blue"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"consumption_by_instrument","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"instrument":{"kind":"node","alias":"card_blue"}}},
    {"claim_id":"claim-M-03#1#1","fact_key":"M-03#1#1","metric":"budget_class_consumption","unit":"BRL_minor","subject":{"kind":"family","ref_id":"family-example"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"budget_class_consumption","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"family":{"kind":"node","alias":"family_example"}},"filters":{"budget_class":"flexible"}},
    {"claim_id":"claim-M-03#1#2","fact_key":"M-03#1#2","metric":"budget_class_consumption","unit":"BRL_minor","subject":{"kind":"family","ref_id":"family-example"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"budget_class_consumption","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"family":{"kind":"node","alias":"family_example"}},"filters":{"budget_class":"essential"}},
    {"claim_id":"claim-M-04#1#1","fact_key":"M-04#1#1","metric":"balance_delta","unit":"BRL_minor","subject":{"kind":"account","ref_id":"account-a"},"period":{"kind":"date","value":"2042-06-12"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"balance_delta","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"event":{"kind":"node","alias":"evt_transfer_out"}}},
    {"claim_id":"claim-M-04#1#2","fact_key":"M-04#1#2","metric":"balance_delta","unit":"BRL_minor","subject":{"kind":"account","ref_id":"account-reserve"},"period":{"kind":"date","value":"2042-06-12"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"balance_delta","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"event":{"kind":"node","alias":"evt_transfer_in"}}},
    {"claim_id":"claim-M-04#1#3","fact_key":"M-04#1#3","metric":"consumption_effect","unit":"BRL_minor","subject":{"kind":"transfer_pair","ref_id":"transfer-01"},"period":{"kind":"date","value":"2042-06-12"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"consumption_effect","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_transfer_out","evt_transfer_in"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]}}},
    {"claim_id":"claim-M-05#1#1","fact_key":"M-05#1#1","metric":"statement_total","unit":"BRL_minor","subject":{"kind":"card","ref_id":"card-blue"},"period":{"kind":"statement_due","value":"2042-06-17"},"time_basis":"statement_due_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"statement_total","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"card":{"kind":"node","alias":"card_blue"},"policy":{"kind":"node","alias":"evaluation_policy_v1"}}},
    {"claim_id":"claim-M-05#1#2","fact_key":"M-05#1#2","metric":"invoice_payment_amount","unit":"BRL_minor","subject":{"kind":"event","ref_id":"evt-invoice-payment"},"period":{"kind":"date","value":"2042-06-13"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"invoice_payment_amount","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"event":{"kind":"node","alias":"evt_invoice_payment"}}},
    {"claim_id":"claim-M-05#1#3","fact_key":"M-05#1#3","metric":"invoice_payment_target_card","unit":"entity_ids","subject":{"kind":"event","ref_id":"evt-invoice-payment"},"period":{"kind":"date","value":"2042-06-13"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"invoice_payment_target_card","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"event":{"kind":"node","alias":"evt_invoice_payment"},"card":{"kind":"node","alias":"card_blue"}}},
    {"claim_id":"claim-M-05#1#4","fact_key":"M-05#1#4","metric":"statement_payment_correspondence","unit":"state","subject":{"kind":"event","ref_id":"evt-invoice-payment"},"period":{"kind":"date","value":"2042-06-13"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"statement_payment_correspondence","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"event":{"kind":"node","alias":"evt_invoice_payment"},"card":{"kind":"node","alias":"card_blue"}}},
    {"claim_id":"claim-M-05#1#5","fact_key":"M-05#1#5","metric":"invoice_payment_consumption_effect","unit":"BRL_minor","subject":{"kind":"event","ref_id":"evt-invoice-payment"},"period":{"kind":"date","value":"2042-06-13"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"invoice_payment_consumption_effect","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_invoice_payment"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]}}},
    {"claim_id":"claim-M-06#1#1","fact_key":"M-06#1#1","metric":"gross_consumption","unit":"BRL_minor","subject":{"kind":"person_category","person_id":"person-b","category_id":"food.restaurant"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"gross_consumption","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_restaurant_b"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]}}},
    {"claim_id":"claim-M-06#1#2","fact_key":"M-06#1#2","metric":"refund_amount","unit":"BRL_minor","subject":{"kind":"event","ref_id":"evt-refund-b"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"refund_amount","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_refund_b"]}}},
    {"claim_id":"claim-M-06#1#3","fact_key":"M-06#1#3","metric":"net_consumption","unit":"BRL_minor","subject":{"kind":"person_category","person_id":"person-b","category_id":"food.restaurant"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"net_consumption","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_restaurant_b","evt_refund_b"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]}}},
    {"claim_id":"claim-M-07#1#1","fact_key":"M-07#1#1","metric":"consumption_total","unit":"BRL_minor","subject":{"kind":"family","ref_id":"family-example"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"consumption_total","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"family":{"kind":"node","alias":"family_example"}}},
    {"claim_id":"claim-M-07#1#2","fact_key":"M-07#1#2","metric":"projected_installments","unit":"BRL_minor","subject":{"kind":"family","ref_id":"family-example"},"period":{"kind":"range","start":"2042-07-01","end":"2042-08-31","start_inclusive":true,"end_inclusive":true},"time_basis":"installment_competence","coverage":"complete","evidence_state":"projected","evaluator_ref":{"evaluator_id":"projected_installments","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"plans":{"kind":"node_set","aliases":["plan_01"]},"family":{"kind":"node","alias":"family_example"}}},
    {"claim_id":"claim-M-08#1#1","fact_key":"M-08#1#1","metric":"category_spent","unit":"BRL_minor","subject":{"kind":"person_category","person_id":"person-b","category_id":"food.snack"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"category_spent","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"family":{"kind":"node","alias":"family_example"}}},
    {"claim_id":"claim-M-08#1#2","fact_key":"M-08#1#2","metric":"category_budget_remaining","unit":"BRL_minor","subject":{"kind":"budget_person","budget_id":"budget-snack","person_id":"person-b"},"period":{"kind":"month","value":"2042-06"},"time_basis":"budget_cycle","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"category_budget_remaining","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"budget":{"kind":"node","alias":"budget_snack"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"family":{"kind":"node","alias":"family_example"}}},
    {"claim_id":"claim-M-09#1#1","fact_key":"M-09#1#1","metric":"eligible_event_count","unit":"count","subject":{"kind":"family_category","family_id":"family-example","category_id":"health.general"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"eligible_event_count","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"source":{"kind":"node","alias":"source_empty_health"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"family":{"kind":"node","alias":"family_example"}}},
    {"claim_id":"claim-M-12#1#1","fact_key":"M-12#1#1","metric":"consumption_total","unit":"BRL_minor","subject":{"kind":"family","ref_id":"family-example"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"consumption_total","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"family":{"kind":"node","alias":"family_example"}}},
    {"claim_id":"claim-M-13#1#1","fact_key":"M-13#1#1","metric":"category_spent","unit":"BRL_minor","subject":{"kind":"category","ref_id":"food.snack"},"period":{"kind":"month","value":"2042-06"},"time_basis":"budget_cycle","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"category_spent","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"family":{"kind":"node","alias":"family_example"}}},
    {"claim_id":"claim-M-13#1#2","fact_key":"M-13#1#2","metric":"category_budget_remaining","unit":"BRL_minor","subject":{"kind":"budget","ref_id":"budget-snack"},"period":{"kind":"month","value":"2042-06"},"time_basis":"budget_cycle","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"category_budget_remaining","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"budget":{"kind":"node","alias":"budget_snack"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"family":{"kind":"node","alias":"family_example"}}},
    {"claim_id":"claim-M-13#1#3","fact_key":"M-13#1#3","metric":"safe_daily_pace","unit":"BRL_minor","subject":{"kind":"budget","ref_id":"budget-snack"},"period":{"kind":"range","start":"2042-06-16","end":"2042-06-30","start_inclusive":true,"end_inclusive":true},"time_basis":"15_full_days_after_as_of","coverage":"complete","evidence_state":"estimated","evaluator_ref":{"evaluator_id":"safe_daily_pace","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"budget":{"kind":"node","alias":"budget_snack"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"clock":{"kind":"node","alias":"next_golden_financial_v1"},"policy":{"kind":"node","alias":"evaluation_policy_v1"}}},
    {"claim_id":"claim-M-13#1#4","fact_key":"M-13#1#4","metric":"category_spent","unit":"BRL_minor","subject":{"kind":"category","ref_id":"leisure.cinema"},"period":{"kind":"month","value":"2042-06"},"time_basis":"budget_cycle","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"category_spent","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"family":{"kind":"node","alias":"family_example"}}},
    {"claim_id":"claim-M-13#1#5","fact_key":"M-13#1#5","metric":"category_budget_remaining","unit":"BRL_minor","subject":{"kind":"budget","ref_id":"budget-leisure"},"period":{"kind":"month","value":"2042-06"},"time_basis":"budget_cycle","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"category_budget_remaining","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"budget":{"kind":"node","alias":"budget_leisure"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"family":{"kind":"node","alias":"family_example"}}},
    {"claim_id":"claim-M-13#1#6","fact_key":"M-13#1#6","metric":"safe_daily_pace","unit":"BRL_minor","subject":{"kind":"budget","ref_id":"budget-leisure"},"period":{"kind":"range","start":"2042-06-16","end":"2042-06-30","start_inclusive":true,"end_inclusive":true},"time_basis":"15_full_days_after_as_of","coverage":"complete","evidence_state":"estimated","evaluator_ref":{"evaluator_id":"safe_daily_pace","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"budget":{"kind":"node","alias":"budget_leisure"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"clock":{"kind":"node","alias":"next_golden_financial_v1"},"policy":{"kind":"node","alias":"evaluation_policy_v1"}}},
    {"claim_id":"claim-M-14#1#1","fact_key":"M-14#1#1","metric":"income_realized","unit":"BRL_minor","subject":{"kind":"family","ref_id":"family-example"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"income_realized","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"family":{"kind":"node","alias":"family_example"}}},
    {"claim_id":"claim-M-14#1#2","fact_key":"M-14#1#2","metric":"bills_open","unit":"BRL_minor","subject":{"kind":"family","ref_id":"family-example"},"period":{"kind":"month","value":"2042-06"},"time_basis":"due_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"bills_open","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"bills":{"kind":"node_set","aliases":["bill_rent_b"]},"family":{"kind":"node","alias":"family_example"}}},
    {"claim_id":"claim-M-14#1#3","fact_key":"M-14#1#3","metric":"income_minus_open_bills","unit":"BRL_minor","subject":{"kind":"family","ref_id":"family-example"},"period":{"kind":"month","value":"2042-06"},"time_basis":"mixed_declared","coverage":"complete","evidence_state":"estimated","evaluator_ref":{"evaluator_id":"income_minus_open_bills","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"left":{"kind":"parent_claim","fact_key":"M-14#1#1"},"right":{"kind":"parent_claim","fact_key":"M-14#1#2"}}},
    {"claim_id":"claim-M-15#1#1","fact_key":"M-15#1#1","metric":"due_bill_ids","unit":"entity_ids","subject":{"kind":"person","ref_id":"person-b"},"period":{"kind":"range","start":"2042-06-15","end":"2042-06-30","start_inclusive":true,"end_inclusive":true},"time_basis":"due_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"due_bill_ids","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"bills":{"kind":"node_set","aliases":["bill_rent_b"]},"person":{"kind":"node","alias":"person_b"}}},
    {"claim_id":"claim-M-15#1#2","fact_key":"M-15#1#2","metric":"due_bills_total","unit":"BRL_minor","subject":{"kind":"person","ref_id":"person-b"},"period":{"kind":"range","start":"2042-06-15","end":"2042-06-30","start_inclusive":true,"end_inclusive":true},"time_basis":"due_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"due_bills_total","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"bills":{"kind":"node_set","aliases":["bill_rent_b"]},"person":{"kind":"node","alias":"person_b"}}},
    {"claim_id":"claim-M-15#1#3","fact_key":"M-15#1#3","metric":"reminder_count","unit":"count","subject":{"kind":"person","ref_id":"person-b"},"period":{"kind":"range","start":"2042-06-15","end":"2042-06-30","start_inclusive":true,"end_inclusive":true},"time_basis":"scheduled_at","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"reminder_count","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"entries":{"kind":"node_set","aliases":[]},"collection":{"kind":"node","alias":"collection_reminders"},"person":{"kind":"node","alias":"person_b"}}},
    {"claim_id":"claim-M-15#1#4","fact_key":"M-15#1#4","metric":"calendar_event_count","unit":"count","subject":{"kind":"person","ref_id":"person-b"},"period":{"kind":"range","start":"2042-06-15","end":"2042-06-30","start_inclusive":true,"end_inclusive":true},"time_basis":"scheduled_at","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"calendar_event_count","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"entries":{"kind":"node_set","aliases":[]},"collection":{"kind":"node","alias":"collection_calendar_events"},"person":{"kind":"node","alias":"person_b"}}},
    {"claim_id":"claim-M-16#1#1","fact_key":"M-16#1#1","metric":"merchant_rule_ids","unit":"entity_ids","subject":{"kind":"merchant","ref_id":"merchant-market-example"},"period":{"kind":"as_of","value":"2042-06-15"},"time_basis":"registry_current","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"merchant_rule_ids","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"rules":{"kind":"node_set","aliases":["rule_market_example"]},"merchant":{"kind":"node","alias":"merchant_market_example"}}},
    {"claim_id":"claim-M-16#1#2","fact_key":"M-16#1#2","metric":"similar_event_ids","unit":"entity_ids","subject":{"kind":"merchant","ref_id":"merchant-market-example"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"similar_event_ids","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"merchant":{"kind":"node","alias":"merchant_market_example"}}},
    {"claim_id":"claim-M-16#1#3","fact_key":"M-16#1#3","metric":"side_effect_count","unit":"count","subject":{"kind":"turn","ref_id":"M-16#1"},"period":{"kind":"as_of","value":"2042-06-15"},"time_basis":"request_execution","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"side_effect_count","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"entries":{"kind":"node_set","aliases":[]},"collection":{"kind":"node","alias":"collection_side_effects"},"turn":{"kind":"node","alias":"m_16_1"}}},
    {"claim_id":"claim-F-01#1#1","fact_key":"F-01#1#1","metric":"category_consumption","unit":"BRL_minor","subject":{"kind":"person_category","person_id":"person-a","category_id":"food.snack"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"category_consumption","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"family":{"kind":"node","alias":"family_example"}}},
    {"claim_id":"claim-F-01#2#1","fact_key":"F-01#2#1","metric":"category_consumption","unit":"BRL_minor","subject":{"kind":"person_category","person_id":"person-b","category_id":"food.snack"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"category_consumption","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"family":{"kind":"node","alias":"family_example"}}},
    {"claim_id":"claim-F-02#1#1","fact_key":"F-02#1#1","metric":"consumption_total","unit":"BRL_minor","subject":{"kind":"person","ref_id":"person-a"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"consumption_total","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"family":{"kind":"node","alias":"family_example"}}},
    {"claim_id":"claim-F-03#1#1","fact_key":"F-03#1#1","metric":"consumption_by_instrument","unit":"BRL_minor","subject":{"kind":"account","ref_id":"account-a"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"consumption_by_instrument","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"instrument":{"kind":"node","alias":"account_a"}}},
    {"claim_id":"claim-F-03#2#1","fact_key":"F-03#2#1","metric":"statement_total","unit":"BRL_minor","subject":{"kind":"card","ref_id":"card-blue"},"period":{"kind":"statement_due","value":"2042-06-17"},"time_basis":"statement_competence","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"statement_total","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"card":{"kind":"node","alias":"card_blue"},"policy":{"kind":"node","alias":"evaluation_policy_v1"}}},
    {"claim_id":"claim-F-04#1#1","fact_key":"F-04#1#1","metric":"category_consumption","unit":"BRL_minor","subject":{"kind":"person_category","person_id":"person-a","category_id":"food.snack"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"category_consumption","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"family":{"kind":"node","alias":"family_example"}}},
    {"claim_id":"claim-F-04#2#1","fact_key":"F-04#2#1","metric":"category_budget_remaining","unit":"BRL_minor","subject":{"kind":"budget","ref_id":"budget-snack"},"period":{"kind":"month","value":"2042-06"},"time_basis":"budget_cycle","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"category_budget_remaining","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"budget":{"kind":"node","alias":"budget_snack"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"family":{"kind":"node","alias":"family_example"}}},
    {"claim_id":"claim-F-05#1#1","fact_key":"F-05#1#1","metric":"category_consumption","unit":"BRL_minor","subject":{"kind":"person_category","person_id":"person-a","category_id":"food.market"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"category_consumption","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"family":{"kind":"node","alias":"family_example"}}},
    {"claim_id":"claim-F-05#2#1","fact_key":"F-05#2#1","metric":"category_consumption","unit":"BRL_minor","subject":{"kind":"family_category","family_id":"family-example","category_id":"food.market"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"category_consumption","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"family":{"kind":"node","alias":"family_example"}}},
    {"claim_id":"claim-F-06#1#1","fact_key":"F-06#1#1","metric":"gross_consumption","unit":"BRL_minor","subject":{"kind":"event","ref_id":"evt-restaurant-b"},"period":{"kind":"date","value":"2042-06-07"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"gross_consumption","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_restaurant_b"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]}}},
    {"claim_id":"claim-F-06#2#1","fact_key":"F-06#2#1","metric":"refund_amount","unit":"BRL_minor","subject":{"kind":"event","ref_id":"evt-refund-b"},"period":{"kind":"date","value":"2042-06-09"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"refund_amount","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_refund_b"]}}},
    {"claim_id":"claim-F-06#2#2","fact_key":"F-06#2#2","metric":"net_consumption","unit":"BRL_minor","subject":{"kind":"event","ref_id":"evt-restaurant-b"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"net_consumption","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_restaurant_b","evt_refund_b"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]}}},
    {"claim_id":"claim-F-07#1#1","fact_key":"F-07#1#1","metric":"installments_realized","unit":"count","subject":{"kind":"installment_plan","ref_id":"plan-01"},"period":{"kind":"through","value":"2042-06-15"},"time_basis":"installment_competence","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"installments_realized","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"plan":{"kind":"node","alias":"plan_01"}}},
    {"claim_id":"claim-F-07#1#2","fact_key":"F-07#1#2","metric":"installments_realized_amount","unit":"BRL_minor","subject":{"kind":"installment_plan","ref_id":"plan-01"},"period":{"kind":"through","value":"2042-06-15"},"time_basis":"installment_competence","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"installments_realized_amount","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"plan":{"kind":"node","alias":"plan_01"}}},
    {"claim_id":"claim-F-07#2#1","fact_key":"F-07#2#1","metric":"installments_projected","unit":"count","subject":{"kind":"installment_plan","ref_id":"plan-01"},"period":{"kind":"range","start":"2042-07-01","end":"2042-08-31","start_inclusive":true,"end_inclusive":true},"time_basis":"installment_competence","coverage":"complete","evidence_state":"projected","evaluator_ref":{"evaluator_id":"installments_projected","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"plan":{"kind":"node","alias":"plan_01"}}},
    {"claim_id":"claim-F-07#2#2","fact_key":"F-07#2#2","metric":"installments_projected_amount","unit":"BRL_minor","subject":{"kind":"installment_plan","ref_id":"plan-01"},"period":{"kind":"range","start":"2042-07-01","end":"2042-08-31","start_inclusive":true,"end_inclusive":true},"time_basis":"installment_competence","coverage":"complete","evidence_state":"projected","evaluator_ref":{"evaluator_id":"installments_projected_amount","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"plan":{"kind":"node","alias":"plan_01"}}},
    {"claim_id":"claim-N-04#1#1","fact_key":"N-04#1#1","metric":"eligible_event_count","unit":"count","subject":{"kind":"family_category","family_id":"family-example","category_id":"health.general"},"period":{"kind":"month","value":"2042-06"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"eligible_event_count","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"source":{"kind":"node","alias":"source_empty_health"},"events":{"kind":"node_set","aliases":["evt_salary_a","evt_market_a","evt_snack_a","evt_fuel_a","evt_restaurant_b","evt_refund_b","evt_cinema_b","evt_gift_b","evt_transfer_out","evt_transfer_in","evt_invoice_payment","evt_rent_a","evt_installment_1","evt_installment_2","evt_installment_3","evt_bill_projected"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]},"family":{"kind":"node","alias":"family_example"}}},
    {"claim_id":"claim-N-07#1#1","fact_key":"N-07#1#1","metric":"consumption_effect","unit":"BRL_minor","subject":{"kind":"transfer_pair","ref_id":"transfer-01"},"period":{"kind":"date","value":"2042-06-12"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"consumption_effect","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_transfer_out","evt_transfer_in"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]}}},
    {"claim_id":"claim-N-08#1#1","fact_key":"N-08#1#1","metric":"invoice_payment_consumption_effect","unit":"BRL_minor","subject":{"kind":"event","ref_id":"evt-invoice-payment"},"period":{"kind":"date","value":"2042-06-13"},"time_basis":"event_date","coverage":"complete","evidence_state":"confirmed","evaluator_ref":{"evaluator_id":"invoice_payment_consumption_effect","evaluator_version":1},"operand_bindings":{"context":{"kind":"claim_context"},"events":{"kind":"node_set","aliases":["evt_invoice_payment"]},"categories":{"kind":"node_set","aliases":["food_snack","food_market","food_restaurant","transport_fuel","housing_rent","leisure_cinema","gifts","income_salary","neutral_transfer","neutral_invoice_payment","neutral_refund","health_general"]}}}
  ]
}
```

## docs/contracts/next/provenance-v2/evaluation-policy-v1.json

SHA-256 4b6ee6a6fb365aa97a22a087de032e998dbb31ffd929d3ea2b094544f28f40dd; Git blob 9badd708f58db8eec8fb959d7e434d4687dab924; bytes 454.

```json
{
  "policy_id": "evaluation-policy-v1",
  "schema_version": 1,
  "stage": "authoring",
  "calendar": "proleptic_gregorian",
  "timezone": "America/Sao_Paulo",
  "ranking_key": "validated_consumption_minor",
  "ranking_direction": "desc",
  "ranking_tie_break": "lexical_internal_id",
  "daily_pace_divisor": 15,
  "daily_pace_rounding": "floor",
  "daily_pace_start": "2042-06-16",
  "daily_pace_end": "2042-06-30",
  "daily_pace_as_of": "2042-06-15"
}
```

## docs/contracts/next/provenance-v2/evaluator-authoring-semantics-v1.md

SHA-256 720e31b2a8a7c0490adf620a8ccaedbe54e06d0502e518e61c8c69252a006a7f; Git blob e3dcbe95fc8d0ed2cbbaa788024d842cf77f8d7f; bytes 4875.

```markdown
# Contratos funcionais e bindings — autoria N02-F

Estado: RASCUNHO; nenhum evaluator implementado ou aprovado por este pacote.

## Autoridade e reuso

As 39 entradas de metric-evaluator-registry-v1.json resolvem os contratos
funcionais existentes, seus hashes medidos e os roles normativos. Todos os
artefatos executáveis permanecem not_built. Os contratos referem o comportamento
de derive no validador v1 como fonte de revisão; não autorizam importar esse
validador no runtime nem chamá-lo como evaluator instrumentado.

Cada contrato descreve a fórmula em prosa revisável e propriedades algébricas.
Essas strings não são interpretadas como código. A implementação futura deve
reaproveitar kernel/read-model/canonicalValue quando semanticamente equivalentes
e preservar as diferenças históricas explicitadas nos contratos. O graph
evaluator não recebe branches por nome de métrica ou uma segunda fórmula.

## Entradas explícitas

context é uma referência de role definida pelo registry e ligada ao handle do
claim atual. Esse handle possui a revisão do claim contract, não é objeto cru.
Suas leituras são incluídas em required_claim_reads de cada fase. Isso fecha a
dependência de sujeito/período/filtros sem permitir contexto global implícito.

Os demais roles são referências a snapshots, conjuntos ordenados explicitamente
enumerados ou resultados de pais validados. A enumeração de população permite
examinar candidatos descartados; o grafo precisa provar separadamente seleção,
escopo e completude. Não se equipara população de entrada ao conjunto financeiro
selecionado. O registry não recebe o resultado esperado do oracle.

Na correção de autoria, selection.input_evidence_state explicita o estado
funcional dos dois safe_daily_pace. Guards usam confirmed; claim.evidence_state
continua estimated. required_nodes inclui examinados e operandos diretos;
selected_nodes depende das operações em required_selections, conforme
temporal-relations-decision-v1.md.

Na correção N02G-SB-001, a atribuição de seleção às fases é regida pelo §4 de
graph-binding-contract-v1.md: node_set candidato exige seleção derivacional;
operandos node previamente ligados são consumidos sem simular seleção nessa
fase. Proof continua examinando e selecionando os candidatos, inclusive os
excluídos. Nenhum role, fórmula ou valor esperado muda por essa distinção.

A política evaluation-policy-v1.json registra calendário, timezone, critério e
direção de ranking, desempate e parâmetros do ritmo diário. O snapshot policy
é medido sobre esses bytes e seus campos materiais entram no fingerprint.
Modificar uma configuração comportamental altera a revisão da política e exige
novo freeze/revisão. Na futura execução, esses bytes também devem ser incluídos
no closure comportamental correspondente, conforme NEXT-00; sua representação
como operando instrumentado não os isenta dessa exigência.

## Normalização dos claims

claims-v2.json foi autorado a partir do contrato de fatos e confrontado com os
diálogos do corpus. Não contém valores do oracle. A grammar admite as famílias
S/M/F/N e o gate de autoria exige igualdade dos 76 fact_keys.

Períodos de mês são tipados como month. Intervalos julho..agosto viram limites
civis inclusivos julho-01..agosto-31; isso preserva a abrangência e não converte
lente financeira. statement_due, as_of e through conservam tipos distintos.
A lente statement_competence do follow-up conserva a representação histórica
statement_due do contrato revisado, com justificação explícita no grafo.

person_comparison lista as duas pessoas sem redefinir o papel aritmético dos
operandos: left/right continuam no registry e nos bindings dos pais. O sujeito
da comparação não fica codificado em person-a-minus-person-b. Filtros de classe
orçamentária são campos próprios. budget_person preserva a condição revisada
de membro do orçamento familiar, inclusive o caso de consumo individual zero.

## Witnesses e limite de evidência

evaluator-witness-contracts-v1.json fornece 39 contratos discriminantes fora
do Golden Set, como 3-5=-2, floor(16/15)=1 e inclusão/exclusão nos fechamentos.
São descrições de casos sintéticos, ainda não fixtures de execução nem testes
passados. Sua materialização precisa de operandos schema-valid e isolamento
dos átomos pertinentes; falha de realização produz UNSATISFIED_MUTATION_WITNESS.
Esses exemplos não substituem a geração integral por nós/campos/arestas/reads.

Checks locais de 2026-09-10: os 76 claims satisfazem o schema e o conjunto/tipo
exato dos roles; 39 entradas de registry e 39 contratos satisfazem seus schemas.
Esses checks não demonstram semântica de seleção, leitura efetiva, closure ou
resultado. Ainda é necessária autoria/revisão dos 76 grafos e auditoria integral.
```

## docs/contracts/next/provenance-v2/evaluator-contract.schema.json

SHA-256 2c3bc0a86bf45da2c4466118bb6ad9506f1824a209c419c3c7180718e294a183; Git blob dd6b397e6e7199e0c0f9b1a3e605ce5b4bfa17d7; bytes 2668.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version",
    "contract_id",
    "metric",
    "unit",
    "stage",
    "signature",
    "semantics",
    "algebraic_properties",
    "reuse",
    "limitations"
  ],
  "properties": {
    "schema_version": {
      "const": 1
    },
    "contract_id": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_]*$"
    },
    "metric": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_]*$"
    },
    "unit": {
      "enum": [
        "BRL_minor",
        "count",
        "entity_ids",
        "state"
      ]
    },
    "stage": {
      "const": "authoring"
    },
    "signature": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "context",
        "operands",
        "output"
      ],
      "properties": {
        "context": {
          "const": "explicit_versioned_instrumented_claim"
        },
        "operands": {
          "const": "resolve_roles_from_metric_evaluator_registry"
        },
        "output": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "kind"
          ],
          "properties": {
            "kind": {
              "enum": [
                "money_minor",
                "nonnegative_integer",
                "id",
                "id_set",
                "enum"
              ]
            },
            "enum_values": {
              "type": "array",
              "uniqueItems": true,
              "items": {
                "type": "string"
              }
            }
          }
        }
      }
    },
    "semantics": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "string",
        "minLength": 1
      }
    },
    "algebraic_properties": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "string",
        "minLength": 1
      }
    },
    "reuse": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "path",
        "locator",
        "status"
      ],
      "properties": {
        "path": {
          "type": "string",
          "minLength": 1
        },
        "locator": {
          "type": "string",
          "minLength": 1
        },
        "status": {
          "const": "behavior_reference_requires_instrumented_adaptation"
        }
      }
    },
    "limitations": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "string",
        "minLength": 1
      }
    }
  },
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "urn:financasbot:next:evaluator-contract:1"
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/account_balance.json

SHA-256 b509b72bf341c36f60cc7fda7030602a0fdfcc1dae24a0687cb899d4b15a35ed; Git blob 572146a995cae9231ceb7a2f14abc73b69801d00; bytes 1539.

```json
{
  "schema_version": 1,
  "contract_id": "account_balance_v1",
  "metric": "account_balance",
  "unit": "BRL_minor",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "money_minor"
    }
  },
  "semantics": [
    "Somar opening_balance_minor da conta com amount_minor dos movimentos confirmed da mesma conta até as_of inclusive.",
    "opening_balance_as_of representa o saldo imediatamente antes dos movimentos desse dia civil. Selecionar eventos em [account.opening_balance_as_of, claim.period.value], ambos inclusivos, com início <= fim. O início referencia diretamente o campo da conta; o fim referencia diretamente o corte do claim. Não incluir movimento anterior ao saldo inicial."
  ],
  "algebraic_properties": [
    "Alterar saldo inicial por d altera resultado por d com movimentos fixos.",
    "Evento posterior ao corte não altera resultado."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.account_balance",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/balance_delta.json

SHA-256 39a1a87663a54e5d37c8e1a35f02596330d48b71e70a431fa27fe58193339a1e; Git blob da45c338a9f231539d029ecd02ac1d840a238110; bytes 1162.

```json
{
  "schema_version": 1,
  "contract_id": "balance_delta_v1",
  "metric": "balance_delta",
  "unit": "BRL_minor",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "money_minor"
    }
  },
  "semantics": [
    "Retornar amount_minor do movimento consultado após provar sua ligação à conta e data. Manter o sinal."
  ],
  "algebraic_properties": [
    "Uma contribuição elegível adicional altera o total pela contribuição definida; evento fora do escopo não altera resultado."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.balance_delta",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/bills_open.json

SHA-256 9fed67d44d48c3965043964769ce6481b876a793decf16901e7e666261593faf; Git blob 62a1808350a2c45c7f0ec08ca3edc498f9d1aac6; bytes 1164.

```json
{
  "schema_version": 1,
  "contract_id": "bills_open_v1",
  "metric": "bills_open",
  "unit": "BRL_minor",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "money_minor"
    }
  },
  "semantics": [
    "Somar amount_minor das contas a pagar open cujo due_date está no mês consultado e cuja pessoa pertence ao sujeito."
  ],
  "algebraic_properties": [
    "Uma contribuição elegível adicional altera o total pela contribuição definida; evento fora do escopo não altera resultado."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.bills_open",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/budget_class_consumption.json

SHA-256 e336d72e581c06401fd6ef3cc5b041b6c2b7ad56745fe25ff5980ca763ed8561; Git blob 3753c5a9e78172a34130efe7e7bbdc402a5dd1e3; bytes 1274.

```json
{
  "schema_version": 1,
  "contract_id": "budget_class_consumption_v1",
  "metric": "budget_class_consumption",
  "unit": "BRL_minor",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "money_minor"
    }
  },
  "semantics": [
    "Somar consumo confirmed do período e família quando a categoria efetiva tem budget_class igual ao filtro revisado essential/flexible. Compensation usa a categoria do alvo comprovado."
  ],
  "algebraic_properties": [
    "Uma contribuição elegível adicional altera o total pela contribuição definida; evento fora do escopo não altera resultado."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.budget_class_consumption",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/calendar_event_count.json

SHA-256 fa3f00c0a019ab0702f94b2c97f2e575509c308343d2208c992ac677e98097b8; Git blob 0164a5edf6f00714951194c32b1caf06a4fea559; bytes 1156.

```json
{
  "schema_version": 1,
  "contract_id": "calendar_event_count_v1",
  "metric": "calendar_event_count",
  "unit": "count",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "nonnegative_integer"
    }
  },
  "semantics": [
    "Contar eventos de agenda da pessoa com scheduled_at no intervalo inclusivo solicitado, mediante prova integral da coleção."
  ],
  "algebraic_properties": [
    "Adicionar um membro elegível aumenta a contagem em um; remover diminui em um."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.calendar_event_count",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/category_budget_remaining.json

SHA-256 4e4f9e38d7495397799578d1f73366d067ef5a5a7ca47879071dacd3669436c5; Git blob c046b51cb8fee63a8d028c951ae807e7197d0379; bytes 1485.

```json
{
  "schema_version": 1,
  "contract_id": "category_budget_remaining_v1",
  "metric": "category_budget_remaining",
  "unit": "BRL_minor",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "money_minor"
    }
  },
  "semantics": [
    "Subtrair consumo elegível da categoria no ciclo do limite familiar registrado. budget_person adicional prova membership; não transforma limite familiar em limite individual.",
    "O caso M-08 aplica o consumo da pessoa explicitamente consultada ao limite familiar, preservando a relação revisada no contrato v1; essa especialização deve ser declarada no binding, não deduzida de nome."
  ],
  "algebraic_properties": [
    "Uma contribuição elegível adicional altera o total pela contribuição definida; evento fora do escopo não altera resultado."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.category_budget_remaining",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/category_consumption.json

SHA-256 b6e8edf05cb8acc7155bea56d84c4827c4fa9c97b54cacdc13805602468564a3; Git blob 6746662dcdff8845579bfd512c5178273de88db0; bytes 1237.

```json
{
  "schema_version": 1,
  "contract_id": "category_consumption_v1",
  "metric": "category_consumption",
  "unit": "BRL_minor",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "money_minor"
    }
  },
  "semantics": [
    "Somar consumo confirmed no período e sujeito, somente na categoria solicitada. Compensation herda a categoria do evento compensado mediante aresta comprovada."
  ],
  "algebraic_properties": [
    "Uma contribuição elegível adicional altera o total pela contribuição definida; evento fora do escopo não altera resultado."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.category_consumption",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/category_spent.json

SHA-256 f168ac80d9ac17abf516e76729105c03a6efcf1743bdd4459e94f0c75f851baa; Git blob caf91b480f0b77daefe2b09ebf129ae7a1feb22a; bytes 1207.

```json
{
  "schema_version": 1,
  "contract_id": "category_spent_v1",
  "metric": "category_spent",
  "unit": "BRL_minor",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "money_minor"
    }
  },
  "semantics": [
    "Mesma definição funcional de category_consumption; preservar a lente event_date ou budget_cycle declarada e sua justificação temporal no grafo."
  ],
  "algebraic_properties": [
    "Uma contribuição elegível adicional altera o total pela contribuição definida; evento fora do escopo não altera resultado."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.category_spent",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/consumption_by_instrument.json

SHA-256 e32bc36ae9642c1db0d0eb6dce05c3861a80d967b974613eafc8fc6a341dbd37; Git blob 30d4a24f67f161a660d6bc73b2ebfd8dee74af34; bytes 1218.

```json
{
  "schema_version": 1,
  "contract_id": "consumption_by_instrument_v1",
  "metric": "consumption_by_instrument",
  "unit": "BRL_minor",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "money_minor"
    }
  },
  "semantics": [
    "Somar consumo confirmed no mês apenas quando account_id ou card_id resolve o instrumento consultado, cujo kind é conhecido."
  ],
  "algebraic_properties": [
    "Uma contribuição elegível adicional altera o total pela contribuição definida; evento fora do escopo não altera resultado."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.consumption_by_instrument",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/consumption_difference.json

SHA-256 f5d8eda523ba66305010fed07ca6c657b76c486774eac052c3151ddcc85546f7; Git blob dc5b5d588a869b54c49a5f05d9b735db0f78a64b; bytes 1159.

```json
{
  "schema_version": 1,
  "contract_id": "consumption_difference_v1",
  "metric": "consumption_difference",
  "unit": "BRL_minor",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "money_minor"
    }
  },
  "semantics": [
    "Subtrair o resultado validado associado ao role right do resultado associado ao role left. Manter sinal; não aplicar abs."
  ],
  "algebraic_properties": [
    "left=3 e right=5 deve produzir -2; abs ou troca de operandos não é equivalente."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.consumption_difference",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/consumption_effect.json

SHA-256 7dd62b47dcc336828376d44ed54c996f4ef21d27f9f21cfa142cd3722e24eab1; Git blob f292c713f2c6b45bd964cb41b6e1a0ec48f574bf; bytes 1248.

```json
{
  "schema_version": 1,
  "contract_id": "consumption_effect_v1",
  "metric": "consumption_effect",
  "unit": "BRL_minor",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "money_minor"
    }
  },
  "semantics": [
    "Somar consumo dos eventos explicitamente vinculados ao objeto consultado. A neutralidade precisa de categoria e vínculo econômico comprovados, não de sinal ou valor isolado."
  ],
  "algebraic_properties": [
    "Uma contribuição elegível adicional altera o total pela contribuição definida; evento fora do escopo não altera resultado."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.consumption_effect",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/consumption_total.json

SHA-256 4e07fd44f09a99168cd92d6a9caa664ef5c847146aae64905b859c4cf313be3a; Git blob 422dd8a4a1e69aa2dc55f59442a5d5de43af4901; bytes 1365.

```json
{
  "schema_version": 1,
  "contract_id": "consumption_total_v1",
  "metric": "consumption_total",
  "unit": "BRL_minor",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "money_minor"
    }
  },
  "semantics": [
    "Somar consumo dos eventos confirmed no mês do claim e no sujeito explicitamente resolvido. Família usa seus membros exatos; pessoa usa sua identidade.",
    "Consumo de categoria expense é -amount_minor; compensation exige evento compensado e usa -amount_minor; income/neutral contribuem zero."
  ],
  "algebraic_properties": [
    "Uma contribuição elegível adicional altera o total pela contribuição definida; evento fora do escopo não altera resultado."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.consumption_total",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/due_bill_ids.json

SHA-256 a9ddce797a0f90184dad2e3fd50cb20d6534648485ed9f27592cbfe03782ebf4; Git blob 35543a1574ec987d4fc66f87b79b0d0c87d35cb5; bytes 1162.

```json
{
  "schema_version": 1,
  "contract_id": "due_bill_ids_v1",
  "metric": "due_bill_ids",
  "unit": "entity_ids",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "id_set"
    }
  },
  "semantics": [
    "Retornar IDs das contas open da pessoa com due_date dentro do intervalo inclusivo solicitado, preservando a ordem da coleção revisada."
  ],
  "algebraic_properties": [
    "Adicionar membro elegível novo altera exatamente a lista por esse ID; membro fora do escopo não entra."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.due_bill_ids",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/due_bills_total.json

SHA-256 aaa1e469986731240f28f22ffe4559c4a663b13d2a01718f61e866c3e1f62e86; Git blob b50171a0e610b9230c981f47fc291d2954daf234; bytes 1143.

```json
{
  "schema_version": 1,
  "contract_id": "due_bills_total_v1",
  "metric": "due_bills_total",
  "unit": "BRL_minor",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "money_minor"
    }
  },
  "semantics": [
    "Somar amount_minor das contas open da pessoa no intervalo inclusivo de due_date."
  ],
  "algebraic_properties": [
    "Uma contribuição elegível adicional altera o total pela contribuição definida; evento fora do escopo não altera resultado."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.due_bills_total",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/eligible_event_count.json

SHA-256 f338fef9c95fa8ec005b95b6aa8b21069bb1c04f03ccc777d672bf5f161f4951; Git blob 902779bd88e5fd115e7a9f2ee6f32a3058d78c41; bytes 1884.

```json
{
  "schema_version": 1,
  "contract_id": "eligible_event_count_v1",
  "metric": "eligible_event_count",
  "unit": "count",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "nonnegative_integer"
    }
  },
  "semantics": [
    "Retornar event_count da fonte de contagem revisada somente após provar igualdade com a cardinalidade da seleção de eventos elegíveis por sujeito, categoria, estado e período.",
    "Ausência de event_count ou fonte parcial não pode ser convertida silenciosamente em zero.",
    "Retornar após provar refere-se ao resultado aceito pelo pipeline completo. D produz somente R tipado provisório sobre inputs admitidos; P comprova período e completude da fonte antes de aceitação, materialização, validated_parent ou resposta financeira.",
    "D preserva seleção funcional por sujeito, categoria, estado e período do contexto e compara event_count com sua cardinalidade. R provisório não é zero aceito nem receipt; P, identidade, fingerprints, seleção, traces e oracle positivo original continuam obrigatórios."
  ],
  "algebraic_properties": [
    "Fonte com zero e população elegível não vazia deve falhar a prova em vez de retornar zero aceito."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.eligible_event_count",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/gross_consumption.json

SHA-256 787b125062623e9ffaea8d248ef0554a93e23458275566390c88e88b5e3d00d6; Git blob a70c202573fcf81cc080057d818dc74e084e6194; bytes 1192.

```json
{
  "schema_version": 1,
  "contract_id": "gross_consumption_v1",
  "metric": "gross_consumption",
  "unit": "BRL_minor",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "money_minor"
    }
  },
  "semantics": [
    "Somar max(0, consumo(evento)) da compra ou população de despesas consultada. Não descontar estorno nesta grandeza bruta."
  ],
  "algebraic_properties": [
    "Uma contribuição elegível adicional altera o total pela contribuição definida; evento fora do escopo não altera resultado."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.gross_consumption",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/income_minus_open_bills.json

SHA-256 1d87b903b2e41e0bdfa4edc5ec1708c1e10e81dfa9cff30560dd5206b4637b86; Git blob 77966ed2476ce04160e53decd9b99abc1f23a903; bytes 1215.

```json
{
  "schema_version": 1,
  "contract_id": "income_minus_open_bills_v1",
  "metric": "income_minus_open_bills",
  "unit": "BRL_minor",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "money_minor"
    }
  },
  "semantics": [
    "Subtrair do resultado validado de renda realizada o resultado validado de contas open no período. Preservar mixed_declared e estimated; não apresentar como saldo bancário."
  ],
  "algebraic_properties": [
    "income=3 e bills=5 deve produzir -2; inverter sinal/operandos não é equivalente."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.income_minus_open_bills",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/income_realized.json

SHA-256 3098c37340e1c22e6137691c498c1e1b3756a8319f2187eb17fa0c16e8abedea; Git blob e9670929fbf385ffa02070c3e4ca13618477bc39; bytes 1155.

```json
{
  "schema_version": 1,
  "contract_id": "income_realized_v1",
  "metric": "income_realized",
  "unit": "BRL_minor",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "money_minor"
    }
  },
  "semantics": [
    "Somar amount_minor dos eventos confirmed de categoria income, no sujeito e mês consultados."
  ],
  "algebraic_properties": [
    "Uma contribuição elegível adicional altera o total pela contribuição definida; evento fora do escopo não altera resultado."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.income_realized",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/installments_projected.json

SHA-256 924d883d776a5f0da128ee931d96ff27aa1f9effa5ca86d3c81f21af35bf4988; Git blob 9d6c09b259b93012e1595b6e10ca99da1f9910e8; bytes 1171.

```json
{
  "schema_version": 1,
  "contract_id": "installments_projected_v1",
  "metric": "installments_projected",
  "unit": "count",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "nonnegative_integer"
    }
  },
  "semantics": [
    "Contar membros projected do plano revisado nas competências do intervalo consultado. Não contar a parcela confirmed como projetada."
  ],
  "algebraic_properties": [
    "Adicionar um membro elegível aumenta a contagem em um; remover diminui em um."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.installments_projected",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/installments_projected_amount.json

SHA-256 6cd3f810f260c6fa94b4509c1d8e043866accc8a0314446fde59d51b28763f0a; Git blob f389ec4eb81944b35bdd9db199189bdb1b8114fb; bytes 1209.

```json
{
  "schema_version": 1,
  "contract_id": "installments_projected_amount_v1",
  "metric": "installments_projected_amount",
  "unit": "BRL_minor",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "money_minor"
    }
  },
  "semantics": [
    "Somar -amount_minor das parcelas projected elegíveis do plano e intervalo de competências consultados."
  ],
  "algebraic_properties": [
    "Uma contribuição elegível adicional altera o total pela contribuição definida; evento fora do escopo não altera resultado."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.installments_projected_amount",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/installments_realized.json

SHA-256 0115cf8a9d922e43b6b393cecc521a9659a41f75b68591b579eed01490c5d3f7; Git blob 4887dc14746e92ac401e631476401c1080533b2e; bytes 1162.

```json
{
  "schema_version": 1,
  "contract_id": "installments_realized_v1",
  "metric": "installments_realized",
  "unit": "count",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "nonnegative_integer"
    }
  },
  "semantics": [
    "Contar membros confirmed do plano revisado no escopo through inclusivo; exigir número/total, plano, datas e sujeito coerentes."
  ],
  "algebraic_properties": [
    "Adicionar um membro elegível aumenta a contagem em um; remover diminui em um."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.installments_realized",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/installments_realized_amount.json

SHA-256 8987257b8976651b8e82c7e414fda6472ba5aa60ce58befaef3a5661956eb8a7; Git blob 7bb784b2102d84c60cfc7d1ba364383490b1f77c; bytes 1194.

```json
{
  "schema_version": 1,
  "contract_id": "installments_realized_amount_v1",
  "metric": "installments_realized_amount",
  "unit": "BRL_minor",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "money_minor"
    }
  },
  "semantics": [
    "Somar -amount_minor das parcelas confirmed elegíveis do plano e corte temporal consultados."
  ],
  "algebraic_properties": [
    "Uma contribuição elegível adicional altera o total pela contribuição definida; evento fora do escopo não altera resultado."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.installments_realized_amount",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/invoice_payment_amount.json

SHA-256 8b0b104d9d9623fc65847611532eb69810464f2869b5f9421557f07441562928; Git blob a5bba65f19a7af20f44a5f11395d261c42a73d40; bytes 1206.

```json
{
  "schema_version": 1,
  "contract_id": "invoice_payment_amount_v1",
  "metric": "invoice_payment_amount",
  "unit": "BRL_minor",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "money_minor"
    }
  },
  "semantics": [
    "Retornar magnitude de amount_minor do evento de pagamento consultado após validar categoria, conta e vínculo ao cartão."
  ],
  "algebraic_properties": [
    "Uma contribuição elegível adicional altera o total pela contribuição definida; evento fora do escopo não altera resultado."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.invoice_payment_amount",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/invoice_payment_consumption_effect.json

SHA-256 613b290689de669c2e5ab437fe12ce6f495bdfb766ed848d7716ea50f6b9c7c6; Git blob a6a97fb5599c4cb62ecc8261a4b83cff7c7ad3f5; bytes 1261.

```json
{
  "schema_version": 1,
  "contract_id": "invoice_payment_consumption_effect_v1",
  "metric": "invoice_payment_consumption_effect",
  "unit": "BRL_minor",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "money_minor"
    }
  },
  "semantics": [
    "Somar consumo dos pagamentos de fatura consultados; categoria neutral.invoice_payment e vínculo ao cartão devem ser provados separadamente."
  ],
  "algebraic_properties": [
    "Uma contribuição elegível adicional altera o total pela contribuição definida; evento fora do escopo não altera resultado."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.invoice_payment_consumption_effect",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/invoice_payment_target_card.json

SHA-256 a58d6ee1480662230142a532903facd36cbbe3b7f67705dc01345574a324acfa; Git blob a09d2605edf0729591c0ecb92f6247e199dde82f; bytes 1207.

```json
{
  "schema_version": 1,
  "contract_id": "invoice_payment_target_card_v1",
  "metric": "invoice_payment_target_card",
  "unit": "entity_ids",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "id"
    }
  },
  "semantics": [
    "Retornar ID do cartão resolvido por settles_card_id do pagamento consultado. Não inferir identidade da fatura a partir do cartão."
  ],
  "algebraic_properties": [
    "Alterar vínculo comprovado altera a identidade retornada; igualdade do texto de label não preserva identidade."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.invoice_payment_target_card",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/merchant_rule_ids.json

SHA-256 b3ec5d6c4003258cd25431a709197c37a1cf7f70e10125b2f0c8d15bba95abbe; Git blob a44b1ae89e4d47df8aad7aac54dd2afeaf2f8707; bytes 1179.

```json
{
  "schema_version": 1,
  "contract_id": "merchant_rule_ids_v1",
  "metric": "merchant_rule_ids",
  "unit": "entity_ids",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "id_set"
    }
  },
  "semantics": [
    "Retornar IDs das regras que referenciam exatamente merchant_key consultada na revisão de registry indicada; preservar ordem da coleção."
  ],
  "algebraic_properties": [
    "Adicionar membro elegível novo altera exatamente a lista por esse ID; membro fora do escopo não entra."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.merchant_rule_ids",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/movement_ids.json

SHA-256 4c41b92c8bcf511536461ec676441babe401ef3906144beb960150605a786b96; Git blob 77ecf9272966b82543a6335ba25a6fe80dc6b742; bytes 1210.

```json
{
  "schema_version": 1,
  "contract_id": "movement_ids_v1",
  "metric": "movement_ids",
  "unit": "entity_ids",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "id_set"
    }
  },
  "semantics": [
    "Selecionar eventos confirmed da conta e mês consultados. Retornar seus IDs na ordem da coleção revisada, incluindo renda, transferências e pagamentos; não filtrar apenas despesas."
  ],
  "algebraic_properties": [
    "Adicionar membro elegível novo altera exatamente a lista por esse ID; membro fora do escopo não entra."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.movement_ids",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/net_consumption.json

SHA-256 1bbf9d81f52b9766156ab60ddd4d8da961b958440e32df12dc0ce315c76fe891; Git blob e5c4bc796cb7bb97b58bf93e425a21b58ba0061c; bytes 1244.

```json
{
  "schema_version": 1,
  "contract_id": "net_consumption_v1",
  "metric": "net_consumption",
  "unit": "BRL_minor",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "money_minor"
    }
  },
  "semantics": [
    "Somar consumo da compra e compensações comprovadamente ligadas a ela, dentro do conjunto definido pela consulta. Compensação não ligada é inválida mesmo com soma coincidente."
  ],
  "algebraic_properties": [
    "Uma contribuição elegível adicional altera o total pela contribuição definida; evento fora do escopo não altera resultado."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.net_consumption",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/owned_cards.json

SHA-256 67b68e3e0d27a0973127411a960953345eeff0c8adc001ea25001fa2ddbbfc3a; Git blob 39d53b39d0a7ce65985c5aa98c49ef9b6eb17657; bytes 1188.

```json
{
  "schema_version": 1,
  "contract_id": "owned_cards_v1",
  "metric": "owned_cards",
  "unit": "entity_ids",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "id_set"
    }
  },
  "semantics": [
    "Retornar IDs de todos os cartões cujo owner_id resolve a pessoa consultada, preservando a ordem revisada. Disponibilidade da fonte financeira não altera ownership."
  ],
  "algebraic_properties": [
    "Adicionar membro elegível novo altera exatamente a lista por esse ID; membro fora do escopo não entra."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.owned_cards",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/projected_installments.json

SHA-256 d5c649bcaf00627f23d1930ac78de03dfb41f2fb5e0c11cb26d1e177f57feaee; Git blob 5dd0aa72e0b0b3a4dfc589f1c10f4e55ba5c11df; bytes 1224.

```json
{
  "schema_version": 1,
  "contract_id": "projected_installments_v1",
  "metric": "projected_installments",
  "unit": "BRL_minor",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "money_minor"
    }
  },
  "semantics": [
    "Somar -amount_minor das parcelas projected da família no intervalo de competências; ligar cada pessoa à família e cada parcela ao plano."
  ],
  "algebraic_properties": [
    "Uma contribuição elegível adicional altera o total pela contribuição definida; evento fora do escopo não altera resultado."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.projected_installments",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/ranking_winner.json

SHA-256 aabe7e1423046863612c8d0ca4816bdc91e98d02c0f1cd2ce1a8a0e4f2b51889; Git blob ecd286ac802f4e7c3952c98450a9417948e6d98a; bytes 1403.

```json
{
  "schema_version": 1,
  "contract_id": "ranking_winner_v1",
  "metric": "ranking_winner",
  "unit": "entity_ids",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "id"
    }
  },
  "semantics": [
    "Comparar resultados de consumo já validados da população de pessoas explicitamente registrada. Maior consumo vence; empate usa ordem lexical dos IDs internos revisados.",
    "Ler população, chave e direção dos operandos explícitos registrados. Não obter ranking do texto do modelo ou de labels."
  ],
  "algebraic_properties": [
    "Aumentar estritamente o consumo de uma pessoa acima da vencedora anterior muda o vencedor.",
    "Empate segue o desempate revisado; inverter a direção deve ser distinguido."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.ranking_winner",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/refund_amount.json

SHA-256 2dafc200e53dfa069e3b7e12d42c0ead14db1f2b020768ec5fd2a6fcda4c515c; Git blob 7d6baf5e5e43bbf19046e0cddfb5d34ad9d90d7b; bytes 1772.

```json
{
  "schema_version": 1,
  "contract_id": "refund_amount_v1",
  "metric": "refund_amount",
  "unit": "BRL_minor",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "money_minor"
    }
  },
  "semantics": [
    "Somar max(0, amount_minor) dos eventos de compensação consultados, exigindo vínculo ao evento compensado.",
    "Um vínculo elegível resolve um evento diferente, da mesma pessoa, em estado confirmed e de categoria expense; o evento consultado tem categoria compensation. O período filtra o estorno, não a data do alvo.",
    "A derivation lê e valida os IDs escalares de person_id, category_id e compensates do candidato contra as referências resolvidas. A pessoa resolvida tem kind person; a igualdade com person_id do alvo não simula segunda travessia. Lê e resolve também category_id do alvo para verificar expense. Essas validações não substituem proof, seus predicados ou a aceitação integral."
  ],
  "algebraic_properties": [
    "Uma contribuição elegível adicional altera o total pela contribuição definida; evento fora do escopo não altera resultado."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.refund_amount",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/reminder_count.json

SHA-256 16b84262decf1b92536ed697b09844e0c76f5153f4570e8ec49bc550010f8514; Git blob 360317fa9132251c948080a6f419d816429345b5; bytes 1183.

```json
{
  "schema_version": 1,
  "contract_id": "reminder_count_v1",
  "metric": "reminder_count",
  "unit": "count",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "nonnegative_integer"
    }
  },
  "semantics": [
    "Contar lembretes da pessoa com scheduled_at dentro do intervalo inclusivo solicitado. Coleção vazia só produz zero com membership integral e closed_world comprovados."
  ],
  "algebraic_properties": [
    "Adicionar um membro elegível aumenta a contagem em um; remover diminui em um."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.reminder_count",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/safe_daily_pace.json

SHA-256 195e3968cc2f7f7dd2e46fdcb2619c19892b5c56a27d0e3c62f76fe08ba9a14d; Git blob 09e091a5ecd607721cab72ca6eecf30285786cd8; bytes 2090.

```json
{
  "schema_version": 1,
  "contract_id": "safe_daily_pace_v1",
  "metric": "safe_daily_pace",
  "unit": "BRL_minor",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "money_minor"
    }
  },
  "semantics": [
    "Usar somente consumo de eventos confirmed elegíveis por categoria efetiva, família e janela de seleção; input_evidence_state=confirmed é independente de claim.evidence_state=estimated.",
    "Subtrair consumo elegível do limite do orçamento e dividir pela cardinalidade de dias civis completos restantes após o corte, com floor para minor units. No corpus revisado, corte 15/06 e janela 16..30/06 produzem divisor 15.",
    "O corte é a data civil de fixed_clock no timezone/calendário da policy. O início futuro é seu sucessor civil e o fim é o último dia do mês de budget.period. Claim, janela e divisor da policy devem satisfazer as relações do registry v2; literais isolados não provam essas relações."
  ],
  "algebraic_properties": [
    "Resto não nulo distingue floor de round/ceil; divisor diferente da cardinalidade comprovada é recusado.",
    "Candidato excluído que passe a confirmed e satisfaça período/categoria/família não pode conservar uma exclusão por estado.",
    "No contrato v1 deste corpus, time_basis=15_full_days_after_as_of só é compatível com cardinalidade 15; cenário com outra cardinalidade exige novo descriptor/time_basis revisado."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.safe_daily_pace",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/side_effect_count.json

SHA-256 7813782950888e8af5c51403d313fc9b950c463e7109681e9cf30d4cd97345a2; Git blob f10a7ebfbfe49dd732fa7a0ce19261ab7ec19579; bytes 1227.

```json
{
  "schema_version": 1,
  "contract_id": "side_effect_count_v1",
  "metric": "side_effect_count",
  "unit": "count",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "nonnegative_integer"
    }
  },
  "semantics": [
    "Contar efeitos cuja turn_id resolve exatamente o turno consultado, na coleção sintética revisada. Coleção vazia prova zero somente para aquele snapshot/turno, não ausência de writers em produção."
  ],
  "algebraic_properties": [
    "Adicionar um membro elegível aumenta a contagem em um; remover diminui em um."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.side_effect_count",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/similar_event_ids.json

SHA-256 1f994c3caaea2a7c7fa968a49f872bb2b3f4d8ce0b959fc25bf26bbe5dac6817; Git blob 3624b97206830f978820b0d61251f0dd129c49da; bytes 1228.

```json
{
  "schema_version": 1,
  "contract_id": "similar_event_ids_v1",
  "metric": "similar_event_ids",
  "unit": "entity_ids",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "id_set"
    }
  },
  "semantics": [
    "Retornar IDs dos eventos confirmed do mês com merchant_key exatamente igual à consultada. Similar aqui é a igualdade revisada de chave, não aproximação textual ou merge automático."
  ],
  "algebraic_properties": [
    "Adicionar membro elegível novo altera exatamente a lista por esse ID; membro fora do escopo não entra."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.similar_event_ids",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/source_coverage.json

SHA-256 fab2872015cb21a449c05e355f7ba967865078ed963c869e84dd96da4b1e0111; Git blob 86ccce1c6e4baa4d83b6a0704ad656ac88a3fc24; bytes 1750.

```json
{
  "schema_version": 1,
  "contract_id": "source_coverage_v1",
  "metric": "source_coverage",
  "unit": "state",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "enum",
      "enum_values": [
        "complete",
        "partial",
        "unavailable"
      ]
    }
  },
  "semantics": [
    "Retornar coverage literal da source_state consultada depois de comprovar período e escopo aplicáveis. Não converter unavailable/partial para complete.",
    "Retornar após provar refere-se ao resultado aceito pelo pipeline completo. D produz somente R tipado provisório sobre inputs admitidos; P comprova período e coverage exigida antes de aceitação, materialização, validated_parent ou resposta financeira.",
    "D preserva resolução nominal, identidade, escopo e enum literal. R provisório partial/unavailable nunca vira complete ou receipt; P, identidade, fingerprints, seleção, traces e oracle positivo original continuam obrigatórios."
  ],
  "algebraic_properties": [
    "Estado diferente e válido deve ser preservado, sem coerção para complete."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.source_coverage",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/statement_payment_correspondence.json

SHA-256 3ffc3131e77bc4ead3248a3a5b49108093d16ddbbcb94635d49d7fc59d1171ec; Git blob 2649fd2cc2f942623a02d5eb6123048b1c83ec26; bytes 1436.

```json
{
  "schema_version": 1,
  "contract_id": "statement_payment_correspondence_v1",
  "metric": "statement_payment_correspondence",
  "unit": "state",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "enum",
      "enum_values": [
        "unproven"
      ]
    }
  },
  "semantics": [
    "Retornar unproven quando o schema revisado e as observações estruturais comprovam ausência de vínculo a uma fatura específica.",
    "O mundo v1 não contém statement_id/settles_statement_id/settles_statement_period. Proven exige nova evidência e schema revisados; não há caminho de autoria para fabricá-los neste corpus."
  ],
  "algebraic_properties": [
    "Trocar somente settles_card_id não cria correspondência de fatura comprovada."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.statement_payment_correspondence",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-contracts/statement_total.json

SHA-256 cca2c51e9d89ef572d069eb019d30924fc41409724c1d07abc7d2a215ce1d002; Git blob 318c1aab683095b4c4fda0ad5e4744d858363919; bytes 1797.

```json
{
  "schema_version": 1,
  "contract_id": "statement_total_v1",
  "metric": "statement_total",
  "unit": "BRL_minor",
  "stage": "authoring",
  "signature": {
    "context": "explicit_versioned_instrumented_claim",
    "operands": "resolve_roles_from_metric_evaluator_registry",
    "output": {
      "kind": "money_minor"
    }
  },
  "semantics": [
    "Consultar closing_day/due_day do cartão. A referência statement_due fixa a data de vencimento; o ciclo histórico termina no closing_day desse mês e começa exclusivamente no closing_day do mês anterior.",
    "Somar consumo confirmed do cartão em (previous_close, current_close]. Este contrato preserva a representação histórica v1; não renomeia essa janela para a semântica nova do kernel sem revisão.",
    "Uma única selection_window nomeada é usada tanto para inclusão quanto exclusão. Provar: end tem closing_day do cartão e mês/ano da data statement_due do claim; start é end menos um mês civil exato; a data do claim tem due_day do cartão. Datas inexistentes falham sem clamp/fallback. A policy fixa o calendário; nenhum nome de métrica entra no operador."
  ],
  "algebraic_properties": [
    "Evento no fechamento atual é incluído; no fechamento anterior é excluído."
  ],
  "reuse": {
    "path": "scripts/agent/validateFinancasBotNextFacts.mjs",
    "locator": "derive.statement_total",
    "status": "behavior_reference_requires_instrumented_adaptation"
  },
  "limitations": [
    "Assinatura de autoria; executável instrumentado e seu closure ainda não foram construídos/revisados.",
    "A fórmula opera somente sobre handles e roles resolvidos do registry, com escopo/período comprovados pelo grafo.",
    "Não usar oracle como input, autodeclarar trace ou aceitar campo non_material."
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-witness-contracts-v1.json

SHA-256 5a1a9d3b31357009f6e89d8a397c3fa6c7f079d58d06af5b0991c2cc65df5093; Git blob ffcaadc425e2967e7216e21e8548adec98f058fd; bytes 26374.

```json
{
  "schema_version": 1,
  "stage": "authoring",
  "scope": "formula_discriminants_only_not_complete_proof_atom_mutation_suite",
  "witnesses": [
    {
      "id": "account_balance_discriminant",
      "evaluator_id": "account_balance",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "opening_balance_minor": 100,
        "eligible_amounts": [
          -20,
          30
        ],
        "after_cutoff_amount": 999
      },
      "expected": 110,
      "mutation": "include_after_cutoff",
      "mutated_result": 1109,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "balance_delta_discriminant",
      "evaluator_id": "balance_delta",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "amount_minor": -7
      },
      "expected": -7,
      "mutation": "absolute_value",
      "mutated_result": 7,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "bills_open_discriminant",
      "evaluator_id": "bills_open",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "open_due_amounts": [
          3,
          5
        ],
        "paid_amount": 100
      },
      "expected": 8,
      "mutation": "include_paid",
      "mutated_result": 108,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "budget_class_consumption_discriminant",
      "evaluator_id": "budget_class_consumption",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "flexible_consumption": [
          3,
          5
        ],
        "essential_consumption": [
          100
        ]
      },
      "expected": 8,
      "mutation": "ignore_class",
      "mutated_result": 108,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "calendar_event_count_discriminant",
      "evaluator_id": "calendar_event_count",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "eligible_ids": [
          "a",
          "b"
        ],
        "outside_period_id": "c"
      },
      "expected": 2,
      "mutation": "include_outside_period",
      "mutated_result": 3,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "category_budget_remaining_discriminant",
      "evaluator_id": "category_budget_remaining",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "limit_minor": 20,
        "eligible_consumption": [
          3,
          5
        ]
      },
      "expected": 12,
      "mutation": "add_instead_of_subtract",
      "mutated_result": 28,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "category_consumption_discriminant",
      "evaluator_id": "category_consumption",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "category_consumption": [
          9,
          -4
        ],
        "other_category_consumption": 100
      },
      "expected": 5,
      "mutation": "ignore_compensation",
      "mutated_result": 9,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "category_spent_discriminant",
      "evaluator_id": "category_spent",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "category_consumption": [
          9,
          -4
        ],
        "other_category_consumption": 100
      },
      "expected": 5,
      "mutation": "ignore_category",
      "mutated_result": 105,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "consumption_by_instrument_discriminant",
      "evaluator_id": "consumption_by_instrument",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "instrument_consumption": [
          3,
          5
        ],
        "other_instrument_consumption": 100
      },
      "expected": 8,
      "mutation": "include_other_instrument",
      "mutated_result": 108,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "consumption_difference_discriminant",
      "evaluator_id": "consumption_difference",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "left": 3,
        "right": 5
      },
      "expected": -2,
      "mutation": "absolute_difference",
      "mutated_result": 2,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "consumption_effect_discriminant",
      "evaluator_id": "consumption_effect",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "neutral_transfer_amounts": [
          -7,
          7
        ],
        "category": "neutral"
      },
      "expected": 0,
      "mutation": "sum_absolute_movement",
      "mutated_result": 14,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "consumption_total_discriminant",
      "evaluator_id": "consumption_total",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "expense": 9,
        "linked_refund": -4,
        "neutral": 0
      },
      "expected": 5,
      "mutation": "drop_linked_refund",
      "mutated_result": 9,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "due_bill_ids_discriminant",
      "evaluator_id": "due_bill_ids",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "eligible_ids": [
          "bill_a"
        ],
        "outside_due_id": "bill_b"
      },
      "expected": [
        "bill_a"
      ],
      "mutation": "include_outside_due",
      "mutated_result": [
        "bill_a",
        "bill_b"
      ],
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "due_bills_total_discriminant",
      "evaluator_id": "due_bills_total",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "eligible_amounts": [
          3,
          5
        ],
        "outside_due_amount": 100
      },
      "expected": 8,
      "mutation": "include_outside_due",
      "mutated_result": 108,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "eligible_event_count_discriminant",
      "evaluator_id": "eligible_event_count",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "source_event_count": 0,
        "eligible_events": [
          "event_a"
        ]
      },
      "expected_violation": "coverage",
      "mutation": "trust_source_count_without_population_proof",
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "gross_consumption_discriminant",
      "evaluator_id": "gross_consumption",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "consumption_values": [
          9,
          -4
        ]
      },
      "expected": 9,
      "mutation": "net_instead_of_gross",
      "mutated_result": 5,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "income_minus_open_bills_discriminant",
      "evaluator_id": "income_minus_open_bills",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "income": 3,
        "bills": 5
      },
      "expected": -2,
      "mutation": "reverse_operands",
      "mutated_result": 2,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "income_realized_discriminant",
      "evaluator_id": "income_realized",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "confirmed_income": [
          3,
          5
        ],
        "projected_income": 100
      },
      "expected": 8,
      "mutation": "include_projected",
      "mutated_result": 108,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "installments_projected_discriminant",
      "evaluator_id": "installments_projected",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "projected_ids": [
          "p2",
          "p3"
        ],
        "confirmed_id": "p1"
      },
      "expected": 2,
      "mutation": "count_all_states",
      "mutated_result": 3,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "installments_projected_amount_discriminant",
      "evaluator_id": "installments_projected_amount",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "projected_amounts": [
          -3,
          -5
        ],
        "confirmed_amount": -100
      },
      "expected": 8,
      "mutation": "include_confirmed",
      "mutated_result": 108,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "installments_realized_discriminant",
      "evaluator_id": "installments_realized",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "confirmed_ids": [
          "p1"
        ],
        "projected_ids": [
          "p2",
          "p3"
        ]
      },
      "expected": 1,
      "mutation": "count_all_states",
      "mutated_result": 3,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "installments_realized_amount_discriminant",
      "evaluator_id": "installments_realized_amount",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "confirmed_amounts": [
          -3
        ],
        "projected_amounts": [
          -5,
          -7
        ]
      },
      "expected": 3,
      "mutation": "include_projected",
      "mutated_result": 15,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "invoice_payment_amount_discriminant",
      "evaluator_id": "invoice_payment_amount",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "payment_amount": -7
      },
      "expected": 7,
      "mutation": "preserve_negative_sign",
      "mutated_result": -7,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "invoice_payment_consumption_effect_discriminant",
      "evaluator_id": "invoice_payment_consumption_effect",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "payment_amount": -7,
        "category": "neutral.invoice_payment"
      },
      "expected": 0,
      "mutation": "treat_as_expense",
      "mutated_result": 7,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "invoice_payment_target_card_discriminant",
      "evaluator_id": "invoice_payment_target_card",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "settles_card_id": "card_b",
        "different_card": "card_a"
      },
      "expected": "card_b",
      "mutation": "retarget_card",
      "mutated_result": "card_a",
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "merchant_rule_ids_discriminant",
      "evaluator_id": "merchant_rule_ids",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "matching_ids": [
          "rule_a"
        ],
        "other_merchant_id": "rule_b"
      },
      "expected": [
        "rule_a"
      ],
      "mutation": "ignore_merchant",
      "mutated_result": [
        "rule_a",
        "rule_b"
      ],
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "movement_ids_discriminant",
      "evaluator_id": "movement_ids",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "account_ids": [
          "income_a",
          "transfer_a"
        ],
        "other_account_id": "expense_b"
      },
      "expected": [
        "income_a",
        "transfer_a"
      ],
      "mutation": "expense_only_filter",
      "mutated_result": [],
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "net_consumption_discriminant",
      "evaluator_id": "net_consumption",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "purchase_consumption": 9,
        "linked_refund_consumption": -4
      },
      "expected": 5,
      "mutation": "gross_instead_of_net",
      "mutated_result": 9,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "owned_cards_discriminant",
      "evaluator_id": "owned_cards",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "owner_a_cards": [
          "card_a",
          "card_offline"
        ],
        "owner_b_cards": [
          "card_b"
        ]
      },
      "expected": [
        "card_a",
        "card_offline"
      ],
      "mutation": "exclude_unavailable_card",
      "mutated_result": [
        "card_a"
      ],
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "projected_installments_discriminant",
      "evaluator_id": "projected_installments",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "family_projected_amounts": [
          -3,
          -5
        ],
        "outside_family_amount": -100
      },
      "expected": 8,
      "mutation": "ignore_family",
      "mutated_result": 108,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "ranking_winner_discriminant",
      "evaluator_id": "ranking_winner",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "person_a": 3,
        "person_b": 5,
        "direction": "desc"
      },
      "expected": "person_b",
      "mutation": "reverse_direction",
      "mutated_result": "person_a",
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "refund_amount_discriminant",
      "evaluator_id": "refund_amount",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "refund_amount": 4,
        "original_purchase_amount": -9
      },
      "expected": 4,
      "mutation": "absolute_all_amounts",
      "mutated_result": 13,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "reminder_count_discriminant",
      "evaluator_id": "reminder_count",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "eligible_ids": [
          "r1"
        ],
        "other_person_id": "r2"
      },
      "expected": 1,
      "mutation": "ignore_person",
      "mutated_result": 2,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "safe_daily_pace_discriminant",
      "evaluator_id": "safe_daily_pace",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "remaining_minor": 16,
        "divisor": 15
      },
      "expected": 1,
      "mutation": "ceil_instead_of_floor",
      "mutated_result": 2,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "side_effect_count_discriminant",
      "evaluator_id": "side_effect_count",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "turn_a_effects": [],
        "turn_b_effects": [
          "effect_b"
        ]
      },
      "expected": 0,
      "mutation": "ignore_turn",
      "mutated_result": 1,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "similar_event_ids_discriminant",
      "evaluator_id": "similar_event_ids",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "exact_merchant_ids": [
          "event_a"
        ],
        "similar_label_other_key": "event_b"
      },
      "expected": [
        "event_a"
      ],
      "mutation": "match_label_instead_of_key",
      "mutated_result": [
        "event_a",
        "event_b"
      ],
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "source_coverage_discriminant",
      "evaluator_id": "source_coverage",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "coverage": "partial"
      },
      "expected": "partial",
      "mutation": "coerce_complete",
      "mutated_result": "complete",
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "statement_payment_correspondence_discriminant",
      "evaluator_id": "statement_payment_correspondence",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "settles_card_id": "card_a",
        "statement_link_present": false
      },
      "expected": "unproven",
      "mutation": "infer_from_card",
      "mutated_result": "proven",
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    },
    {
      "id": "statement_total_discriminant",
      "evaluator_id": "statement_total",
      "stage": "authoring",
      "witness_domain": "independent_synthetic_minimal_case",
      "inputs": {
        "at_previous_close_consumption": 100,
        "after_previous_close_consumption": 3,
        "at_current_close_consumption": 5,
        "after_current_close_consumption": 1000
      },
      "expected": 8,
      "mutation": "include_previous_close",
      "mutated_result": 108,
      "execution_status": "not_executed",
      "materialization_requirement": "Instantiate these functional quantities as schema-valid operands and prove unrelated atoms remain valid before execution; missing realization fails UNSATISFIED_MUTATION_WITNESS."
    }
  ]
}
```

## docs/contracts/next/provenance-v2/evaluator-witness-contracts.schema.json

SHA-256 dd5af1b4ab9d29f67d87b7b979076f8b4695cd917062d63ec34da6c12240adaa; Git blob 203c5b08a19d5b0fc782c14c9f77f727b2b46df9; bytes 2320.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "urn:financasbot:next:evaluator-witness-contracts:1",
  "title": "N02-F functional discriminant witness contracts",
  "$comment": "Authoring-only quantities. Validation does not execute witnesses or make them proof-atom mutants.",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "stage", "scope", "witnesses"],
  "properties": {
    "schema_version": {"const": 1},
    "stage": {"const": "authoring"},
    "scope": {"const": "formula_discriminants_only_not_complete_proof_atom_mutation_suite"},
    "witnesses": {
      "type": "array",
      "minItems": 1,
      "items": {"$ref": "#/definitions/witness"}
    }
  },
  "definitions": {
    "id": {"type": "string", "pattern": "^[a-z][a-z0-9_]{0,95}$"},
    "value": {
      "oneOf": [
        {"type": "string", "minLength": 1},
        {"type": "integer"},
        {"type": "boolean"},
        {"type": "array", "items": {"oneOf": [
          {"type": "string", "minLength": 1},
          {"type": "integer"},
          {"type": "boolean"}
        ]}}
      ]
    },
    "witness": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "id", "evaluator_id", "stage", "witness_domain", "inputs",
        "mutation", "execution_status",
        "materialization_requirement"
      ],
      "oneOf": [
        {"required": ["expected", "mutated_result"]},
        {"required": ["expected_violation"]}
      ],
      "properties": {
        "id": {"$ref": "#/definitions/id"},
        "evaluator_id": {"$ref": "#/definitions/id"},
        "stage": {"const": "authoring"},
        "witness_domain": {"const": "independent_synthetic_minimal_case"},
        "inputs": {
          "type": "object",
          "minProperties": 1,
          "propertyNames": {"$ref": "#/definitions/id"},
          "additionalProperties": {"$ref": "#/definitions/value"}
        },
        "expected": {"$ref": "#/definitions/value"},
        "mutation": {"$ref": "#/definitions/id"},
        "mutated_result": {"$ref": "#/definitions/value"},
        "expected_violation": {"$ref": "#/definitions/id"},
        "execution_status": {"const": "not_executed"},
        "materialization_requirement": {"type": "string", "minLength": 1}
      }
    }
  }
}
```

## docs/contracts/next/provenance-v2/evidence-snapshot.schema.json

SHA-256 054a48930a5f25760f201e8b401f0f34f5a83672366acad6c9c09bdc0ce0b5ef; Git blob 3bbba0aae5c05d2bf0d30a714a5e1faa518f6fb1; bytes 17718.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "urn:financasbot:next:evidence-snapshot:2",
  "title": "N02-F evidence snapshot: structural projection of material field registry",
  "$comment": "Authoring draft. Field classes and edge target authorities remain material-field-registry-v1.json. Schema projection must agree exactly; cross-node identity, dates, safe -0 exclusion, role uniqueness and unit domains require semantic checks.",
  "oneOf": [{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"family"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_family"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"person"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_person"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"account"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_account"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"card"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_card"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"category"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_category"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"event"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_event"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"budget"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_budget"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"bill"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_bill"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"source_state"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_source_state"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"proposal"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_proposal"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"reminder"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_reminder"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"calendar_event"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_calendar_event"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"side_effect"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_side_effect"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"merchant_rule"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_merchant_rule"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"fixture"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_fixture"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"collection"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_collection"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"source_origin"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_source_origin"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"merchant_identity"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_merchant_identity"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"transfer_identity"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_transfer_identity"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"installment_plan"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_installment_plan"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"turn"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_turn"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"derived_claim"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_derived_claim"}}},{"type":"object","additionalProperties":false,"required":["ref_id","kind","version","payload"],"properties":{"ref_id":{"$ref":"#/definitions/id"},"kind":{"const":"evaluation_policy"},"version":{"$ref":"#/definitions/digest"},"payload":{"$ref":"#/definitions/payload_evaluation_policy"}}}],
  "definitions": {
    "id": {"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},
    "digest": {"type":"string","pattern":"^sha256:[a-f0-9]{64}$"},
    "text": {"type":"string"},
    "date": {"type":"string","pattern":"^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$","format":"date"},
    "month": {"type":"string","pattern":"^[0-9]{4}-(0[1-9]|1[0-2])$"},
    "datetime": {"type":"string","format":"date-time","pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$"},
    "integer": {"type":"integer","minimum":-9007199254740991,"maximum":9007199254740991},
    "positive_integer": {"type":"integer","minimum":1,"maximum":9007199254740991},
    "nonnegative_integer": {"type":"integer","minimum":0,"maximum":9007199254740991},
    "money_minor": {"type":"integer","minimum":-9007199254740991,"maximum":9007199254740991},
    "boolean": {"type":"boolean"},
    "ref": {"$ref":"#/definitions/id"},
    "ref_list": {"type":"array","uniqueItems":true,"items":{"$ref":"#/definitions/ref"}},
    "typed_period": {"$ref":"urn:financasbot:next:claim-contract:2#/definitions/period"},
    "typed_result": {"oneOf":[{"type":"object","additionalProperties":false,"required":["unit","kind","value"],"properties":{"unit":{"const":"BRL_minor"},"kind":{"const":"money_minor"},"value":{"$ref":"#/definitions/money_minor"}}},{"type":"object","additionalProperties":false,"required":["unit","kind","value"],"properties":{"unit":{"const":"count"},"kind":{"const":"nonnegative_integer"},"value":{"$ref":"#/definitions/nonnegative_integer"}}},{"type":"object","additionalProperties":false,"required":["unit","kind","value"],"properties":{"unit":{"const":"entity_ids"},"kind":{"const":"id"},"value":{"$ref":"#/definitions/ref"}}},{"type":"object","additionalProperties":false,"required":["unit","kind","value"],"properties":{"unit":{"const":"entity_ids"},"kind":{"const":"id_set"},"value":{"$ref":"#/definitions/ref_list"}}},{"type":"object","additionalProperties":false,"required":["unit","kind","value"],"properties":{"unit":{"const":"state"},"kind":{"const":"enum"},"value":{"type":"string","minLength":1}}}]},
    "role_ref_list": {"type":"array","uniqueItems":true,"items":{"type":"object","additionalProperties":false,"required":["role_id","parent_ref"],"properties":{"role_id":{"type":"string","pattern":"^[a-z][a-z0-9_]{0,63}$"},"parent_ref":{"$ref":"#/definitions/ref"}}}},
    "payload_family": {"type":"object","additionalProperties":false,"required":["id","label","members"],"properties":{"id":{"$ref":"#/definitions/id"},"label":{"$ref":"#/definitions/text"},"members":{"$ref":"#/definitions/ref_list"}}},
    "payload_person": {"type":"object","additionalProperties":false,"required":["id","label","family_id"],"properties":{"id":{"$ref":"#/definitions/id"},"label":{"$ref":"#/definitions/text"},"family_id":{"$ref":"#/definitions/ref"}}},
    "payload_account": {"type":"object","additionalProperties":false,"required":["id","label","owner_id","type","opening_balance_minor","opening_balance_as_of"],"properties":{"id":{"$ref":"#/definitions/id"},"label":{"$ref":"#/definitions/text"},"owner_id":{"$ref":"#/definitions/ref"},"type":{"enum":["checking","reserve"]},"opening_balance_minor":{"$ref":"#/definitions/money_minor"},"opening_balance_as_of":{"$ref":"#/definitions/date"}}},
    "payload_card": {"type":"object","additionalProperties":false,"required":["id","label","owner_id","closing_day","due_day"],"properties":{"id":{"$ref":"#/definitions/id"},"label":{"$ref":"#/definitions/text"},"owner_id":{"$ref":"#/definitions/ref"},"closing_day":{"allOf":[{"$ref":"#/definitions/positive_integer"},{"maximum":31}]},"due_day":{"allOf":[{"$ref":"#/definitions/positive_integer"},{"maximum":31}]}}},
    "payload_category": {"type":"object","additionalProperties":false,"required":["id","label","kind"],"properties":{"id":{"$ref":"#/definitions/id"},"label":{"$ref":"#/definitions/text"},"kind":{"enum":["expense","income","neutral","compensation"]},"budget_class":{"enum":["essential","flexible"]}}},
    "payload_event": {"type":"object","additionalProperties":false,"required":["id","date","person_id","category_id","amount_minor","state"],"properties":{"id":{"$ref":"#/definitions/id"},"date":{"$ref":"#/definitions/date"},"person_id":{"$ref":"#/definitions/ref"},"account_id":{"$ref":"#/definitions/ref"},"card_id":{"$ref":"#/definitions/ref"},"category_id":{"$ref":"#/definitions/ref"},"amount_minor":{"$ref":"#/definitions/money_minor"},"state":{"enum":["confirmed","projected"]},"merchant_key":{"$ref":"#/definitions/ref"},"compensates":{"$ref":"#/definitions/ref"},"transfer_pair":{"$ref":"#/definitions/ref"},"settles_card_id":{"$ref":"#/definitions/ref"},"installment_plan":{"$ref":"#/definitions/ref"},"installment_number":{"$ref":"#/definitions/positive_integer"},"installment_total":{"$ref":"#/definitions/positive_integer"}}},
    "payload_budget": {"type":"object","additionalProperties":false,"required":["id","family_id","category_id","period","limit_minor","evidence_state","source"],"properties":{"id":{"$ref":"#/definitions/id"},"family_id":{"$ref":"#/definitions/ref"},"category_id":{"$ref":"#/definitions/ref"},"period":{"$ref":"#/definitions/month"},"limit_minor":{"$ref":"#/definitions/money_minor"},"evidence_state":{"enum":["confirmed"]},"source":{"$ref":"#/definitions/ref"}}},
    "payload_bill": {"type":"object","additionalProperties":false,"required":["id","person_id","due_date","amount_minor","status","evidence_state","source"],"properties":{"id":{"$ref":"#/definitions/id"},"person_id":{"$ref":"#/definitions/ref"},"due_date":{"$ref":"#/definitions/date"},"amount_minor":{"$ref":"#/definitions/money_minor"},"status":{"enum":["open","paid","cancelled"]},"evidence_state":{"enum":["confirmed","projected"]},"source":{"$ref":"#/definitions/ref"}}},
    "payload_source_state": {"type":"object","additionalProperties":false,"required":["id","source","coverage"],"properties":{"id":{"$ref":"#/definitions/id"},"source":{"$ref":"#/definitions/ref"},"period":{"$ref":"#/definitions/month"},"entity_id":{"$ref":"#/definitions/ref"},"category_id":{"$ref":"#/definitions/ref"},"coverage":{"enum":["complete","partial","unavailable"]},"event_count":{"$ref":"#/definitions/nonnegative_integer"}}},
    "payload_proposal": {"type":"object","additionalProperties":false,"required":["id","state","expires_at","source_version"],"properties":{"id":{"$ref":"#/definitions/id"},"state":{"enum":["presented","expired","superseded"]},"expires_at":{"$ref":"#/definitions/datetime"},"source_version":{"$ref":"#/definitions/id"}}},
    "payload_reminder": {"type":"object","additionalProperties":false,"required":["id","person_id","scheduled_at"],"properties":{"id":{"$ref":"#/definitions/id"},"person_id":{"$ref":"#/definitions/ref"},"scheduled_at":{"$ref":"#/definitions/date"}}},
    "payload_calendar_event": {"type":"object","additionalProperties":false,"required":["id","person_id","scheduled_at"],"properties":{"id":{"$ref":"#/definitions/id"},"person_id":{"$ref":"#/definitions/ref"},"scheduled_at":{"$ref":"#/definitions/date"}}},
    "payload_side_effect": {"type":"object","additionalProperties":false,"required":["id","turn_id"],"properties":{"id":{"$ref":"#/definitions/id"},"turn_id":{"$ref":"#/definitions/ref"}}},
    "payload_merchant_rule": {"type":"object","additionalProperties":false,"required":["id","merchant_key","category_id","application","reversible","evidence_state","source"],"properties":{"id":{"$ref":"#/definitions/id"},"merchant_key":{"$ref":"#/definitions/ref"},"category_id":{"$ref":"#/definitions/ref"},"application":{"enum":["suggestion","automatic"]},"reversible":{"$ref":"#/definitions/boolean"},"evidence_state":{"enum":["confirmed"]},"source":{"$ref":"#/definitions/ref"}}},
    "payload_fixture": {"type":"object","additionalProperties":false,"required":["id","synthetic","closed_world","currency","fixed_clock"],"properties":{"id":{"$ref":"#/definitions/id"},"synthetic":{"$ref":"#/definitions/boolean"},"closed_world":{"$ref":"#/definitions/boolean"},"currency":{"enum":["BRL"]},"fixed_clock":{"$ref":"#/definitions/datetime"}}},
    "payload_collection": {"type":"object","additionalProperties":false,"required":["id","fixture_id","collection_name","members"],"properties":{"id":{"$ref":"#/definitions/id"},"fixture_id":{"$ref":"#/definitions/ref"},"collection_name":{"enum":["families","people","accounts","cards","categories","events","budgets","bills","source_states","proposals","reminders","calendar_events","side_effects","merchant_rules"]},"members":{"$ref":"#/definitions/ref_list"}}},
    "payload_source_origin": {"type":"object","additionalProperties":false,"required":["id","fixture_id"],"properties":{"id":{"$ref":"#/definitions/id"},"fixture_id":{"$ref":"#/definitions/ref"}}},
    "payload_merchant_identity": {"type":"object","additionalProperties":false,"required":["id","fixture_id"],"properties":{"id":{"$ref":"#/definitions/id"},"fixture_id":{"$ref":"#/definitions/ref"}}},
    "payload_transfer_identity": {"type":"object","additionalProperties":false,"required":["id","members"],"properties":{"id":{"$ref":"#/definitions/id"},"members":{"$ref":"#/definitions/ref_list"}}},
    "payload_installment_plan": {"type":"object","additionalProperties":false,"required":["id","members","installment_total"],"properties":{"id":{"$ref":"#/definitions/id"},"members":{"$ref":"#/definitions/ref_list"},"installment_total":{"$ref":"#/definitions/positive_integer"}}},
    "payload_turn": {"type":"object","additionalProperties":false,"required":["id","fixture_id"],"properties":{"id":{"$ref":"#/definitions/id"},"fixture_id":{"$ref":"#/definitions/ref"}}},
    "payload_derived_claim": {"type":"object","additionalProperties":false,"required":["id","fact_key","evaluator_version","result_hash","result","parents"],"properties":{"id":{"$ref":"#/definitions/id"},"fact_key":{"$ref":"#/definitions/id"},"evaluator_version":{"$ref":"#/definitions/positive_integer"},"result_hash":{"$ref":"#/definitions/digest"},"result":{"$ref":"#/definitions/typed_result"},"parents":{"$ref":"#/definitions/role_ref_list"}}},
    "payload_evaluation_policy": {"type":"object","additionalProperties":false,"required":["id","calendar","timezone","ranking_key","ranking_direction","ranking_tie_break","daily_pace_divisor","daily_pace_rounding","daily_pace_start","daily_pace_end","daily_pace_as_of"],"properties":{"id":{"$ref":"#/definitions/id"},"calendar":{"enum":["proleptic_gregorian"]},"timezone":{"enum":["America/Sao_Paulo"]},"ranking_key":{"enum":["validated_consumption_minor"]},"ranking_direction":{"enum":["asc","desc"]},"ranking_tie_break":{"enum":["lexical_internal_id"]},"daily_pace_divisor":{"$ref":"#/definitions/positive_integer"},"daily_pace_rounding":{"enum":["floor","ceil","round"]},"daily_pace_start":{"$ref":"#/definitions/date"},"daily_pace_end":{"$ref":"#/definitions/date"},"daily_pace_as_of":{"$ref":"#/definitions/date"}}}
  }
}
```

## docs/contracts/next/provenance-v2/graph-authoring-review-v1.md

SHA-256 b68e673b0f4edc38d023c6440db3afcb02264f7789a89d486abff8182e01e39e; Git blob c83eb2128dcadbe5dcfc2f238cef426b0abfb8c0; bytes 10949.

```markdown
# Revisão de autoria dos 76 grafos — N02-F

Estado: CANDIDATO DOCUMENTAL CORRIGIDO; REAUDITORIA FOCAL PENDENTE.
Data: 2026-09-10. Nenhuma execução do motor de provenance.

As evidências abaixo registram o candidato ef04368 e a autoria original.
O parecer integral posterior confirmou H-01/H-02/M-01. A correção, seus checks
atualizados e o limite de aprovação estão em n02f-correction-review-v1.md.
O registry v2 e required_selections são propostas corrigidas em reauditoria.

## Fontes e método

Os grafos foram autorados a partir dos descriptors de golden-fact-contracts-v1,
dos diálogos em golden-conversation-set-v1 e dos registros sintéticos da fixture
congelada. O value oracle não foi usado para gerar relações, seleções ou hashes.
Os contratos funcionais referem o comportamento existente do validador v1;
diferenças históricas permanecem explícitas. Não há código novo em src/scripts.

Os templates reutilizam conjunções genéricas de igualdade e período, sem nome
de métrica, loop ou código. current_member_field_parameter é uma referência
tipada ao membro quantificado por all_match/none_match, não um callback.
O hash de cada template é canonicalValue/digest do objeto integral da entrada.
A expansão deve ser visível na futura IR; templates não dispensam predicados.

Cada grafo declara população candidata, seleção e uma razão comprovada para
cada excluído. candidate_set deve ser a união disjunta e exata de selected_set
e excluded.node. Não basta contar elementos; IDs, tipos e predicados precisam
coincidir. selected_predicates devem provar todos os critérios aplicáveis do
contrato funcional; excluded.predicates demonstram pelo menos um critério
violado. A correção semântica dessa relação faz parte da auditoria deste pacote.

presence observa existência de campo opcional conhecido pelo schema e entrega
boolean ao operador eq. Não lê campo desconhecido nem converte ausência em
null. Excluir registro por campo ausente exige observação has no proof trace.
A seleção de eventos usa categoria efetiva do alvo quando há compensates;
a prova mantém a aresta e compara titular/instrumento e sinais.

O fechamento de arestas expande os targets materiais dos nós necessários,
incluindo membership de família/coleção. Por isso há nós de prova fora da
seleção financeira. Sua necessidade decorre de identidade, coverage ou links,
e não de contribuição ao resultado. Fingerprints observam todos os campos
materiais na fase proof; leituras do cálculo foram reduzidas aos campos
previstos pelos contratos funcionais. O futuro candidato executável terá de
produzir exatamente esses acessos instrumentados ou voltar à revisão do
contrato; não pode inserir leituras artificiais só para satisfazer contagem.

## Casos causais especialmente confrontados

- S-12: saldo zero depende do saldo inicial, corte temporal e exclusão de todos
  os eventos; coleção vazia não é presumida.
- S-13/M-09/N-04: event_count zero da fonte é confrontado com seleção vazia por
  categoria, estado, período e sujeito; contagem da fonte sozinha não prova zero.
- M-01: ranking/diferença apontam para M-01#1#1 e M-01#1#2 já validados; roles
  left/right, chave/direção e desempate são explícitos.
- M-04/N-07: transferência mantém duas pontas, sinais opostos, magnitudes
  iguais, pessoa igual e contas diferentes.
- M-05/N-08: pagamento aponta para cartão e seu titular, sem inventar vínculo
  de fatura; unproven permanece distinto de inexistência de pagamento.
- M-06/F-06: estorno mantém compra-alvo e categoria herdada; bruto, refund e
  líquido continuam resultados diferentes.
- M-08: membro sem consumo é provado por exclusões; limite familiar não é
  convertido em limite pessoal.
- M-13: janelas de consumo/futuro são distintas e relacionadas ao clock,
  orçamento e policy; cardinalidade civil e floor preservam o corpus de 15 dias.
- M-14: income_minus_open_bills usa dois pais de unidades compatíveis e mantém
  mixed_declared/estimated.
- M-15/M-16: coleções de lembretes, agenda e efeitos vazias têm snapshots
  tipados, membership integral e turno/pessoa ligados; não provam produção.

## Rastreabilidade por fato

| fact_key | métrica | nós | candidatos | selecionados | excluídos | pais |
|---|---|---:|---:|---:|---:|---|
| S-01#1#1 | consumption_total | 43 | 16 | 9 | 7 | — |
| S-02#1#1 | consumption_total | 43 | 16 | 5 | 11 | — |
| S-03#1#1 | category_consumption | 43 | 16 | 1 | 15 | — |
| S-04#1#1 | movement_ids | 40 | 16 | 5 | 11 | — |
| S-05#1#1 | statement_total | 42 | 16 | 2 | 14 | — |
| S-06#1#1 | account_balance | 40 | 16 | 5 | 11 | — |
| S-07#1#1 | owned_cards | 8 | 3 | 2 | 1 | — |
| S-08#1#1 | consumption_effect | 21 | 2 | 2 | 0 | — |
| S-09#1#1 | consumption_effect | 19 | 1 | 1 | 0 | — |
| S-10#1#1 | net_consumption | 19 | 2 | 2 | 0 | — |
| S-11#1#1 | installments_realized | 40 | 16 | 1 | 15 | — |
| S-11#1#2 | installments_projected | 40 | 16 | 2 | 14 | — |
| S-11#1#3 | installments_projected_amount | 40 | 16 | 2 | 14 | — |
| S-12#1#1 | account_balance | 40 | 16 | 0 | 16 | — |
| S-13#1#1 | eligible_event_count | 43 | 16 | 0 | 16 | — |
| S-16#1#1 | source_coverage | 13 | 4 | 1 | 3 | — |
| M-01#1#1 | consumption_total | 43 | 16 | 5 | 11 | — |
| M-01#1#2 | consumption_total | 43 | 16 | 4 | 12 | — |
| M-01#1#3 | ranking_winner | 7 | 0 | 0 | 0 | M-01#1#1, M-01#1#2 |
| M-01#1#4 | consumption_difference | 6 | 0 | 0 | 0 | M-01#1#1, M-01#1#2 |
| M-02#1#1 | consumption_by_instrument | 41 | 16 | 2 | 14 | — |
| M-02#1#2 | consumption_by_instrument | 41 | 16 | 3 | 13 | — |
| M-03#1#1 | budget_class_consumption | 43 | 16 | 6 | 10 | — |
| M-03#1#2 | budget_class_consumption | 43 | 16 | 3 | 13 | — |
| M-04#1#1 | balance_delta | 10 | 1 | 1 | 0 | — |
| M-04#1#2 | balance_delta | 10 | 1 | 1 | 0 | — |
| M-04#1#3 | consumption_effect | 21 | 2 | 2 | 0 | — |
| M-05#1#1 | statement_total | 42 | 16 | 2 | 14 | — |
| M-05#1#2 | invoice_payment_amount | 8 | 1 | 1 | 0 | — |
| M-05#1#3 | invoice_payment_target_card | 8 | 1 | 1 | 0 | — |
| M-05#1#4 | statement_payment_correspondence | 8 | 1 | 1 | 0 | — |
| M-05#1#5 | invoice_payment_consumption_effect | 19 | 1 | 1 | 0 | — |
| M-06#1#1 | gross_consumption | 18 | 1 | 1 | 0 | — |
| M-06#1#2 | refund_amount | 9 | 1 | 1 | 0 | — |
| M-06#1#3 | net_consumption | 19 | 2 | 2 | 0 | — |
| M-07#1#1 | consumption_total | 43 | 16 | 9 | 7 | — |
| M-07#1#2 | projected_installments | 42 | 16 | 2 | 14 | — |
| M-08#1#1 | category_spent | 43 | 16 | 0 | 16 | — |
| M-08#1#2 | category_budget_remaining | 43 | 16 | 0 | 16 | — |
| M-09#1#1 | eligible_event_count | 43 | 16 | 0 | 16 | — |
| M-12#1#1 | consumption_total | 43 | 16 | 9 | 7 | — |
| M-13#1#1 | category_spent | 43 | 16 | 1 | 15 | — |
| M-13#1#2 | category_budget_remaining | 43 | 16 | 1 | 15 | — |
| M-13#1#3 | safe_daily_pace | 44 | 16 | 1 | 15 | — |
| M-13#1#4 | category_spent | 43 | 16 | 1 | 15 | — |
| M-13#1#5 | category_budget_remaining | 43 | 16 | 1 | 15 | — |
| M-13#1#6 | safe_daily_pace | 44 | 16 | 1 | 15 | — |
| M-14#1#1 | income_realized | 41 | 16 | 1 | 15 | — |
| M-14#1#2 | bills_open | 7 | 1 | 1 | 0 | — |
| M-14#1#3 | income_minus_open_bills | 6 | 0 | 0 | 0 | M-14#1#1, M-14#1#2 |
| M-15#1#1 | due_bill_ids | 7 | 1 | 1 | 0 | — |
| M-15#1#2 | due_bills_total | 7 | 1 | 1 | 0 | — |
| M-15#1#3 | reminder_count | 5 | 0 | 0 | 0 | — |
| M-15#1#4 | calendar_event_count | 5 | 0 | 0 | 0 | — |
| M-16#1#1 | merchant_rule_ids | 6 | 1 | 1 | 0 | — |
| M-16#1#2 | similar_event_ids | 40 | 16 | 1 | 15 | — |
| M-16#1#3 | side_effect_count | 3 | 0 | 0 | 0 | — |
| F-01#1#1 | category_consumption | 43 | 16 | 1 | 15 | — |
| F-01#2#1 | category_consumption | 43 | 16 | 0 | 16 | — |
| F-02#1#1 | consumption_total | 43 | 16 | 5 | 11 | — |
| F-03#1#1 | consumption_by_instrument | 41 | 16 | 2 | 14 | — |
| F-03#2#1 | statement_total | 42 | 16 | 2 | 14 | — |
| F-04#1#1 | category_consumption | 43 | 16 | 1 | 15 | — |
| F-04#2#1 | category_budget_remaining | 43 | 16 | 1 | 15 | — |
| F-05#1#1 | category_consumption | 43 | 16 | 1 | 15 | — |
| F-05#2#1 | category_consumption | 43 | 16 | 1 | 15 | — |
| F-06#1#1 | gross_consumption | 18 | 1 | 1 | 0 | — |
| F-06#2#1 | refund_amount | 9 | 1 | 1 | 0 | — |
| F-06#2#2 | net_consumption | 19 | 2 | 2 | 0 | — |
| F-07#1#1 | installments_realized | 40 | 16 | 1 | 15 | — |
| F-07#1#2 | installments_realized_amount | 40 | 16 | 1 | 15 | — |
| F-07#2#1 | installments_projected | 40 | 16 | 2 | 14 | — |
| F-07#2#2 | installments_projected_amount | 40 | 16 | 2 | 14 | — |
| N-04#1#1 | eligible_event_count | 43 | 16 | 0 | 16 | — |
| N-07#1#1 | consumption_effect | 21 | 2 | 2 | 0 | — |
| N-08#1#1 | invoice_payment_consumption_effect | 19 | 1 | 1 | 0 | — |

## Evidência local e seus limites

- 76/76 grafos satisfizeram o schema estrutural, com resolução local das URNs.
- 76/76 claims satisfizeram schema e igualdade dos roles do registry.
- 39 contratos e 39 entradas do registry satisfizeram seus schemas.
- Referências de nós/arestas/predicados e partições foram conferidas em todos
  os grafos; 16.266 requisitos de leitura não apontam a campo desconhecido ou
  non_material. Esses checks são de autoria, não execução da fórmula.
- O inventário integral confrontou 4.422 arestas materiais com os payloads;
  1.047 comparações campo/literal foram confrontadas com os snapshots sem
  contradição. Os vínculos de sujeito, período, time_basis, coverage e estado
  do claim são predicados explícitos, não inferências do nome da métrica.
- Fingerprints foram calculados pela função aprovada canonicalValue/digest;
  hashes de documentos apontam a bytes UTF-8 existentes.
- Os 39 witnesses discriminantes são contratos de execução futura. Não foram
  contados como testes PASS nem como suíte completa de mutações.
- A suíte ampla funcional não foi repetida: todos os caminhos alterados são
  documentos/JSON de autoria. Workflow/diff e hashes devem passar no candidato.

## Fronteira da auditoria

Solicitar auditoria independente de schemas, registries, policy, manifest,
contratos, witnesses e dos 76 grafos, confrontando as fontes congeladas.
O auditor deve tentar quebrar especialmente: a derivação das janelas históricas
de statement/account balance/safe pace; a suficiência de cada partição; o uso
de pais validados no ranking/diferenças; e a separação entre estado dos inputs
e estado estimado do resultado. Um hash ou uma contagem correta não basta.
A aprovação documental não implementa nem libera automaticamente o motor.
Depois do parecer, corrigir achados causais confirmados no mesmo escopo;
somente após aprovação integral selecionar a fatia executável prevista.
NEXT-02 global permanece aberto; produção/deploy/dados reais permanecem fora
deste candidato.
```

## docs/contracts/next/provenance-v2/graph-binding-contract-v1.md

SHA-256 da90befb1f526048cfe14122cd8522690292508bebf42d60ea4ecd5838513a40; Git blob 6556cd13008c7c4197a27d668755c5941b3644f7; bytes 19080.

````markdown
# Binding de grafo, snapshot e resultado derivado — N02-F

Estado: RASCUNHO DE AUTORIA; revisão integral N02-F pendente.
Autoridade superior: NEXT-00 ratificado, inclusive seus canais R/I/M/L/T.
Os schemas associados especificam documentos; nenhum compiler foi criado.

## 1. Resolução dos documentos

O grafo referencia claim contract, snapshot manifest e os três registries por
path local e SHA-256 dos bytes UTF-8 exatos. Resolver path não autoriza rede,
filesystem fora do pacote ou execução. O pacote deve conter esses bytes;
ausência ou divergência é erro. As URNs dos schemas são resolvidas somente
contra o catálogo local revisado. Hash de contrato não prova sua semântica.

O conjunto de fact_keys deve coincidir exatamente com os 76 do contrato v1,
incluindo S, M, F e N. Uma grammar correta não substitui essa igualdade.
Cada graph.fact_key resolve exatamente um claim e seu claim_id; o grafo não
publica uma segunda cópia normativa do descriptor. Aliases de nós, conjuntos,
arestas e predicados são únicos em seus namespaces locais. Referência ambígua,
ausente, extra ou incompatível com o tipo falha.

O snapshot schema é uma projeção estrutural do material field registry.
Classificações e targets continuam definidos no registry. A projeção deve
ter exatamente os mesmos kinds, campos, obrigatoriedades e restrições de tipo;
qualquer divergência entre ambos impede aceitar o pacote. Não há regra de
precedência que silenciosamente escolha o schema mais permissivo.

## 2. Snapshots primários

Cada nó snapshot fixa kind/ref_id/version/semantic_fingerprint e papéis de
evidência. O manifest mapeia a identidade ao registro original da fixture ou
a um objeto auxiliar explicitamente autorado e revisado. O payload é validado
pelo schema do kind antes de ficar acessível. O envelope não pode mascarar
payload.id diferente, campo desconhecido ou versão diferente da fonte.

As arestas do payload são refs nominais. No contexto do snapshot manifest,
cada ref deve resolver exatamente um nó do kind permitido e da revisão
congelada. Targets múltiplos no registry são alternativas de tipo, não licença
para escolher um de dois nós com o mesmo ID. A ordem das ref_lists permanece
observável; duplicatas são proibidas onde o tipo representa conjunto.

O graph declara cada aresta material efetivamente presente, inclusive membros
de coleção e relações auxiliares. A enumeração é confrontada com os payloads,
não tomada como completa por ter sido escrita pelo autor. Cada edge vincula
source/field/target e predicados que provam a relação. O fingerprint sozinho
não atende economic_links. Ausência de campo opcional deve ser observada quando
a prova depende dela; não simular um campo inexistente com valor null.

## 3. Predicados, tipos e obrigações

Argumentos são uniões fechadas: nó, conjunto, campo tipado, campo do claim,
literal tipado, selector/projeção de campo, template revisado, policy parcial revisada ou chaves
de ordenação. Nenhum argumento contém código, condição, SQL ou expressão
arbitrária. Paths são arrays de segmentos e resolvem em compile; não são
strings interpretadas em runtime. O tipo declarado do literal deve coincidir
com seu valor e com a assinatura do operador, sem coerção.

A projeção extrai um campo tipado de cada nó de um conjunto explicitamente
enumerado; não filtra, calcula ou ordena. Como sequence, preserva a ordem dos
aliases e valores repetidos. Como set, exige que os valores já sejam distintos;
duplicatas falham em vez de serem eliminadas. Campos ausentes falham. Essa é
a resolução de operandos sequence/set do registry, não um operador financeiro.

Assinatura, aridade e semântica vêm do operator registry. Cada variável nominal
repetida precisa unificar; scalar não inclui objeto/coleção. Nome de operador
conhecido com argumentos incompatíveis falha. Predicados associam uma das onze
obrigações e um dos doze átomos ratificados, sem colapsar átomos em grupos.
Essa associação também é conferida pela semântica do operador e dos operandos:
o autor não pode chamar uma comparação de dinheiro de prova de identidade.

obligations contém cada obrigação exatamente uma vez. predicates e checks
referenciam evidências de atendimento, nunca autorizam dispensar a obrigação.
Os checks enumerados no schema são responsabilidades gerais do futuro gate:
binding do claim/registry; identidade; fingerprint integral; vínculo tipado de
sujeito e período; leitura temporal; completude de fonte/coleção; estado;
conjunto exato; consumo de todas as arestas; trace observado e vínculo do pai.
Não são novos operadores nem expressões configuráveis de fórmulas.

O gate confronta essas referências com as obrigações derivadas do registry e
payloads. Listas vazias não significam not_applicable. A ausência só pode ser
deduzida da inexistência estrutural do objeto correspondente, conforme NEXT-00.
Remover check/predicado necessário falha, mesmo se o JSON continuar válido.

O argumento edge resolve a entrada source/field/target contra o payload real,
inclusive membership quando field é uma lista. O autor não pode criar uma
aresta ausente por declará-la no grafo. ref_set é uma vista explícita de uma
ref_list já sem duplicatas: resolve cada ID como nó nominal antes de comparar
conjuntos. Essa vista não elimina duplicatas nem apaga a ordem observada no log.
period_literal contém uma janela civil explicitamente autorada e tipada; o
grafo deve ligá-la ao claim e aos campos/policy que justificam seus limites.
Presença do literal não prova essa relação nem permite derivá-la do oracle.

Na proposta v2, windows/period_ref/period_bound oferecem uma única resolução
dos limites para inclusão/exclusão. Gramática, cinco relações civis e falhas
estão em temporal-relations-decision-v1.md. Não há expressão de fórmula em
windows. A assinatura do registry e a revisão das relações continuam
obrigatórias; schema não basta.

## 4. Contrato de observação

Período, sujeito e filtros usados no cálculo também são inputs explícitos.
O registry pode declarar input_kind claim_context, cardinalidade one, ligado
ao claim imutável daquela invocação pelo binding fechado `{kind: claim_context}`.
Não aceita outro claim_id fornecido pelo evaluator. O host fornece esse contexto
por handle instrumentado, versionado pelo hash do claim contract. Todos os
campos do contexto são materiais; o schema de claim é sua autoridade de tipo.
required_claim_reads registra os paths lidos por fase. Não há leitura gratuita
do descriptor nem um segundo resultado/role normativo armazenado nele.

trace_contract contém requisitos separados de derivation e proof. Cada fase
declara nós, campos, arestas, operações estruturais e seleção esperados. A
execução futura observa ambos pelo mesmo recorder. Nenhum desses requisitos
é um trace produzido pelo evaluator. R permanece fora desse documento de
observação e é validado separadamente com o oracle.

required_reads identifica pares node/path; repetições da mesma leitura no log
não inventam outra evidência. A projeção de cobertura compara o conjunto exato
desses pares, enquanto o log preserva ordem e multiplicidade da execução.
required_structural enumera existência, keys, iterator, índice, ordem,
membership, cardinalidade/length, seleção, traversal e terminação antecipada.
O resultado de cada observação vem de I; a representação é do recorder.
Não se presume que observar length equivale a ler os membros ou sua ordem.

No perfil N02-G de relações materiais admitidas, follow(field) e
traverse(edge_id) observam a travessia pelo evento I/traverse com source,
field, edge_id e target. A obrigação canônica dessa observação é a aresta
em required_edges da fase. Não há uma segunda observação estrutural criada
implicitamente para a mesma travessia. A leitura do valor da referência é
um get distinto e exige required_reads (ou required_claim_reads, quando
aplicável); nem get nem traversal substitui a outra operação.

required_structural cobre as operações estruturais efetivamente realizadas
além da resolução de aresta, como cardinalidade, enumeração, ordem e
membership de listas. Resolver membros não cobre essas operações. A presença
de traversal no enum estrutural não cria uma segunda obrigação automática
nem autoriza tratá-lo como alias de required_edges. Uma declaração explícita
de required_structural/traversal não pode ser ignorada ou satisfeita por
conveniência; enquanto não houver semântica/projeção própria suportada para
tal declaração neste perfil, ela deve impedir aceitação.

Aplicação candidata da regra revisada no hash
122b9f7decdb83a925c657fe8f6d642b73cb7651: ao selecionar pela categoria efetiva
de uma compensação, declarar o campo que identifica a compra compensada e
sua aresta material, inclusive para candidatos excluídos. A referência deve
concordar com o ID do alvo consumido. Autoria definida pela semântica e pelas
relações antes da execução, nunca pelo actual/oracle. Parecer documental APTO
para implementar; não constitui GO do código nem do N02-G.

Toda leitura causal, escalar ou estrutural, deve estar coberta pela fase correta;
leitura ausente/extra, campo non_material ou aresta ignorada impede aprovação.
selected_nodes e required_nodes são conceitos distintos: um registro examinado
para exclusão pertence às leituras, mas pode estar fora da seleção financeira.
required_nodes é o inventário de nós examinados/consumidos na fase.
required_selections coincide exatamente com os pares candidate_set/selected_set
das operações atribuídas àquela fase pela regra de bindings abaixo.
selected_nodes é a união exata dos sets dessas operações, observada pelo
recorder por fase. Não copiar a seleção autorada nem tratar leitura como
seleção. Em grafo derivado sem selections, selected_nodes é vazio;
os pais consumidos diretamente permanecem em required_nodes/required_reads.
Nenhum nó adicional pode ser admitido só para inflar a prova; seus papéis devem
ser necessários aos operands ou às obrigações explicitamente justificadas.

### Dependências transitivas consumidas pela fórmula

O inventário da fase inclui dados materialmente consumidos por dependências
transitivas da fórmula, não somente aqueles ligados como roles diretos.
Resolver uma referência não dispensa declarar leituras/identidades do alvo
que o cálculo realmente usa, nem exige automaticamente ler todo o alvo.
Quando a fórmula usa a população familiar exata como filtro, declarar a
leitura de members, cardinalidade e enumeração em ordem, além de cada relação
material admitida de membro. Os campos/identidades dos membros não entram só
por serem alvos dessas arestas. As expectativas são fixadas pela semântica e
pelos bindings/relações autorados antes da execução, nunca pelo actual/oracle.
Isso não copia a closure de proof para derivation nem altera seleção financeira.

Aplicação local candidata: população familiar alcançada por budget.family_id
em safe_daily_pace, conforme proposta documental revisada no hash
f27c504086aad13a035c71021a34ff7f6ff2606b. Parecer APTO para implementar o
desenho, não GO do código; auditoria do candidato executável ainda obrigatória.

### Seleção por fase — correção normativa N02G-SB-001

`selections` continua sendo a autoria completa da escolha financeira, inclusive
predicados dos selecionados e exclusões. Proof deve executar **todas** essas
seleções e cobrir todos os candidatos, seus campos e estruturas causais. Essa
obrigação não pode ser removida porque a derivation usa um operando já ligado.

Antes da execução, cada par é classificado pelos operand_bindings do claim:

- Havendo exatamente um role `node_set` cujo roster coincide, inclusive ordem,
  com o candidate_set, a seleção é obrigatória também em derivation.
- Sem esse role, somente é admitido o caso prebound: selected_set não vazio e
  cada membro explicitamente ligado por um role `node`. Essa seleção pertence
  apenas a proof. A derivation consome esses operandos e mantém seus
  required_nodes/required_reads, sem afirmar uma seleção que não executa.
- Mais de um role candidato, ou ausência de um dos dois bindings acima, falha
  fechado. Não escolher role por resultado, nome de métrica ou fact_key.

required_selections de cada fase deve ser exatamente a lista classificada;
selected_nodes é sua união, vazia se não há operação de seleção nessa fase.
Não confundir ausência de seleção com uma seleção executada cujo resultado é
vazio: a segunda ainda exige eventos e cobertura dos candidatos examinados.
Toda fase com seleção cobre todos os candidatos em required_nodes e reads,
incluindo excluídos. O binding prebound não dispensa a prova da escolha e não
autoriza preencher derivation com eventos de proof ou de resolução estática.

A regra é declaração de obrigação anterior à execução, nunca comparação
preenchida a partir do actual. A aceitação final continua exigindo ambas as
fases e todos os demais gates; ausência de seleção derivacional não concede
aceitação parcial. Esta correção foi autorizada por Daniel em 2026-09-18 e
permanece candidata à auditoria focal antes de ratificação/GO.

Fingerprint exige os campos materiais completos do nó. Esses acessos pertencem
à fase proof e devem aparecer em seu contrato, mesmo quando a fórmula lê apenas
alguns deles. A representação de trace de leituras compostas deve preservar as
operações sobre estrutura; uma leitura do container não substitui observação
dos campos realmente usados. O schema não afirma implementar instrumentação.

## 5. Pais e hash de resultado derivado

Um nó validated_parent referencia fact_key de outro grafo autorado. A referência
usa uma aresta derived_from cujo source reservado `claim` identifica o claim
do grafo, field referencia o role no registry e target é o alias do pai.
`claim` não pode ser usado como alias de snapshot nem representar output R.
A relação material_ref continua exigindo source como alias de snapshot.
A dependência
forma a DAG estática e usa o papel de operando já definido no metric evaluator
registry. Não contém result, result_hash fictício ou fingerprint esperado
inventado. A execução dessa dependência só pode prosseguir depois de existir
recibo interno de validação do pai na mesma execution_id, associado pelo TCB
ao claim e grafo exatos. O objeto de autoria não pode ir direto ao evaluator.

O recibo pertence ao estado interno de validação, separado de L/T. Ele registra
identidade, hashes dos contratos/grafo/snapshots e o resultado funcional já
aceito. O recorder não copia R para L/T para construir esse recibo. Quando o
resultado anterior vira operando de outra invocação, o host disponibiliza um
snapshot derived_claim somente após validar o recibo. As leituras posteriores
desse input são instrumentadas por I na nova invocação.

O preimage de result_hash é o objeto canônico abaixo, com domínio fechado:

```
{
  domain: "financasbot.validated-derived-result.v1",
  claim_contract_hash,
  graph_contract_hash,
  metric_registry_hash,
  claim_id,
  fact_key,
  evaluator_ref,
  result: { unit, kind, value },
  operand_bindings,
  primary_inputs: [{ alias, kind, ref_id, version, semantic_fingerprint }],
  parents: [{ role_id, fact_key, evaluator_version, result_hash }]
}
```

Cada digest é medido/resolvido contra a autoridade correspondente. Os hashes
de contrato/grafo abrangem os documentos de autoria completos, sem incluir
resultados de execução, recibos ou o result_hash em construção. Não há ciclo
criptográfico. evaluator_ref é referência ao registry, não tabela duplicada
de contract hash/artifact root/roles. O registry de execução deve conter os
roots realmente medidos antes de qualquer resultado ser aceito.

Canonical JSON segue as regras aprovadas de canonicalValue: keys ordenadas e
arrays preservados. primary_inputs usa aliases em ordem lexical explícita;
parents usa a ordem de roles declarada pelo registry. operand_bindings preserva
ordem em qualquer operando ordenado. Troca de papel, pai, membro, descriptor,
período ou resultado muda o hash. Não ordenar pais pelo valor calculado.

O snapshot derived_claim possui a identidade adicional ratificada
(fact_key, evaluator_version, result_hash); seu id interno continua ligado ao
claim. Seu fingerprint é medido sobre o payload material, depois de construir
o hash do resultado. O result_hash não usa esse fingerprint como preimage.
Pais vazios exigem prova primária completa pelo grafo anterior validado;
ciclos, pai sem recibo ou recibo de outra execução falham.

O compile de autoria valida somente a DAG e suas referências declaradas.
Aceitar resultado derivado exige adicionalmente a execução validada descrita
aqui; PASS estrutural não simula esse recibo nem libera a fase executável.

## 6. Validação desta preparação

Os schemas serão conferidos contra o corpus completo, exemplos de tipos e
mutantes estruturais. Isso não executa predicados, materialização de traces,
closure, receipts ou propriedades metamórficas. A revisão integral precisa
confrontar os 76 grafos e a suficiência de suas obrigações antes do motor.

Evidência local em 2026-09-10: 122 checks da projeção de campos/obrigatoriedade
e dos registros primários, com adição de campo desconhecido rejeitada em cada
registro. As 76 fact_keys foram aceitas pela grammar corrigida S/M/F/N; quatro
chaves inválidas foram rejeitadas. O manifest possui 114 snapshots com shape
válido e IDs únicos, e suas 201 referências materiais resolvem em kinds
permitidos. Seus 114 fingerprints foram medidos com canonicalValue/digest.
Os hashes das duas fontes foram medidos nos blobs Git congelados.

O graph schema passou em 11 checks de shape: um exemplo estrutural positivo e
dez recusas (result no trace_contract, campo desconhecido, operador eval, path
livre, produtor evaluator, reads ausentes, operação estrutural desconhecida,
fact_key fora do corpus lexical, hash fornecido no nó de pai e check arbitrário).
O exemplo positivo não é um dos 76 grafos: vínculos e obrigações foram dados
temporários de formato, sem validação semântica. Os digests repetidos desse
exemplo não foram usados no manifest publicado. Não houve execução financeira,
compiler, recorder ou suíte de mutações nesta preparação.

Evidência final do candidato: o manifest foi estendido para 115 snapshots e
três fontes, incluindo evaluation_policy versionada. Os 115 fingerprints,
cinco hashes de autoridades e 39 hashes de evaluator contracts foram medidos.
Os 76 grafos satisfizeram o schema; suas referências, partições, 4.422 arestas
materiais, 16.266 leituras e 1.047 comparações literais foram confrontadas sem
divergência mecânica. Essa evidência não executa predicados, witnesses ou motor.
````

## docs/contracts/next/provenance-v2/material-field-registry-v1.json

SHA-256 ee7ef3eff146bc2e9cea2cc986c398371acbff3cf35d858ced8386a9758a4d62; Git blob 03d53deb88eae3317dc1c0f58f7af552bd8b12bf; bytes 10998.

```json
{
  "registry_id": "material_field_registry",
  "registry_version": 1,
  "stage": "authoring",
  "closed_world": true,
  "semantics": "registry-semantics-v1.md",
  "field_classes": ["identity","dimension","edge","non_material"],
  "types": ["id","text","date","month","datetime","integer","positive_integer","nonnegative_integer","money_minor","boolean","enum","digest","ref","ref_list","typed_period","typed_result","role_ref_list"],
  "envelope_fields": {"ref_id":{"class":"identity","type":"id","required":true},"kind":{"class":"identity","type":"id","required":true},"version":{"class":"identity","type":"digest","required":true}},
  "kinds": {
    "family": {"origin":"families","fields":{"id":{"class":"identity","type":"id","required":true},"label":{"class":"non_material","type":"text","required":true,"reason":"display_only"},"members":{"class":"edge","type":"ref_list","required":true,"targets":["person"]}}},
    "person": {"origin":"people","fields":{"id":{"class":"identity","type":"id","required":true},"label":{"class":"non_material","type":"text","required":true,"reason":"display_only"},"family_id":{"class":"edge","type":"ref","required":true,"targets":["family"]}}},
    "account": {"origin":"accounts","fields":{"id":{"class":"identity","type":"id","required":true},"label":{"class":"non_material","type":"text","required":true,"reason":"display_only"},"owner_id":{"class":"edge","type":"ref","required":true,"targets":["person"]},"type":{"class":"dimension","type":"enum","required":true,"values":["checking","reserve"]},"opening_balance_minor":{"class":"dimension","type":"money_minor","required":true},"opening_balance_as_of":{"class":"dimension","type":"date","required":true}}},
    "card": {"origin":"cards","fields":{"id":{"class":"identity","type":"id","required":true},"label":{"class":"non_material","type":"text","required":true,"reason":"display_only"},"owner_id":{"class":"edge","type":"ref","required":true,"targets":["person"]},"closing_day":{"class":"dimension","type":"positive_integer","required":true,"maximum":31},"due_day":{"class":"dimension","type":"positive_integer","required":true,"maximum":31}}},
    "category": {"origin":"categories","fields":{"id":{"class":"identity","type":"id","required":true},"label":{"class":"non_material","type":"text","required":true,"reason":"display_only"},"kind":{"class":"dimension","type":"enum","required":true,"values":["expense","income","neutral","compensation"]},"budget_class":{"class":"dimension","type":"enum","required":false,"values":["essential","flexible"]}}},
    "event": {"origin":"events","fields":{"id":{"class":"identity","type":"id","required":true},"date":{"class":"dimension","type":"date","required":true},"person_id":{"class":"edge","type":"ref","required":true,"targets":["person"]},"account_id":{"class":"edge","type":"ref","required":false,"targets":["account"]},"card_id":{"class":"edge","type":"ref","required":false,"targets":["card"]},"category_id":{"class":"edge","type":"ref","required":true,"targets":["category"]},"amount_minor":{"class":"dimension","type":"money_minor","required":true},"state":{"class":"dimension","type":"enum","required":true,"values":["confirmed","projected"]},"merchant_key":{"class":"edge","type":"ref","required":false,"targets":["merchant_identity"]},"compensates":{"class":"edge","type":"ref","required":false,"targets":["event"]},"transfer_pair":{"class":"edge","type":"ref","required":false,"targets":["transfer_identity"]},"settles_card_id":{"class":"edge","type":"ref","required":false,"targets":["card"]},"installment_plan":{"class":"edge","type":"ref","required":false,"targets":["installment_plan"]},"installment_number":{"class":"dimension","type":"positive_integer","required":false},"installment_total":{"class":"dimension","type":"positive_integer","required":false}}},
    "budget": {"origin":"budgets","fields":{"id":{"class":"identity","type":"id","required":true},"family_id":{"class":"edge","type":"ref","required":true,"targets":["family"]},"category_id":{"class":"edge","type":"ref","required":true,"targets":["category"]},"period":{"class":"dimension","type":"month","required":true},"limit_minor":{"class":"dimension","type":"money_minor","required":true},"evidence_state":{"class":"dimension","type":"enum","required":true,"values":["confirmed"]},"source":{"class":"edge","type":"ref","required":true,"targets":["source_origin"]}}},
    "bill": {"origin":"bills","fields":{"id":{"class":"identity","type":"id","required":true},"person_id":{"class":"edge","type":"ref","required":true,"targets":["person"]},"due_date":{"class":"dimension","type":"date","required":true},"amount_minor":{"class":"dimension","type":"money_minor","required":true},"status":{"class":"dimension","type":"enum","required":true,"values":["open","paid","cancelled"]},"evidence_state":{"class":"dimension","type":"enum","required":true,"values":["confirmed","projected"]},"source":{"class":"edge","type":"ref","required":true,"targets":["source_origin"]}}},
    "source_state": {"origin":"source_states","fields":{"id":{"class":"identity","type":"id","required":true},"source":{"class":"edge","type":"ref","required":true,"targets":["source_origin"]},"period":{"class":"dimension","type":"month","required":false},"entity_id":{"class":"edge","type":"ref","required":false,"targets":["family","person","account","card"]},"category_id":{"class":"edge","type":"ref","required":false,"targets":["category"]},"coverage":{"class":"dimension","type":"enum","required":true,"values":["complete","partial","unavailable"]},"event_count":{"class":"dimension","type":"nonnegative_integer","required":false}}},
    "proposal": {"origin":"proposals","fields":{"id":{"class":"identity","type":"id","required":true},"state":{"class":"dimension","type":"enum","required":true,"values":["presented","expired","superseded"]},"expires_at":{"class":"dimension","type":"datetime","required":true},"source_version":{"class":"identity","type":"id","required":true}}},
    "reminder": {"origin":"reminders","fields":{"id":{"class":"identity","type":"id","required":true},"person_id":{"class":"edge","type":"ref","required":true,"targets":["person"]},"scheduled_at":{"class":"dimension","type":"date","required":true}}},
    "calendar_event": {"origin":"calendar_events","fields":{"id":{"class":"identity","type":"id","required":true},"person_id":{"class":"edge","type":"ref","required":true,"targets":["person"]},"scheduled_at":{"class":"dimension","type":"date","required":true}}},
    "side_effect": {"origin":"side_effects","fields":{"id":{"class":"identity","type":"id","required":true},"turn_id":{"class":"edge","type":"ref","required":true,"targets":["turn"]}}},
    "merchant_rule": {"origin":"merchant_rules","fields":{"id":{"class":"identity","type":"id","required":true},"merchant_key":{"class":"edge","type":"ref","required":true,"targets":["merchant_identity"]},"category_id":{"class":"edge","type":"ref","required":true,"targets":["category"]},"application":{"class":"dimension","type":"enum","required":true,"values":["suggestion","automatic"]},"reversible":{"class":"dimension","type":"boolean","required":true},"evidence_state":{"class":"dimension","type":"enum","required":true,"values":["confirmed"]},"source":{"class":"edge","type":"ref","required":true,"targets":["source_origin"]}}},
    "fixture": {"origin":"authored_auxiliary","fields":{"id":{"class":"identity","type":"id","required":true},"synthetic":{"class":"dimension","type":"boolean","required":true},"closed_world":{"class":"dimension","type":"boolean","required":true},"currency":{"class":"dimension","type":"enum","required":true,"values":["BRL"]},"fixed_clock":{"class":"dimension","type":"datetime","required":true}}},
    "collection": {"origin":"authored_auxiliary","fields":{"id":{"class":"identity","type":"id","required":true},"fixture_id":{"class":"edge","type":"ref","required":true,"targets":["fixture"]},"collection_name":{"class":"dimension","type":"enum","required":true,"values":["families","people","accounts","cards","categories","events","budgets","bills","source_states","proposals","reminders","calendar_events","side_effects","merchant_rules"]},"members":{"class":"edge","type":"ref_list","required":true,"targets":["family","person","account","card","category","event","budget","bill","source_state","proposal","reminder","calendar_event","side_effect","merchant_rule"]}}},
    "source_origin": {"origin":"authored_auxiliary","fields":{"id":{"class":"identity","type":"id","required":true},"fixture_id":{"class":"edge","type":"ref","required":true,"targets":["fixture"]}}},
    "merchant_identity": {"origin":"authored_auxiliary","fields":{"id":{"class":"identity","type":"id","required":true},"fixture_id":{"class":"edge","type":"ref","required":true,"targets":["fixture"]}}},
    "transfer_identity": {"origin":"authored_auxiliary","fields":{"id":{"class":"identity","type":"id","required":true},"members":{"class":"edge","type":"ref_list","required":true,"targets":["event"]}}},
    "installment_plan": {"origin":"authored_auxiliary","fields":{"id":{"class":"identity","type":"id","required":true},"members":{"class":"edge","type":"ref_list","required":true,"targets":["event"]},"installment_total":{"class":"dimension","type":"positive_integer","required":true}}},
    "turn": {"origin":"authored_auxiliary","fields":{"id":{"class":"identity","type":"id","required":true},"fixture_id":{"class":"edge","type":"ref","required":true,"targets":["fixture"]}}},
    "derived_claim": {"origin":"prior_validated_result","fields":{"id":{"class":"identity","type":"id","required":true},"fact_key":{"class":"identity","type":"id","required":true},"evaluator_version":{"class":"identity","type":"positive_integer","required":true},"result_hash":{"class":"identity","type":"digest","required":true},"result":{"class":"dimension","type":"typed_result","required":true},"parents":{"class":"edge","type":"role_ref_list","required":true,"targets":["derived_claim"]}}},
    "evaluation_policy": {"origin":"authored_policy","fields":{"id":{"class":"identity","type":"id","required":true},"calendar":{"class":"dimension","type":"enum","required":true,"values":["proleptic_gregorian"]},"timezone":{"class":"dimension","type":"enum","required":true,"values":["America/Sao_Paulo"]},"ranking_key":{"class":"dimension","type":"enum","required":true,"values":["validated_consumption_minor"]},"ranking_direction":{"class":"dimension","type":"enum","required":true,"values":["asc","desc"]},"ranking_tie_break":{"class":"dimension","type":"enum","required":true,"values":["lexical_internal_id"]},"daily_pace_divisor":{"class":"dimension","type":"positive_integer","required":true},"daily_pace_rounding":{"class":"dimension","type":"enum","required":true,"values":["floor","ceil","round"]},"daily_pace_start":{"class":"dimension","type":"date","required":true},"daily_pace_end":{"class":"dimension","type":"date","required":true},"daily_pace_as_of":{"class":"dimension","type":"date","required":true}}}
  }
}
```

## docs/contracts/next/provenance-v2/metric-evaluator-registry-v1.json

SHA-256 a1fde4b01b9f68bdd2550305305ca2ffe8f750af0351b29b12bf3bb5afdb3c88; Git blob 04d77636b5d491f9c9d00df4f59d9a50d9b54d8d; bytes 45195.

```json
{
  "schema_version": 1,
  "registry_id": "metric_evaluator_registry",
  "registry_version": 1,
  "stage": "authoring",
  "entries": [
    {
      "evaluator_id": "account_balance",
      "evaluator_version": 1,
      "metric": "account_balance",
      "unit": "BRL_minor",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/account_balance.json",
      "evaluator_contract_hash": "sha256:b509b72bf341c36f60cc7fda7030602a0fdfcc1dae24a0687cb899d4b15a35ed",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "account",
          "semantic_role": "opening_balance",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "events",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        }
      ],
      "witness_contract_ids": [
        "account_balance_discriminant"
      ]
    },
    {
      "evaluator_id": "balance_delta",
      "evaluator_version": 1,
      "metric": "balance_delta",
      "unit": "BRL_minor",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/balance_delta.json",
      "evaluator_contract_hash": "sha256:39a1a87663a54e5d37c8e1a35f02596330d48b71e70a431fa27fe58193339a1e",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "event",
          "semantic_role": "source",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "balance_delta_discriminant"
      ]
    },
    {
      "evaluator_id": "bills_open",
      "evaluator_version": 1,
      "metric": "bills_open",
      "unit": "BRL_minor",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/bills_open.json",
      "evaluator_contract_hash": "sha256:9fed67d44d48c3965043964769ce6481b876a793decf16901e7e666261593faf",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "bills",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "family",
          "semantic_role": "scope",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "bills_open_discriminant"
      ]
    },
    {
      "evaluator_id": "budget_class_consumption",
      "evaluator_version": 1,
      "metric": "budget_class_consumption",
      "unit": "BRL_minor",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/budget_class_consumption.json",
      "evaluator_contract_hash": "sha256:e336d72e581c06401fd6ef3cc5b041b6c2b7ad56745fe25ff5980ca763ed8561",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "events",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "categories",
          "semantic_role": "evidence",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "family",
          "semantic_role": "scope",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "budget_class_consumption_discriminant"
      ]
    },
    {
      "evaluator_id": "calendar_event_count",
      "evaluator_version": 1,
      "metric": "calendar_event_count",
      "unit": "count",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/calendar_event_count.json",
      "evaluator_contract_hash": "sha256:fa3f00c0a019ab0702f94b2c97f2e575509c308343d2208c992ac677e98097b8",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "entries",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "collection",
          "semantic_role": "coverage",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "person",
          "semantic_role": "scope",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "calendar_event_count_discriminant"
      ]
    },
    {
      "evaluator_id": "category_budget_remaining",
      "evaluator_version": 1,
      "metric": "category_budget_remaining",
      "unit": "BRL_minor",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/category_budget_remaining.json",
      "evaluator_contract_hash": "sha256:4e4f9e38d7495397799578d1f73366d067ef5a5a7ca47879071dacd3669436c5",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "budget",
          "semantic_role": "limit",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "events",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "categories",
          "semantic_role": "evidence",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "family",
          "semantic_role": "scope",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "category_budget_remaining_discriminant"
      ]
    },
    {
      "evaluator_id": "category_consumption",
      "evaluator_version": 1,
      "metric": "category_consumption",
      "unit": "BRL_minor",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/category_consumption.json",
      "evaluator_contract_hash": "sha256:b6e8edf05cb8acc7155bea56d84c4827c4fa9c97b54cacdc13805602468564a3",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "events",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "categories",
          "semantic_role": "evidence",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "family",
          "semantic_role": "scope",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "category_consumption_discriminant"
      ]
    },
    {
      "evaluator_id": "category_spent",
      "evaluator_version": 1,
      "metric": "category_spent",
      "unit": "BRL_minor",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/category_spent.json",
      "evaluator_contract_hash": "sha256:f168ac80d9ac17abf516e76729105c03a6efcf1743bdd4459e94f0c75f851baa",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "events",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "categories",
          "semantic_role": "evidence",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "family",
          "semantic_role": "scope",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "category_spent_discriminant"
      ]
    },
    {
      "evaluator_id": "consumption_by_instrument",
      "evaluator_version": 1,
      "metric": "consumption_by_instrument",
      "unit": "BRL_minor",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/consumption_by_instrument.json",
      "evaluator_contract_hash": "sha256:e32bc36ae9642c1db0d0eb6dce05c3861a80d967b974613eafc8fc6a341dbd37",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "events",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "categories",
          "semantic_role": "evidence",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "instrument",
          "semantic_role": "scope",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "consumption_by_instrument_discriminant"
      ]
    },
    {
      "evaluator_id": "consumption_difference",
      "evaluator_version": 1,
      "metric": "consumption_difference",
      "unit": "BRL_minor",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/consumption_difference.json",
      "evaluator_contract_hash": "sha256:f5d8eda523ba66305010fed07ca6c657b76c486774eac052c3151ddcc85546f7",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "left",
          "semantic_role": "left",
          "input_kind": "parent_claim",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "right",
          "semantic_role": "right",
          "input_kind": "parent_claim",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "consumption_difference_discriminant"
      ]
    },
    {
      "evaluator_id": "consumption_effect",
      "evaluator_version": 1,
      "metric": "consumption_effect",
      "unit": "BRL_minor",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/consumption_effect.json",
      "evaluator_contract_hash": "sha256:7dd62b47dcc336828376d44ed54c996f4ef21d27f9f21cfa142cd3722e24eab1",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "events",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "categories",
          "semantic_role": "evidence",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        }
      ],
      "witness_contract_ids": [
        "consumption_effect_discriminant"
      ]
    },
    {
      "evaluator_id": "consumption_total",
      "evaluator_version": 1,
      "metric": "consumption_total",
      "unit": "BRL_minor",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/consumption_total.json",
      "evaluator_contract_hash": "sha256:4e07fd44f09a99168cd92d6a9caa664ef5c847146aae64905b859c4cf313be3a",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "events",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "categories",
          "semantic_role": "evidence",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "family",
          "semantic_role": "scope",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "consumption_total_discriminant"
      ]
    },
    {
      "evaluator_id": "due_bill_ids",
      "evaluator_version": 1,
      "metric": "due_bill_ids",
      "unit": "entity_ids",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/due_bill_ids.json",
      "evaluator_contract_hash": "sha256:a9ddce797a0f90184dad2e3fd50cb20d6534648485ed9f27592cbfe03782ebf4",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "bills",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "person",
          "semantic_role": "scope",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "due_bill_ids_discriminant"
      ]
    },
    {
      "evaluator_id": "due_bills_total",
      "evaluator_version": 1,
      "metric": "due_bills_total",
      "unit": "BRL_minor",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/due_bills_total.json",
      "evaluator_contract_hash": "sha256:aaa1e469986731240f28f22ffe4559c4a663b13d2a01718f61e866c3e1f62e86",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "bills",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "person",
          "semantic_role": "scope",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "due_bills_total_discriminant"
      ]
    },
    {
      "evaluator_id": "eligible_event_count",
      "evaluator_version": 1,
      "metric": "eligible_event_count",
      "unit": "count",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/eligible_event_count.json",
      "evaluator_contract_hash": "sha256:f338fef9c95fa8ec005b95b6aa8b21069bb1c04f03ccc777d672bf5f161f4951",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "source",
          "semantic_role": "source",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "events",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "categories",
          "semantic_role": "evidence",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "family",
          "semantic_role": "scope",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "eligible_event_count_discriminant"
      ]
    },
    {
      "evaluator_id": "gross_consumption",
      "evaluator_version": 1,
      "metric": "gross_consumption",
      "unit": "BRL_minor",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/gross_consumption.json",
      "evaluator_contract_hash": "sha256:787b125062623e9ffaea8d248ef0554a93e23458275566390c88e88b5e3d00d6",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "events",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "categories",
          "semantic_role": "evidence",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        }
      ],
      "witness_contract_ids": [
        "gross_consumption_discriminant"
      ]
    },
    {
      "evaluator_id": "income_minus_open_bills",
      "evaluator_version": 1,
      "metric": "income_minus_open_bills",
      "unit": "BRL_minor",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/income_minus_open_bills.json",
      "evaluator_contract_hash": "sha256:1d87b903b2e41e0bdfa4edc5ec1708c1e10e81dfa9cff30560dd5206b4637b86",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "left",
          "semantic_role": "left",
          "input_kind": "parent_claim",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "right",
          "semantic_role": "right",
          "input_kind": "parent_claim",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "income_minus_open_bills_discriminant"
      ]
    },
    {
      "evaluator_id": "income_realized",
      "evaluator_version": 1,
      "metric": "income_realized",
      "unit": "BRL_minor",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/income_realized.json",
      "evaluator_contract_hash": "sha256:3098c37340e1c22e6137691c498c1e1b3756a8319f2187eb17fa0c16e8abedea",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "events",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "categories",
          "semantic_role": "evidence",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "family",
          "semantic_role": "scope",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "income_realized_discriminant"
      ]
    },
    {
      "evaluator_id": "installments_projected",
      "evaluator_version": 1,
      "metric": "installments_projected",
      "unit": "count",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/installments_projected.json",
      "evaluator_contract_hash": "sha256:924d883d776a5f0da128ee931d96ff27aa1f9effa5ca86d3c81f21af35bf4988",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "events",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "plan",
          "semantic_role": "scope",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "installments_projected_discriminant"
      ]
    },
    {
      "evaluator_id": "installments_projected_amount",
      "evaluator_version": 1,
      "metric": "installments_projected_amount",
      "unit": "BRL_minor",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/installments_projected_amount.json",
      "evaluator_contract_hash": "sha256:6cd3f810f260c6fa94b4509c1d8e043866accc8a0314446fde59d51b28763f0a",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "events",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "plan",
          "semantic_role": "scope",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "installments_projected_amount_discriminant"
      ]
    },
    {
      "evaluator_id": "installments_realized",
      "evaluator_version": 1,
      "metric": "installments_realized",
      "unit": "count",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/installments_realized.json",
      "evaluator_contract_hash": "sha256:0115cf8a9d922e43b6b393cecc521a9659a41f75b68591b579eed01490c5d3f7",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "events",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "plan",
          "semantic_role": "scope",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "installments_realized_discriminant"
      ]
    },
    {
      "evaluator_id": "installments_realized_amount",
      "evaluator_version": 1,
      "metric": "installments_realized_amount",
      "unit": "BRL_minor",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/installments_realized_amount.json",
      "evaluator_contract_hash": "sha256:8987257b8976651b8e82c7e414fda6472ba5aa60ce58befaef3a5661956eb8a7",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "events",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "plan",
          "semantic_role": "scope",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "installments_realized_amount_discriminant"
      ]
    },
    {
      "evaluator_id": "invoice_payment_amount",
      "evaluator_version": 1,
      "metric": "invoice_payment_amount",
      "unit": "BRL_minor",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/invoice_payment_amount.json",
      "evaluator_contract_hash": "sha256:8b0b104d9d9623fc65847611532eb69810464f2869b5f9421557f07441562928",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "event",
          "semantic_role": "source",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "invoice_payment_amount_discriminant"
      ]
    },
    {
      "evaluator_id": "invoice_payment_consumption_effect",
      "evaluator_version": 1,
      "metric": "invoice_payment_consumption_effect",
      "unit": "BRL_minor",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/invoice_payment_consumption_effect.json",
      "evaluator_contract_hash": "sha256:613b290689de669c2e5ab437fe12ce6f495bdfb766ed848d7716ea50f6b9c7c6",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "events",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "categories",
          "semantic_role": "evidence",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        }
      ],
      "witness_contract_ids": [
        "invoice_payment_consumption_effect_discriminant"
      ]
    },
    {
      "evaluator_id": "invoice_payment_target_card",
      "evaluator_version": 1,
      "metric": "invoice_payment_target_card",
      "unit": "entity_ids",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/invoice_payment_target_card.json",
      "evaluator_contract_hash": "sha256:a58d6ee1480662230142a532903facd36cbbe3b7f67705dc01345574a324acfa",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "event",
          "semantic_role": "source",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "card",
          "semantic_role": "target",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "invoice_payment_target_card_discriminant"
      ]
    },
    {
      "evaluator_id": "merchant_rule_ids",
      "evaluator_version": 1,
      "metric": "merchant_rule_ids",
      "unit": "entity_ids",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/merchant_rule_ids.json",
      "evaluator_contract_hash": "sha256:b3ec5d6c4003258cd25431a709197c37a1cf7f70e10125b2f0c8d15bba95abbe",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "rules",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "merchant",
          "semantic_role": "scope",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "merchant_rule_ids_discriminant"
      ]
    },
    {
      "evaluator_id": "movement_ids",
      "evaluator_version": 1,
      "metric": "movement_ids",
      "unit": "entity_ids",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/movement_ids.json",
      "evaluator_contract_hash": "sha256:4c41b92c8bcf511536461ec676441babe401ef3906144beb960150605a786b96",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "events",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "account",
          "semantic_role": "scope",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "movement_ids_discriminant"
      ]
    },
    {
      "evaluator_id": "net_consumption",
      "evaluator_version": 1,
      "metric": "net_consumption",
      "unit": "BRL_minor",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/net_consumption.json",
      "evaluator_contract_hash": "sha256:1bbf9d81f52b9766156ab60ddd4d8da961b958440e32df12dc0ce315c76fe891",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "events",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "categories",
          "semantic_role": "evidence",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        }
      ],
      "witness_contract_ids": [
        "net_consumption_discriminant"
      ]
    },
    {
      "evaluator_id": "owned_cards",
      "evaluator_version": 1,
      "metric": "owned_cards",
      "unit": "entity_ids",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/owned_cards.json",
      "evaluator_contract_hash": "sha256:67b68e3e0d27a0973127411a960953345eeff0c8adc001ea25001fa2ddbbfc3a",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "cards",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "person",
          "semantic_role": "scope",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "owned_cards_discriminant"
      ]
    },
    {
      "evaluator_id": "projected_installments",
      "evaluator_version": 1,
      "metric": "projected_installments",
      "unit": "BRL_minor",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/projected_installments.json",
      "evaluator_contract_hash": "sha256:d5c649bcaf00627f23d1930ac78de03dfb41f2fb5e0c11cb26d1e177f57feaee",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "events",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "plans",
          "semantic_role": "evidence",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "family",
          "semantic_role": "scope",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "projected_installments_discriminant"
      ]
    },
    {
      "evaluator_id": "ranking_winner",
      "evaluator_version": 1,
      "metric": "ranking_winner",
      "unit": "entity_ids",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/ranking_winner.json",
      "evaluator_contract_hash": "sha256:aabe7e1423046863612c8d0ca4816bdc91e98d02c0f1cd2ce1a8a0e4f2b51889",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "left",
          "semantic_role": "left",
          "input_kind": "parent_claim",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "right",
          "semantic_role": "right",
          "input_kind": "parent_claim",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "people",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "sort_key",
          "semantic_role": "sort_key",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "sort_direction",
          "semantic_role": "sort_direction",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "ranking_winner_discriminant"
      ]
    },
    {
      "evaluator_id": "refund_amount",
      "evaluator_version": 1,
      "metric": "refund_amount",
      "unit": "BRL_minor",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/refund_amount.json",
      "evaluator_contract_hash": "sha256:2dafc200e53dfa069e3b7e12d42c0ead14db1f2b020768ec5fd2a6fcda4c515c",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "events",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        }
      ],
      "witness_contract_ids": [
        "refund_amount_discriminant"
      ]
    },
    {
      "evaluator_id": "reminder_count",
      "evaluator_version": 1,
      "metric": "reminder_count",
      "unit": "count",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/reminder_count.json",
      "evaluator_contract_hash": "sha256:16b84262decf1b92536ed697b09844e0c76f5153f4570e8ec49bc550010f8514",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "entries",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "collection",
          "semantic_role": "coverage",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "person",
          "semantic_role": "scope",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "reminder_count_discriminant"
      ]
    },
    {
      "evaluator_id": "safe_daily_pace",
      "evaluator_version": 1,
      "metric": "safe_daily_pace",
      "unit": "BRL_minor",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/safe_daily_pace.json",
      "evaluator_contract_hash": "sha256:195e3968cc2f7f7dd2e46fdcb2619c19892b5c56a27d0e3c62f76fe08ba9a14d",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "budget",
          "semantic_role": "limit",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "events",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "categories",
          "semantic_role": "evidence",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "clock",
          "semantic_role": "clock",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "policy",
          "semantic_role": "policy",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "safe_daily_pace_discriminant"
      ]
    },
    {
      "evaluator_id": "side_effect_count",
      "evaluator_version": 1,
      "metric": "side_effect_count",
      "unit": "count",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/side_effect_count.json",
      "evaluator_contract_hash": "sha256:7813782950888e8af5c51403d313fc9b950c463e7109681e9cf30d4cd97345a2",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "entries",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "collection",
          "semantic_role": "coverage",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "turn",
          "semantic_role": "scope",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "side_effect_count_discriminant"
      ]
    },
    {
      "evaluator_id": "similar_event_ids",
      "evaluator_version": 1,
      "metric": "similar_event_ids",
      "unit": "entity_ids",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/similar_event_ids.json",
      "evaluator_contract_hash": "sha256:1f994c3caaea2a7c7fa968a49f872bb2b3f4d8ce0b959fc25bf26bbe5dac6817",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "events",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "merchant",
          "semantic_role": "scope",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "similar_event_ids_discriminant"
      ]
    },
    {
      "evaluator_id": "source_coverage",
      "evaluator_version": 1,
      "metric": "source_coverage",
      "unit": "state",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/source_coverage.json",
      "evaluator_contract_hash": "sha256:fab2872015cb21a449c05e355f7ba967865078ed963c869e84dd96da4b1e0111",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "source",
          "semantic_role": "source",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "source_coverage_discriminant"
      ]
    },
    {
      "evaluator_id": "statement_payment_correspondence",
      "evaluator_version": 1,
      "metric": "statement_payment_correspondence",
      "unit": "state",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/statement_payment_correspondence.json",
      "evaluator_contract_hash": "sha256:3ffc3131e77bc4ead3248a3a5b49108093d16ddbbcb94635d49d7fc59d1171ec",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "event",
          "semantic_role": "source",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "card",
          "semantic_role": "target",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "statement_payment_correspondence_discriminant"
      ]
    },
    {
      "evaluator_id": "statement_total",
      "evaluator_version": 1,
      "metric": "statement_total",
      "unit": "BRL_minor",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/statement_total.json",
      "evaluator_contract_hash": "sha256:cca2c51e9d89ef572d069eb019d30924fc41409724c1d07abc7d2a215ce1d002",
      "artifact_status": "not_built",
      "roles": [
        {
          "role_id": "context",
          "semantic_role": "scope",
          "input_kind": "claim_context",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "events",
          "semantic_role": "population",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "categories",
          "semantic_role": "evidence",
          "input_kind": "node_set",
          "cardinality": "many",
          "ordered": true
        },
        {
          "role_id": "card",
          "semantic_role": "scope",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        },
        {
          "role_id": "policy",
          "semantic_role": "policy",
          "input_kind": "node",
          "cardinality": "one",
          "ordered": false
        }
      ],
      "witness_contract_ids": [
        "statement_total_discriminant"
      ]
    }
  ]
}
```

## docs/contracts/next/provenance-v2/metric-evaluator-registry.schema.json

SHA-256 de5eb3828b8faaf58eeddc9f90d9342b509f86fd32ea8b66f9174448c536e066; Git blob 36b1e9e93d741fb6e2f493c15234869bbe07a09b; bytes 3354.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "urn:financasbot:next:metric-evaluator-registry:1",
  "title": "N02-F metric evaluator registry document: authoring is never executable",
  "type": "object", "additionalProperties": false,
  "required": ["schema_version", "registry_id", "registry_version", "stage", "entries"],
  "properties": {
    "schema_version": {"const": 1},
    "registry_id": {"const": "metric_evaluator_registry"},
    "registry_version": {"type": "integer", "minimum": 1},
    "stage": {"enum": ["authoring", "execution"]},
    "entries": {"type": "array", "minItems": 1, "items": {"$ref": "#/definitions/entry"}}
  },
  "allOf": [
    {"if": {"properties": {"stage": {"const": "authoring"}}}, "then": {"properties": {"entries": {"items": {"properties": {"artifact_status": {"const": "not_built"}}, "not": {"required": ["evaluator_artifact_root"]}}}}}},
    {"if": {"properties": {"stage": {"const": "execution"}}}, "then": {"properties": {"entries": {"items": {"required": ["evaluator_artifact_root"], "properties": {"artifact_status": {"const": "bound"}}}}}}}
  ],
  "definitions": {
    "name": {"type": "string", "pattern": "^[a-z][a-z0-9_]{0,63}$"},
    "digest": {"type": "string", "pattern": "^sha256:[a-f0-9]{64}$"},
    "role": {
      "type": "object", "additionalProperties": false,
      "required": ["role_id", "semantic_role", "input_kind", "cardinality", "ordered"],
      "properties": {
        "role_id": {"$ref": "#/definitions/name"},
        "semantic_role": {"enum": ["population", "scope", "period", "policy", "coverage", "source", "target", "left", "right", "numerator", "denominator", "sort_key", "sort_direction", "opening_balance", "limit", "clock", "evidence"]},
        "input_kind": {"enum": ["node", "node_set", "parent_claim", "claim_context"]},
        "cardinality": {"enum": ["one", "many"]},
        "ordered": {"type": "boolean"}
      },
      "allOf": [
        {"if": {"properties": {"input_kind": {"enum": ["node", "parent_claim", "claim_context"]}}}, "then": {"properties": {"cardinality": {"const": "one"}, "ordered": {"const": false}}}},
        {"if": {"properties": {"input_kind": {"const": "node_set"}}}, "then": {"properties": {"cardinality": {"const": "many"}}}}
      ]
    },
    "entry": {
      "type": "object", "additionalProperties": false,
      "required": ["evaluator_id", "evaluator_version", "metric", "unit", "contract_path", "evaluator_contract_hash", "artifact_status", "roles", "witness_contract_ids"],
      "properties": {
        "evaluator_id": {"$ref": "#/definitions/name"},
        "evaluator_version": {"type": "integer", "minimum": 1},
        "metric": {"$ref": "#/definitions/name"},
        "unit": {"enum": ["BRL_minor", "count", "entity_ids", "state"]},
        "contract_path": {"type": "string", "pattern": "^docs/contracts/next/provenance-v2/evaluator-contracts/[a-z][a-z0-9_-]*\\.json$"},
        "evaluator_contract_hash": {"$ref": "#/definitions/digest"},
        "artifact_status": {"enum": ["not_built", "bound"]},
        "evaluator_artifact_root": {"$ref": "#/definitions/digest"},
        "roles": {"type": "array", "minItems": 1, "items": {"$ref": "#/definitions/role"}},
        "witness_contract_ids": {"type": "array", "minItems": 1, "uniqueItems": true, "items": {"$ref": "#/definitions/name"}}
      }
    }
  }
}
```

## docs/contracts/next/provenance-v2/n02f-correction-review-v1.md

SHA-256 814ddcb57991b6b315fa102a38df0b118447015398b10d934c8967b1e7f5b4ff; Git blob ba6f3d6090e1217785d50ac5b66954d0223e46d9; bytes 5417.

```markdown
# N02-F — correção documental H-01 / H-02 / M-01

Data: 2026-09-10. Candidato corrigido; REAUDITORIA PENDENTE.
Parent exigido: ef04368c95af33a12c0e8b5b286c0e0b01ae27f8.
O parecer integral fornecido por Daniel foi NO-GO, com dois HIGH e um MEDIUM.
Este relatório não atribui execução independente ao Codex nem aprova a mudança.

## Confronto crítico

Nota histórica: este relatório registra o delta N02-F de 2026-09-10. A correção
N02G-SB-001 posterior distingue seleção por fase no §4 do
graph-binding-contract-v1.md; a presença de required_selections em ambas as
fases não significa que suas listas devam ser idênticas. Esta nota não altera
o parecer histórico nem reabre as correções de estado e tempo abaixo.

H-01 confirmado: seis guards de exclusão dos dois safe_daily_pace comparavam
event.state com estimated, fora do enum do input. Corrigidos para confirmed,
com input_evidence_state explícito e sem alterar estimated no claim.

H-02 confirmado como insuficiência relacional de autoria. O exemplo do parecer
reparava também um predicado, portanto não era mutant isolado de snapshot.
Mesmo assim, o pacote permitia autorar limites inconsistentes. Agora as duas
janelas de conta resolvem diretamente os campos; três ciclos de cartão e
duas janelas de ritmo diário usam relações genéricas entre suas autoridades.
Cinco relações novas são propostas em operator-registry-v2.json, com ADR e
propriedades. A versão 1 permanece intacta. NEXT-00 §8 prevê essa via de revisão.

M-01 confirmado: proof.selected_nodes copiava required_nodes nos 76 grafos.
Agora ambas as fases contêm required_selections e selected_nodes coincide
exatamente com a união dos conjuntos efetivamente selecionados por essas
operações. required_nodes conserva examinados, inclusive excluídos/coverage.
Três grafos derivados não possuem seleção: seus pais ficam nos reads/required_nodes.

## Objeto preservado

Sem mudança nos 76 claims, 115 snapshots, fixture/oracle v1, policy financeira,
fórmulas executáveis, kernel, pins, runtime, dependências do projeto, bot, canal,
produção ou dados reais. Os únicos contratos funcionais editados são
account_balance, statement_total e safe_daily_pace. Seus três hashes e o hash
do registry foram atualizados. Contratos executáveis permanecem not_built.

O path de ratificação correto é
docs/plans/workstreams/financasbot-next-00-architecture-ratification-v1.md.
O pedido anterior omitiu architecture no nome; não criar artefato para corrigir
esse erro do prompt. A autoridade existente foi mantida.

## Checks locais executados

Verificação descartável de autoria com Ajv 8.17.1 instalado somente em logs/
ignorado, sem package.json/lockfile versionado. Foi usado o canonicalValue/digest
existente para fingerprints. Contas civis de controle e mutações em memória
confrontaram os predicados temporais específicos; não constituem compiler,
graph evaluator ou mutation suite do runtime.

- 43 documentos validados por schema: pacote de grafos, claims, registry,
  witnesses de evaluator e 39 contratos funcionais.
- 76 grafos/claims e partições; 152 contratos de fase com seleção coerente.
- 115 envelopes de snapshot e fingerprints; cinco hashes de autoridades e
  39 hashes de contratos.
- 32 operadores: 27 anteriores preservados, cinco novos propostos.
- 11 janelas nomeadas nos sete grafos temporais.
- 4.422 arestas materiais e seis derived_from, total 4.428.
- 16.270 requisitos de leitura: acréscimo de calendar/timezone na derivação
  dos dois safe_daily_pace.
- 52 assertions locais de regressão/data/schema, incluindo reprodução da
  antiga tautologia, inputs elegíveis, corte de conta, fechamento/vencimento,
  janela anterior, clock/divisor/mês, bissexto, virada de ano, clamp recusado,
  data local diferente da UTC, range inclusivo e formas inválidas do schema.

Comparação JSON contra o parent confirmou identidade, nodes, sets, edges e
authoring_sources inalterados em 76/76 grafos; predicados dos outros 69 grafos
inalterados. Em required_reads, somente quatro adições: calendar/timezone na
derivação dos dois safe_daily_pace. Demais reads, required_nodes, arestas de
trace e operações estruturais anteriores permaneceram iguais.
git diff --check e node scripts/agent/validateAgentWorkflow.js: OK.

22 casos documentais em temporal-and-selection-witnesses-v1.json descrevem
requisitos futuros. Seu status permanece authoring/not_executed. Os checks
locais acima não os promovem a witnesses instrumentados executados.
Não repetir suíte funcional ampla para delta exclusivamente documental.

## Reauditoria reduzida por delta

Lote A: H-01 e M-01, contrato/schema, alterações de seleção nos 76 grafos,
preservação de claims/inputs e vínculos estruturais/hashes. Foco nas diferenças;
os sete vínculos temporais ficam pendentes para B.

Lote B: H-02, registry v2/ADR/propriedades e somente S-05#1#1, S-06#1#1,
S-12#1#1, M-05#1#1, F-03#2#1, M-13#1#3 e M-13#1#6. Confrontar as relações
com os campos do manifest/claim/policy e os três contratos funcionais.

Consolidação: mesmo SHA/parent em ambos os lotes, inventário completo do delta,
nenhum finding aberto, nenhuma fronteira entre lotes sem revisão. Produzir
um único veredito final; lote incompleto não é aprovação parcial de execução.
Nenhuma autorização de compiler/evaluator ou NEXT-03 decorre deste relatório.
```

## docs/contracts/next/provenance-v2/operator-registry-v1.json

SHA-256 24427e9dd30a5b2d5eaf6f9e2651869e8582df4b5dc9eab54b924a0b687e33b6; Git blob 3e5dc8aa873746c08857fbe4f56862eea48df7ef; bytes 3034.

```json
{
  "registry_id": "operator_registry",
  "registry_version": 1,
  "stage": "authoring",
  "result_type": "boolean",
  "unknown_operator": "reject",
  "coercion": "forbidden",
  "semantics": "registry-semantics-v1.md",
  "operators": [
    {"id":"eq","args":["scalar:T","scalar:T"],"semantics":"typed_equal"},
    {"id":"not_eq","args":["scalar:T","scalar:T"],"semantics":"typed_unequal"},
    {"id":"same_identity","args":["node:K","node:K"],"semantics":"same_kind_ref_version"},
    {"id":"kind_is","args":["node:K","kind_literal"],"semantics":"exact_kind"},
    {"id":"state_is","args":["state_path","state_literal"],"semantics":"exact_state"},
    {"id":"fingerprint_is","args":["node:K","digest_literal"],"semantics":"measured_material_fingerprint_equal"},
    {"id":"date_in_period","args":["date","period"],"semantics":"contains_civil_date"},
    {"id":"period_eq","args":["period","period"],"semantics":"equal_period_kind_and_fields"},
    {"id":"same_month","args":["date","date"],"semantics":"equal_year_and_month"},
    {"id":"range_contains","args":["range","range"],"semantics":"contains_range_with_boundaries"},
    {"id":"all_dates_in_period","args":["sequence:date","period"],"semantics":"every_date_contained"},
    {"id":"set_eq","args":["set:T","set:T"],"semantics":"exact_typed_members"},
    {"id":"set_subset","args":["set:T","set:T","partial_coverage_policy_ref"],"semantics":"subset_requires_reviewed_partial_policy"},
    {"id":"cardinality_eq","args":["set:T","nonnegative_integer"],"semantics":"exact_set_cardinality"},
    {"id":"all_match","args":["set:node:K","predicate_template_ref"],"semantics":"all_members_satisfy_expanded_conjunction"},
    {"id":"none_match","args":["set:node:K","predicate_template_ref"],"semantics":"no_member_satisfies_expanded_conjunction"},
    {"id":"field_eq","args":["field_path:T","field_path:T"],"semantics":"typed_field_equal"},
    {"id":"join_eq","args":["set:node:A","set:node:B","field_selector:A:T","field_selector:B:T"],"semantics":"equal_unique_key_domains_and_pairwise_join"},
    {"id":"ref_targets_node","args":["edge_ref:K","node:K"],"semantics":"edge_resolves_exact_target"},
    {"id":"same_field","args":["set:node:K","field_selector:K:T"],"semantics":"one_distinct_field_value"},
    {"id":"edge_pair_complete","args":["set:node:K","edge_selector:K:J","node:J"],"semantics":"two_distinct_nodes_share_exact_identity"},
    {"id":"edge_target_in_set","args":["edge_ref:K","set:node:K"],"semantics":"resolved_target_member"},
    {"id":"sum_eq","args":["sequence:number:U","number:U"],"semantics":"checked_same_unit_sum_equal"},
    {"id":"count_eq","args":["sequence:T","nonnegative_integer"],"semantics":"sequence_length_equal"},
    {"id":"opposite_sign","args":["number:U","number:U"],"semantics":"strict_nonzero_opposite_signs"},
    {"id":"abs_eq","args":["number:U","number:U"],"semantics":"absolute_values_equal"},
    {"id":"ordered_by","args":["sequence:node:K","sort_key_descriptor:K"],"semantics":"lexicographic_order_with_explicit_ties"}
  ]
}
```

## docs/contracts/next/provenance-v2/operator-registry-v2.json

SHA-256 d28eb3dfbf7ea6949c1ff696e9f9bc7aa572c3ab8433a06d316936092a2dcac7; Git blob 78c1b42f4a8075172360c91660b27041e1265787; bytes 5531.

```json
{
  "registry_id": "operator_registry",
  "registry_version": 2,
  "stage": "authoring",
  "result_type": "boolean",
  "unknown_operator": "reject",
  "coercion": "forbidden",
  "semantics": "registry-semantics-v1.md",
  "operators": [
    {
      "id": "eq",
      "args": [
        "scalar:T",
        "scalar:T"
      ],
      "semantics": "typed_equal"
    },
    {
      "id": "not_eq",
      "args": [
        "scalar:T",
        "scalar:T"
      ],
      "semantics": "typed_unequal"
    },
    {
      "id": "same_identity",
      "args": [
        "node:K",
        "node:K"
      ],
      "semantics": "same_kind_ref_version"
    },
    {
      "id": "kind_is",
      "args": [
        "node:K",
        "kind_literal"
      ],
      "semantics": "exact_kind"
    },
    {
      "id": "state_is",
      "args": [
        "state_path",
        "state_literal"
      ],
      "semantics": "exact_state"
    },
    {
      "id": "fingerprint_is",
      "args": [
        "node:K",
        "digest_literal"
      ],
      "semantics": "measured_material_fingerprint_equal"
    },
    {
      "id": "date_in_period",
      "args": [
        "date",
        "period"
      ],
      "semantics": "contains_civil_date"
    },
    {
      "id": "period_eq",
      "args": [
        "period",
        "period"
      ],
      "semantics": "equal_period_kind_and_fields"
    },
    {
      "id": "same_month",
      "args": [
        "date",
        "date"
      ],
      "semantics": "equal_year_and_month"
    },
    {
      "id": "range_contains",
      "args": [
        "range",
        "range"
      ],
      "semantics": "contains_range_with_boundaries"
    },
    {
      "id": "all_dates_in_period",
      "args": [
        "sequence:date",
        "period"
      ],
      "semantics": "every_date_contained"
    },
    {
      "id": "set_eq",
      "args": [
        "set:T",
        "set:T"
      ],
      "semantics": "exact_typed_members"
    },
    {
      "id": "set_subset",
      "args": [
        "set:T",
        "set:T",
        "partial_coverage_policy_ref"
      ],
      "semantics": "subset_requires_reviewed_partial_policy"
    },
    {
      "id": "cardinality_eq",
      "args": [
        "set:T",
        "nonnegative_integer"
      ],
      "semantics": "exact_set_cardinality"
    },
    {
      "id": "all_match",
      "args": [
        "set:node:K",
        "predicate_template_ref"
      ],
      "semantics": "all_members_satisfy_expanded_conjunction"
    },
    {
      "id": "none_match",
      "args": [
        "set:node:K",
        "predicate_template_ref"
      ],
      "semantics": "no_member_satisfies_expanded_conjunction"
    },
    {
      "id": "field_eq",
      "args": [
        "field_path:T",
        "field_path:T"
      ],
      "semantics": "typed_field_equal"
    },
    {
      "id": "join_eq",
      "args": [
        "set:node:A",
        "set:node:B",
        "field_selector:A:T",
        "field_selector:B:T"
      ],
      "semantics": "equal_unique_key_domains_and_pairwise_join"
    },
    {
      "id": "ref_targets_node",
      "args": [
        "edge_ref:K",
        "node:K"
      ],
      "semantics": "edge_resolves_exact_target"
    },
    {
      "id": "same_field",
      "args": [
        "set:node:K",
        "field_selector:K:T"
      ],
      "semantics": "one_distinct_field_value"
    },
    {
      "id": "edge_pair_complete",
      "args": [
        "set:node:K",
        "edge_selector:K:J",
        "node:J"
      ],
      "semantics": "two_distinct_nodes_share_exact_identity"
    },
    {
      "id": "edge_target_in_set",
      "args": [
        "edge_ref:K",
        "set:node:K"
      ],
      "semantics": "resolved_target_member"
    },
    {
      "id": "sum_eq",
      "args": [
        "sequence:number:U",
        "number:U"
      ],
      "semantics": "checked_same_unit_sum_equal"
    },
    {
      "id": "count_eq",
      "args": [
        "sequence:T",
        "nonnegative_integer"
      ],
      "semantics": "sequence_length_equal"
    },
    {
      "id": "opposite_sign",
      "args": [
        "number:U",
        "number:U"
      ],
      "semantics": "strict_nonzero_opposite_signs"
    },
    {
      "id": "abs_eq",
      "args": [
        "number:U",
        "number:U"
      ],
      "semantics": "absolute_values_equal"
    },
    {
      "id": "ordered_by",
      "args": [
        "sequence:node:K",
        "sort_key_descriptor:K"
      ],
      "semantics": "lexicographic_order_with_explicit_ties"
    },
    {
      "id": "civil_date_matches",
      "args": [
        "datetime",
        "date",
        "timezone",
        "calendar"
      ],
      "semantics": "instant_local_civil_date_equal"
    },
    {
      "id": "civil_offset_matches",
      "args": [
        "date",
        "integer",
        "civil_unit",
        "date",
        "calendar"
      ],
      "semantics": "exact_civil_offset_without_clamp"
    },
    {
      "id": "month_bounds_match",
      "args": [
        "month",
        "date",
        "date",
        "calendar"
      ],
      "semantics": "exact_first_and_last_civil_date_of_month"
    },
    {
      "id": "day_of_month_matches",
      "args": [
        "date",
        "positive_integer",
        "calendar"
      ],
      "semantics": "exact_civil_day_of_month"
    },
    {
      "id": "inclusive_day_count_matches",
      "args": [
        "range",
        "positive_integer",
        "calendar"
      ],
      "semantics": "inclusive_civil_date_cardinality"
    }
  ]
}
```

## docs/contracts/next/provenance-v2/phase-composition-profile-v1.json

SHA-256 204962b56fd0833f3d15ac030e6c55dd3866c8fd18ded5e24784f729e41be2bc; Git blob 425f446669a2eb15fcc3595116c301d6376e453c; bytes 15194.

```json
{
  "schema_version": 1,
  "profile_id": "phase_composition",
  "profile_version": 1,
  "reviewed_proposal_sha": "8741d57e39a60b1bf5e8390bd8aa585df3f212c5",
  "registry_path": "docs/contracts/next/provenance-v2/metric-evaluator-registry-v1.json",
  "entries": [
    {
      "evaluator_id": "account_balance",
      "evaluator_version": 1,
      "metric": "account_balance",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/account_balance.json",
      "evaluator_contract_hash": "sha256:b509b72bf341c36f60cc7fda7030602a0fdfcc1dae24a0687cb899d4b15a35ed",
      "derivation_mode": "formula_plus_selection_guards"
    },
    {
      "evaluator_id": "balance_delta",
      "evaluator_version": 1,
      "metric": "balance_delta",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/balance_delta.json",
      "evaluator_contract_hash": "sha256:39a1a87663a54e5d37c8e1a35f02596330d48b71e70a431fa27fe58193339a1e",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "bills_open",
      "evaluator_version": 1,
      "metric": "bills_open",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/bills_open.json",
      "evaluator_contract_hash": "sha256:9fed67d44d48c3965043964769ce6481b876a793decf16901e7e666261593faf",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "budget_class_consumption",
      "evaluator_version": 1,
      "metric": "budget_class_consumption",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/budget_class_consumption.json",
      "evaluator_contract_hash": "sha256:e336d72e581c06401fd6ef3cc5b041b6c2b7ad56745fe25ff5980ca763ed8561",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "calendar_event_count",
      "evaluator_version": 1,
      "metric": "calendar_event_count",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/calendar_event_count.json",
      "evaluator_contract_hash": "sha256:fa3f00c0a019ab0702f94b2c97f2e575509c308343d2208c992ac677e98097b8",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "category_budget_remaining",
      "evaluator_version": 1,
      "metric": "category_budget_remaining",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/category_budget_remaining.json",
      "evaluator_contract_hash": "sha256:4e4f9e38d7495397799578d1f73366d067ef5a5a7ca47879071dacd3669436c5",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "category_consumption",
      "evaluator_version": 1,
      "metric": "category_consumption",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/category_consumption.json",
      "evaluator_contract_hash": "sha256:b6e8edf05cb8acc7155bea56d84c4827c4fa9c97b54cacdc13805602468564a3",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "category_spent",
      "evaluator_version": 1,
      "metric": "category_spent",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/category_spent.json",
      "evaluator_contract_hash": "sha256:f168ac80d9ac17abf516e76729105c03a6efcf1743bdd4459e94f0c75f851baa",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "consumption_by_instrument",
      "evaluator_version": 1,
      "metric": "consumption_by_instrument",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/consumption_by_instrument.json",
      "evaluator_contract_hash": "sha256:e32bc36ae9642c1db0d0eb6dce05c3861a80d967b974613eafc8fc6a341dbd37",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "consumption_difference",
      "evaluator_version": 1,
      "metric": "consumption_difference",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/consumption_difference.json",
      "evaluator_contract_hash": "sha256:f5d8eda523ba66305010fed07ca6c657b76c486774eac052c3151ddcc85546f7",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "consumption_effect",
      "evaluator_version": 1,
      "metric": "consumption_effect",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/consumption_effect.json",
      "evaluator_contract_hash": "sha256:7dd62b47dcc336828376d44ed54c996f4ef21d27f9f21cfa142cd3722e24eab1",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "consumption_total",
      "evaluator_version": 1,
      "metric": "consumption_total",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/consumption_total.json",
      "evaluator_contract_hash": "sha256:4e07fd44f09a99168cd92d6a9caa664ef5c847146aae64905b859c4cf313be3a",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "due_bill_ids",
      "evaluator_version": 1,
      "metric": "due_bill_ids",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/due_bill_ids.json",
      "evaluator_contract_hash": "sha256:a9ddce797a0f90184dad2e3fd50cb20d6534648485ed9f27592cbfe03782ebf4",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "due_bills_total",
      "evaluator_version": 1,
      "metric": "due_bills_total",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/due_bills_total.json",
      "evaluator_contract_hash": "sha256:aaa1e469986731240f28f22ffe4559c4a663b13d2a01718f61e866c3e1f62e86",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "eligible_event_count",
      "evaluator_version": 1,
      "metric": "eligible_event_count",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/eligible_event_count.json",
      "evaluator_contract_hash": "sha256:f338fef9c95fa8ec005b95b6aa8b21069bb1c04f03ccc777d672bf5f161f4951",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "gross_consumption",
      "evaluator_version": 1,
      "metric": "gross_consumption",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/gross_consumption.json",
      "evaluator_contract_hash": "sha256:787b125062623e9ffaea8d248ef0554a93e23458275566390c88e88b5e3d00d6",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "income_minus_open_bills",
      "evaluator_version": 1,
      "metric": "income_minus_open_bills",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/income_minus_open_bills.json",
      "evaluator_contract_hash": "sha256:1d87b903b2e41e0bdfa4edc5ec1708c1e10e81dfa9cff30560dd5206b4637b86",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "income_realized",
      "evaluator_version": 1,
      "metric": "income_realized",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/income_realized.json",
      "evaluator_contract_hash": "sha256:3098c37340e1c22e6137691c498c1e1b3756a8319f2187eb17fa0c16e8abedea",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "installments_projected",
      "evaluator_version": 1,
      "metric": "installments_projected",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/installments_projected.json",
      "evaluator_contract_hash": "sha256:924d883d776a5f0da128ee931d96ff27aa1f9effa5ca86d3c81f21af35bf4988",
      "derivation_mode": "formula_plus_selection_guards"
    },
    {
      "evaluator_id": "installments_projected_amount",
      "evaluator_version": 1,
      "metric": "installments_projected_amount",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/installments_projected_amount.json",
      "evaluator_contract_hash": "sha256:6cd3f810f260c6fa94b4509c1d8e043866accc8a0314446fde59d51b28763f0a",
      "derivation_mode": "formula_plus_selection_guards"
    },
    {
      "evaluator_id": "installments_realized",
      "evaluator_version": 1,
      "metric": "installments_realized",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/installments_realized.json",
      "evaluator_contract_hash": "sha256:0115cf8a9d922e43b6b393cecc521a9659a41f75b68591b579eed01490c5d3f7",
      "derivation_mode": "formula_plus_selection_guards"
    },
    {
      "evaluator_id": "installments_realized_amount",
      "evaluator_version": 1,
      "metric": "installments_realized_amount",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/installments_realized_amount.json",
      "evaluator_contract_hash": "sha256:8987257b8976651b8e82c7e414fda6472ba5aa60ce58befaef3a5661956eb8a7",
      "derivation_mode": "formula_plus_selection_guards"
    },
    {
      "evaluator_id": "invoice_payment_amount",
      "evaluator_version": 1,
      "metric": "invoice_payment_amount",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/invoice_payment_amount.json",
      "evaluator_contract_hash": "sha256:8b0b104d9d9623fc65847611532eb69810464f2869b5f9421557f07441562928",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "invoice_payment_consumption_effect",
      "evaluator_version": 1,
      "metric": "invoice_payment_consumption_effect",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/invoice_payment_consumption_effect.json",
      "evaluator_contract_hash": "sha256:613b290689de669c2e5ab437fe12ce6f495bdfb766ed848d7716ea50f6b9c7c6",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "invoice_payment_target_card",
      "evaluator_version": 1,
      "metric": "invoice_payment_target_card",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/invoice_payment_target_card.json",
      "evaluator_contract_hash": "sha256:a58d6ee1480662230142a532903facd36cbbe3b7f67705dc01345574a324acfa",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "merchant_rule_ids",
      "evaluator_version": 1,
      "metric": "merchant_rule_ids",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/merchant_rule_ids.json",
      "evaluator_contract_hash": "sha256:b3ec5d6c4003258cd25431a709197c37a1cf7f70e10125b2f0c8d15bba95abbe",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "movement_ids",
      "evaluator_version": 1,
      "metric": "movement_ids",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/movement_ids.json",
      "evaluator_contract_hash": "sha256:4c41b92c8bcf511536461ec676441babe401ef3906144beb960150605a786b96",
      "derivation_mode": "formula_plus_selection_guards"
    },
    {
      "evaluator_id": "net_consumption",
      "evaluator_version": 1,
      "metric": "net_consumption",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/net_consumption.json",
      "evaluator_contract_hash": "sha256:1bbf9d81f52b9766156ab60ddd4d8da961b958440e32df12dc0ce315c76fe891",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "owned_cards",
      "evaluator_version": 1,
      "metric": "owned_cards",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/owned_cards.json",
      "evaluator_contract_hash": "sha256:67b68e3e0d27a0973127411a960953345eeff0c8adc001ea25001fa2ddbbfc3a",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "projected_installments",
      "evaluator_version": 1,
      "metric": "projected_installments",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/projected_installments.json",
      "evaluator_contract_hash": "sha256:d5c649bcaf00627f23d1930ac78de03dfb41f2fb5e0c11cb26d1e177f57feaee",
      "derivation_mode": "formula_plus_selection_guards"
    },
    {
      "evaluator_id": "ranking_winner",
      "evaluator_version": 1,
      "metric": "ranking_winner",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/ranking_winner.json",
      "evaluator_contract_hash": "sha256:aabe7e1423046863612c8d0ca4816bdc91e98d02c0f1cd2ce1a8a0e4f2b51889",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "refund_amount",
      "evaluator_version": 1,
      "metric": "refund_amount",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/refund_amount.json",
      "evaluator_contract_hash": "sha256:2dafc200e53dfa069e3b7e12d42c0ead14db1f2b020768ec5fd2a6fcda4c515c",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "reminder_count",
      "evaluator_version": 1,
      "metric": "reminder_count",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/reminder_count.json",
      "evaluator_contract_hash": "sha256:16b84262decf1b92536ed697b09844e0c76f5153f4570e8ec49bc550010f8514",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "safe_daily_pace",
      "evaluator_version": 1,
      "metric": "safe_daily_pace",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/safe_daily_pace.json",
      "evaluator_contract_hash": "sha256:195e3968cc2f7f7dd2e46fdcb2619c19892b5c56a27d0e3c62f76fe08ba9a14d",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "side_effect_count",
      "evaluator_version": 1,
      "metric": "side_effect_count",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/side_effect_count.json",
      "evaluator_contract_hash": "sha256:7813782950888e8af5c51403d313fc9b950c463e7109681e9cf30d4cd97345a2",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "similar_event_ids",
      "evaluator_version": 1,
      "metric": "similar_event_ids",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/similar_event_ids.json",
      "evaluator_contract_hash": "sha256:1f994c3caaea2a7c7fa968a49f872bb2b3f4d8ce0b959fc25bf26bbe5dac6817",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "source_coverage",
      "evaluator_version": 1,
      "metric": "source_coverage",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/source_coverage.json",
      "evaluator_contract_hash": "sha256:fab2872015cb21a449c05e355f7ba967865078ed963c869e84dd96da4b1e0111",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "statement_payment_correspondence",
      "evaluator_version": 1,
      "metric": "statement_payment_correspondence",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/statement_payment_correspondence.json",
      "evaluator_contract_hash": "sha256:3ffc3131e77bc4ead3248a3a5b49108093d16ddbbcb94635d49d7fc59d1171ec",
      "derivation_mode": "formula_only"
    },
    {
      "evaluator_id": "statement_total",
      "evaluator_version": 1,
      "metric": "statement_total",
      "contract_path": "docs/contracts/next/provenance-v2/evaluator-contracts/statement_total.json",
      "evaluator_contract_hash": "sha256:cca2c51e9d89ef572d069eb019d30924fc41409724c1d07abc7d2a215ce1d002",
      "derivation_mode": "formula_only"
    }
  ]
}
```

## docs/contracts/next/provenance-v2/predicate-templates-v1.json

SHA-256 15a1adfe3290b26808d3ee8cb1e1db36175f122df54cd2ef1474873ad5d8833f; Git blob f7bbb178d823c38dab2541e1a0778b269deca4bd; bytes 1387.

```json
{
  "schema_version": 1,
  "registry_id": "predicate_templates",
  "registry_version": 1,
  "stage": "authoring",
  "templates": [
    {
      "id": "date_within_period",
      "version": 1,
      "parameters": {
        "field": "field_selector:K:date",
        "period": "period"
      },
      "body": [
        {
          "op": "date_in_period",
          "args": [
            {
              "current_member_field_parameter": "field"
            },
            {
              "parameter": "period"
            }
          ]
        }
      ]
    },
    {
      "id": "field_equals_scalar",
      "version": 1,
      "parameters": {
        "field": "field_selector:K:T",
        "value": "scalar:T"
      },
      "body": [
        {
          "op": "eq",
          "args": [
            {
              "current_member_field_parameter": "field"
            },
            {
              "parameter": "value"
            }
          ]
        }
      ]
    },
    {
      "id": "field_has_state",
      "version": 1,
      "parameters": {
        "field": "field_selector:K:enum",
        "value": "enum"
      },
      "body": [
        {
          "op": "state_is",
          "args": [
            {
              "current_member_field_parameter": "field"
            },
            {
              "parameter": "value"
            }
          ]
        }
      ]
    }
  ]
}
```

## docs/contracts/next/provenance-v2/provenance-graph.schema.json

SHA-256 9e3c148c95d6fecd3d93f019ad5a5967126f8bf1cb9bde9d152c70c057a1740b; Git blob 5aa7ca4bbcc1d5e4e58fea43210aaaddf4716336; bytes 14785.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version","stage","contract_id","claim_contract","snapshot_manifest","material_registry","operator_registry","metric_evaluator_registry","graphs"],
  "properties": {"schema_version":{"const":2},"stage":{"const":"authoring"},"contract_id":{"$ref":"#/definitions/sourceRef"},"claim_contract":{"$ref":"#/definitions/authority"},"snapshot_manifest":{"$ref":"#/definitions/authority"},"material_registry":{"$ref":"#/definitions/authority"},"operator_registry":{"$ref":"#/definitions/authority"},"metric_evaluator_registry":{"$ref":"#/definitions/authority"},"graphs":{"type":"array","minItems":1,"uniqueItems":true,"items":{"$ref":"#/definitions/graph"}}},
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "urn:financasbot:next:provenance-graph:2",
  "title": "N02-F authored provenance graphs; never observed trace",
  "$comment": "Cross-reference typing, exact 76 fact keys, obligation completeness, predicate arity, DAG, phase coverage and parent receipts require semantic validation. JSON Schema alone never proves them.",
  "definitions": {
    "id": {"type":"string","pattern":"^[a-z][a-z0-9_]{0,63}$"},
    "digest": {"type":"string","pattern":"^sha256:[a-f0-9]{64}$"},
    "factKey": {"type":"string","pattern":"^[SMFN]-[0-9]{2}#[1-9][0-9]*#[1-9][0-9]*$"},
    "sourceRef": {"type":"string","pattern":"^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$"},
    "roles": {"type":"array","minItems":1,"uniqueItems":true,"items":{"enum":["value_input","scope_proof","coverage_proof","state_proof","link_proof"]}},
    "fieldPath": {"type":"object","additionalProperties":false,"required":["node","segments"],"properties":{"node":{"$ref":"#/definitions/id"},"segments":{"type":"array","minItems":1,"items":{"type":"string","pattern":"^[a-z][a-z0-9_]*$"}}}},
    "claimPath": {"type":"object","additionalProperties":false,"required":["segments"],"properties":{"segments":{"type":"array","minItems":1,"items":{"type":"string","pattern":"^[a-z][a-z0-9_]*$"}}}},
    "literal": {"type":"object","additionalProperties":false,"required":["type","value"],"properties":{"type":{"enum":["id","text","date","month","datetime","integer","money_minor","boolean","enum","digest","kind"]},"value":{"type":["string","integer","boolean"]}}},
    "reference": {"type":"object","additionalProperties":false,"required":["id","version","hash"],"properties":{"id":{"$ref":"#/definitions/id"},"version":{"type":"integer","minimum":1},"hash":{"$ref":"#/definitions/digest"}}},
    "node": {"oneOf":[{"type":"object","additionalProperties":false,"required":["binding","ref_id","kind","version","semantic_fingerprint","roles"],"properties":{"binding":{"const":"snapshot"},"ref_id":{"$ref":"#/definitions/sourceRef"},"kind":{"enum":["family","person","account","card","category","event","budget","bill","source_state","proposal","reminder","calendar_event","side_effect","merchant_rule","fixture","collection","source_origin","merchant_identity","transfer_identity","installment_plan","turn","evaluation_policy"]},"version":{"$ref":"#/definitions/digest"},"semantic_fingerprint":{"$ref":"#/definitions/digest"},"roles":{"$ref":"#/definitions/roles"}}},{"type":"object","additionalProperties":false,"required":["binding","kind","fact_key","roles","identity_resolution"],"properties":{"binding":{"const":"validated_parent"},"kind":{"const":"derived_claim"},"fact_key":{"$ref":"#/definitions/factKey"},"roles":{"$ref":"#/definitions/roles"},"identity_resolution":{"const":"same_execution_validated_parent_receipt"}}}]},
    "selector": {"type":"object","additionalProperties":false,"required":["kind","segments"],"properties":{"kind":{"enum":["family","person","account","card","category","event","budget","bill","source_state","proposal","reminder","calendar_event","side_effect","merchant_rule","fixture","collection","source_origin","merchant_identity","transfer_identity","installment_plan","turn","derived_claim","evaluation_policy"]},"segments":{"type":"array","minItems":1,"items":{"type":"string","pattern":"^[a-z][a-z0-9_]*$"}}}},
    "sort": {"type":"object","additionalProperties":false,"required":["keys","tie_break"],"properties":{"keys":{"type":"array","minItems":1,"uniqueItems":true,"items":{"type":"object","additionalProperties":false,"required":["selector","direction"],"properties":{"selector":{"$ref":"#/definitions/selector"},"direction":{"enum":["asc","desc"]}}}},"tie_break":{"const":"kind_ref_version"}}},
    "arg": {"oneOf":[{"type":"object","additionalProperties":false,"required":["node"],"properties":{"node":{"$ref":"#/definitions/id"}}},{"type":"object","additionalProperties":false,"required":["set"],"properties":{"set":{"$ref":"#/definitions/id"}}},{"type":"object","additionalProperties":false,"required":["field"],"properties":{"field":{"$ref":"#/definitions/fieldPath"}}},{"type":"object","additionalProperties":false,"required":["claim"],"properties":{"claim":{"$ref":"#/definitions/claimPath"}}},{"type":"object","additionalProperties":false,"required":["literal"],"properties":{"literal":{"$ref":"#/definitions/literal"}}},{"type":"object","additionalProperties":false,"required":["selector"],"properties":{"selector":{"$ref":"#/definitions/selector"}}},{"type":"object","additionalProperties":false,"required":["template","bindings"],"properties":{"template":{"$ref":"#/definitions/reference"},"bindings":{"type":"object","minProperties":1,"propertyNames":{"$ref":"#/definitions/id"},"additionalProperties":{"$ref":"#/definitions/arg"}}}},{"type":"object","additionalProperties":false,"required":["partial_policy"],"properties":{"partial_policy":{"$ref":"#/definitions/reference"}}},{"type":"object","additionalProperties":false,"required":["sort"],"properties":{"sort":{"$ref":"#/definitions/sort"}}},{"type":"object","additionalProperties":false,"required":["projection"],"properties":{"projection":{"type":"object","additionalProperties":false,"required":["set","selector","as"],"properties":{"set":{"$ref":"#/definitions/id"},"selector":{"$ref":"#/definitions/selector"},"as":{"enum":["sequence","set"]}}}}},{"type":"object","additionalProperties":false,"required":["edge"],"properties":{"edge":{"$ref":"#/definitions/id"}}},{"type":"object","additionalProperties":false,"required":["period_literal"],"properties":{"period_literal":{"$ref":"urn:financasbot:next:claim-contract:2#/definitions/period"}}},{"type":"object","additionalProperties":false,"required":["ref_set"],"properties":{"ref_set":{"type":"object","additionalProperties":false,"required":["field"],"properties":{"field":{"$ref":"#/definitions/fieldPath"}}}}},{"type":"object","additionalProperties":false,"required":["presence"],"properties":{"presence":{"$ref":"#/definitions/fieldPath"}}},{"type":"object","additionalProperties":false,"required":["period_ref"],"properties":{"period_ref":{"$ref":"#/definitions/id"}}},{"type":"object","additionalProperties":false,"required":["period_bound"],"properties":{"period_bound":{"type":"object","additionalProperties":false,"required":["period","bound"],"properties":{"period":{"$ref":"#/definitions/id"},"bound":{"enum":["start","end"]}}}}}]},
    "predicate": {"type":"object","additionalProperties":false,"required":["id","obligation","atom","op","args"],"properties":{"id":{"$ref":"#/definitions/id"},"obligation":{"enum":["claim_semantics","node_identity","semantic_integrity","subject_scope","period","time_basis","coverage","evidence_state","evidence_set","economic_links","derivation_trace"]},"atom":{"enum":["claim","identity","fingerprint","subject","period","time_basis","coverage","evidence_state","evidence_set","edge","trace","evaluator"]},"op":{"enum":["eq","not_eq","same_identity","kind_is","state_is","fingerprint_is","date_in_period","period_eq","same_month","range_contains","all_dates_in_period","set_eq","set_subset","cardinality_eq","all_match","none_match","field_eq","join_eq","ref_targets_node","same_field","edge_pair_complete","edge_target_in_set","sum_eq","count_eq","opposite_sign","abs_eq","ordered_by","civil_date_matches","civil_offset_matches","month_bounds_match","day_of_month_matches","inclusive_day_count_matches"]},"args":{"type":"array","minItems":1,"maxItems":5,"items":{"$ref":"#/definitions/arg"}}}},
    "edge": {"type":"object","additionalProperties":false,"required":["id","source","field","target","relation","proof_predicates"],"properties":{"id":{"$ref":"#/definitions/id"},"source":{"$ref":"#/definitions/id"},"field":{"type":"string","pattern":"^[a-z][a-z0-9_]*$"},"target":{"$ref":"#/definitions/id"},"relation":{"enum":["material_ref","derived_from"]},"proof_predicates":{"type":"array","minItems":1,"uniqueItems":true,"items":{"$ref":"#/definitions/id"}}}},
    "structural": {"type":"object","additionalProperties":false,"required":["node","operation","segments"],"properties":{"node":{"$ref":"#/definitions/id"},"operation":{"enum":["has","keys","iterator","index","order","membership","cardinality","length","selection","traversal","early_termination"]},"segments":{"type":"array","items":{"type":"string","pattern":"^[a-z][a-z0-9_]*$"}}}},
    "phase": {"type":"object","additionalProperties":false,"required":["required_nodes","required_reads","required_edges","required_structural","selected_nodes","evidence_set_mode","required_claim_reads","required_selections"],"properties":{"required_nodes":{"type":"array","minItems":0,"uniqueItems":true,"items":{"$ref":"#/definitions/id"}},"required_reads":{"type":"array","minItems":0,"uniqueItems":true,"items":{"$ref":"#/definitions/fieldPath"}},"required_edges":{"type":"array","minItems":0,"uniqueItems":true,"items":{"$ref":"#/definitions/id"}},"required_structural":{"type":"array","minItems":0,"uniqueItems":true,"items":{"$ref":"#/definitions/structural"}},"selected_nodes":{"type":"array","minItems":0,"uniqueItems":true,"items":{"$ref":"#/definitions/id"}},"evidence_set_mode":{"const":"exact"},"required_claim_reads":{"type":"array","uniqueItems":true,"items":{"$ref":"#/definitions/claimPath"}},"required_selections":{"type":"array","uniqueItems":true,"items":{"type":"object","additionalProperties":false,"required":["candidate_set","selected_set"],"properties":{"candidate_set":{"$ref":"#/definitions/id"},"selected_set":{"$ref":"#/definitions/id"}}}}}},
    "trace": {"type":"object","additionalProperties":false,"required":["derivation","proof","producer","result_channel"],"properties":{"derivation":{"$ref":"#/definitions/phase"},"proof":{"$ref":"#/definitions/phase"},"producer":{"const":"external_recorder"},"result_channel":{"const":"separate_R"}}},
    "authority": {"type":"object","additionalProperties":false,"required":["path","hash"],"properties":{"path":{"type":"string","pattern":"^docs/contracts/next/provenance-v2/[a-z0-9_./-]+\\.(json|md)$"},"hash":{"$ref":"#/definitions/digest"}}},
    "gateBinding": {"type":"object","additionalProperties":false,"required":["obligation","predicates","checks"],"properties":{"obligation":{"enum":["claim_semantics","node_identity","semantic_integrity","subject_scope","period","time_basis","coverage","evidence_state","evidence_set","economic_links","derivation_trace"]},"predicates":{"type":"array","minItems":0,"uniqueItems":true,"items":{"$ref":"#/definitions/id"}},"checks":{"type":"array","minItems":0,"uniqueItems":true,"items":{"enum":["claim_registry_binding","snapshot_identity","all_material_fingerprints","typed_subject_binding","typed_period_binding","time_field_reads","source_collection_completeness","typed_evidence_state","exact_evidence_set","all_material_edges","exact_observed_trace","validated_parent_binding"]}}}},
    "graph": {"type":"object","additionalProperties":false,"required":["fact_key","claim_id","nodes","sets","predicates","edges","obligations","trace_contract","authoring_sources","selections","windows"],"properties":{"fact_key":{"$ref":"#/definitions/factKey"},"claim_id":{"$ref":"#/definitions/sourceRef"},"nodes":{"type":"object","minProperties":1,"propertyNames":{"$ref":"#/definitions/id"},"additionalProperties":{"$ref":"#/definitions/node"}},"sets":{"type":"object","propertyNames":{"$ref":"#/definitions/id"},"additionalProperties":{"type":"array","minItems":0,"uniqueItems":true,"items":{"$ref":"#/definitions/id"}}},"predicates":{"type":"array","minItems":1,"uniqueItems":true,"items":{"$ref":"#/definitions/predicate"}},"edges":{"type":"array","minItems":0,"uniqueItems":true,"items":{"$ref":"#/definitions/edge"}},"obligations":{"type":"array","minItems":11,"uniqueItems":true,"items":{"$ref":"#/definitions/gateBinding"}},"trace_contract":{"$ref":"#/definitions/trace"},"authoring_sources":{"type":"array","minItems":1,"uniqueItems":true,"items":{"type":"object","additionalProperties":false,"required":["path","locator"],"properties":{"path":{"type":"string","minLength":1},"locator":{"type":"string","minLength":1}}}},"selections":{"type":"array","items":{"$ref":"#/definitions/selection"}},"windows":{"type":"object","propertyNames":{"$ref":"#/definitions/id"},"additionalProperties":{"$ref":"#/definitions/window"}}}},
    "selection": {"type":"object","additionalProperties":false,"required":["candidate_set","selected_set","selected_predicates","excluded"],"properties":{"candidate_set":{"$ref":"#/definitions/id"},"selected_set":{"$ref":"#/definitions/id"},"selected_predicates":{"type":"array","uniqueItems":true,"items":{"$ref":"#/definitions/id"}},"excluded":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["node","reason","predicates"],"properties":{"node":{"$ref":"#/definitions/id"},"reason":{"enum":["period","state","identity","ownership","scope","instrument","plan","merchant","category","budget_class","economic_kind"]},"predicates":{"type":"array","minItems":1,"uniqueItems":true,"items":{"$ref":"#/definitions/id"}}}}},"input_evidence_state":{"enum":["confirmed","projected"]}}},
    "scalarBinding": {"oneOf":[{"type":"object","additionalProperties":false,"required":["field"],"properties":{"field":{"$ref":"#/definitions/fieldPath"}}},{"type":"object","additionalProperties":false,"required":["claim"],"properties":{"claim":{"$ref":"#/definitions/claimPath"}}},{"type":"object","additionalProperties":false,"required":["literal"],"properties":{"literal":{"$ref":"#/definitions/literal"}}}]},
    "window": {"oneOf":[{"type":"object","additionalProperties":false,"required":["kind","start","end","start_inclusive","end_inclusive"],"properties":{"kind":{"const":"range"},"start":{"$ref":"#/definitions/scalarBinding"},"end":{"$ref":"#/definitions/scalarBinding"},"start_inclusive":{"type":"boolean"},"end_inclusive":{"type":"boolean"}}},{"type":"object","additionalProperties":false,"required":["kind","value"],"properties":{"kind":{"const":"month"},"value":{"$ref":"#/definitions/scalarBinding"}}}]}
  }
}
```

## docs/contracts/next/provenance-v2/registry-semantics-v1.md

SHA-256 9dad2d3833eee30b46c36899ff9bd3fc1b708112495edf8e3db075ac7f3302c4; Git blob cf2f3a21fe9bd2341c740cd61bfc8b3197a3556a; bytes 14387.

```markdown
# Semântica dos registries de autoria — N02-F

Estado: RASCUNHO NÃO RATIFICADO; zero implementação de operadores ou compiler.
Os registries associados são dados declarativos, não código executável.
Autoridade superior: NEXT-00 ratificado §§5.3/6/7/8/10.

## 1. Grammar do material field registry

O documento aceita somente registry_id, registry_version, stage, closed_world,
semantics, field_classes, types, envelope_fields e kinds. `stage=authoring`.
Kind possui somente origin e fields. Cada field descriptor possui class,
type e required; opcionais: values para enum, targets para edge, maximum
para inteiro positivo; reason somente para non_material. Qualquer outro campo/tipo/classificação falha a
validação do registry, não é ignorado. Nenhum código ou expressão é permitido.

Todo campo do objeto de evidência tem exatamente uma classificação. `targets`
é obrigatório e não vazio para edge, proibido nas demais classes, e só pode
referir kinds registrados. `values` enum deve ser conjunto não vazio, sem
duplicatas. Um campo opcional pode estar ausente; null não significa ausência
nem é valor válido nesses tipos. Presença/ausência entra no fingerprint.

O envelope contém ref_id, kind e version; o payload contém os fields do kind.
`payload.id == envelope.ref_id`. `category.payload.kind` é classificação
econômica, não o kind do envelope. Versão é digest da fonte/manifest imutável
que define o snapshot; não uma versão de origem bancária inventada. O grafo
deve resolver a tupla kind/ref/version sem ambiguidade.

O digest esperado de semantic_fingerprint pertence ao contrato de evidência,
não ao payload usado para calculá-lo. Não incluir o próprio digest no preimage.

## 2. Tipos fechados

- id: string não vazia, com grammar de ID do claim schema; domínio nominal
  do campo preservado. Igual texto não transforma person em card;
- text: string JSON sem coerção; não é canal de código;
- date/month: datas civis/calendário do contrato de tipos v2; validar existência;
- datetime: timestamp ISO com offset explícito, convertido em instante para
  comparação temporal; não obter timezone do ambiente;
- integer: inteiro seguro, sem -0; positive_integer >=1;
  nonnegative_integer >=0; maximum, quando declarado, também se aplica;
- money_minor: inteiro seguro com unidade BRL_minor e moeda BRL declarada na
  fixture; magnitude/sinal não são inferidos da categoria por esse tipo;
- boolean: true/false, nunca string ou 0/1;
- enum: igualdade exata com um valor declarado;
- digest: `sha256:` seguido de 64 hex minúsculos; formato não prova conteúdo;
- ref: ID nominal resolvido para exatamente um target permitido, na revisão
  do snapshot; ref_list é lista de refs sem duplicatas, com ordem preservada;
- typed_period: união fechada `definitions/period` do claim schema;
- typed_result: objeto fechado `{unit, kind, value}`. BRL_minor/money_minor usa
  inteiro seguro, count/nonnegative_integer usa inteiro >=0, entity_ids/id
  usa uma ref nominal, entity_ids/id_set usa conjunto de refs sem duplicatas,
  state/enum usa literal do domínio declarado pelo evaluator contract. A
  combinação unit/kind é exata e não existe value objeto arbitrário;
- role_ref_list: lista ordenada de objetos fechados `{role_id, parent_ref}`;
  role_id é referenciado do registry de evaluator, parent_ref é ref. Não
  duplicar role nem inferir sua semântica da posição. Ordem e vínculo são
  preservados no fingerprint e no hash de resultado derivado.

`typed_result` refere-se a resultado anterior validado usado como input de
outra invocação, não a output causal autodeclarado. Quando lido como operando,
seu acesso chega por I; não copiar R para o trace da invocação que o produziu.

## 3. Materialidade, fingerprint e reuso

Os cinco campos label são non_material/text com razão fechada display_only.
Eles só servem à apresentação e ficam fora do namespace de metric/proof
evaluators: não podem selecionar, ordenar, resolver identidade ou sustentar
predicado. A inspeção do avaliador v1 não identificou leitura de label, mas a
garantia futura exige o banimento no proxy/compile, não apenas esse histórico.
Todos os demais campos registrados são materiais. non_material não admite
ID, data, dinheiro, estado, ownership, coverage ou edge, mesmo com reason.
Adicionar justificativa/classe nova exige revisão; não há exceção por fato.

Preimage do fingerprint: objeto com registry_version, kind, ref_id, version e
payload contendo todos os campos identity/dimension/edge presentes. Não
descartar campos falsy, zero, false, coleções vazias ou arestas. O digest é
SHA-256 do canonical JSON, conforme regras da função aprovada canonicalValue:
keys ordenadas, ordem de arrays preservada, sem coerção/normalização Unicode,
sem números inseguros, símbolos, getters, ciclos ou objetos arbitrários.

A função existente aceita plain JSON; handles de prova são prototype-free.
Portanto não alegar que basta chamar essa função diretamente num handle.
A futura integração precisa obter os valores por acesso instrumentado e formar
a representação canônica no TCB, mantendo cada leitura observável. Isso reusa
a regra de canonicalização sem relaxar a fronteira do proxy nem reimplementar
fórmulas. Nenhum adaptador foi implementado nesta edição.

Cada edge presente, inclusive cada membro de ref_list/role_ref_list, exige
obrigação de target/consumo. Hash correto não dispensa relação semântica.

## 4. Registros primários e auxiliares

As 14 origins com nome de coleção correspondem aos registros da fixture v1.
O registry descreve o payload tipado proposto, mas não transforma a fixture
congelada automaticamente. Todo mapeamento precisa de manifest revisado.

As três coleções vazias têm shapes mínimos de witness: reminder/calendar_event
contêm id/person_id/scheduled_at; side_effect contém id/turn_id. Esses campos
de consulta são confrontáveis em validateFinancasBotNextFacts.mjs, operações
de count, e nos diálogos M-15/M-16. São tipos sintéticos do gate, não schema de
integração de agenda/WhatsApp. Campo novo exige versão/revisão, não descarte.

Os enums adicionais paid/cancelled, projected em bill e automatic em regra
são alternativas sintéticas propostas para witnesses de estado/aplicação;
não alegam presença na fixture nem habilitam esses comportamentos no produto.

Objetos `authored_auxiliary` estão explicitados no rascunho de
`snapshot-manifest-v1.json`, com origem e mapeamento para revisão:

| Kind | Fonte e limite |
|---|---|
| fixture | fixture_id/synthetic/closed_world/currency/fixed_clock existentes, sem valores financeiros inferidos |
| collection | membership integral da coleção nessa revisão; collection_name determina exatamente o kind de cada membro pela origin do registry |
| source_origin | um ID literal source presente na fixture + referência à fixture; não prova disponibilidade ou coverage |
| merchant_identity | merchant_key presente na fixture + referência à fixture; não faz merge de estabelecimentos semelhantes |
| transfer_identity | ID transfer_pair e lista exata das pontas existentes; sinais/neutralidade continuam predicados, não premissa do auxiliar |
| installment_plan | ID installment_plan, membros e total declarado consistente entre eles; ausência/conflito impede autoria desse snapshot válido |
| turn | ID do turno do corpus + revisão de fixture; não é evidência de execução produtiva |

Collection não declara coverage por si: completude exige igualdade com todos
os membros observados e closed_world/synthetic da fixture revisada. O escopo
da consulta é comprovado separadamente sobre o conjunto selecionado. Coleção
vazia com fixture parcial/desconhecida não prova resposta financeira zero.

Não existe statement kind/snapshot fabricado a partir de settles_card_id.
A prova de ausência de correspondência deve observar a estrutura disponível;
para provar correspondência positiva seria necessária evidência revisada nova.

`derived_claim` representa um resultado previamente validado e a ligação ao
seu grafo. Pais vazios só são admissíveis se o grafo desse resultado tiver
prova primária completa; nunca são licença para ancestry sem evidência. O
schema de grafo e `graph-binding-contract-v1.md` propõem essa ligação e o
preimage exato de result_hash. A execução/validação do pai continua pendente;
o registro atual não autoriza gerar resultado sem esses pré-requisitos.

## 5. Grammar e tipos dos operadores

Operator registry admite somente registry_id/version, stage, result_type,
unknown_operator, coercion, semantics e operators. Entrada contém apenas
id, args e semantics. IDs são exatamente os 27 da seção 6 ratificada; novos
IDs exigem nova versão/decisão/revisão. Os nomes em semantics referem-se às
definições abaixo, não são funções carregáveis, expressões ou plugins.

T é tipo nominal unificado em compile; K/A/B/J são kinds; U é unidade
numérica. Variáveis repetidas devem unificar. scalar não inclui objeto, lista,
path livre ou código. `set:node:K` compara identidades completas. Um set não
aceita duplicatas; sequence preserva ordem e multiplicidade. Não converter
sequence em set silenciosamente.

Paths/selectors são resolvidos e tipados em compile, nunca interpretados como
expressão arbitrária. template_ref/partial_policy_ref incluem referência à
versão/hash revisados; referências inexistentes bloqueiam. Os templates
conservam a restrição NEXT-00: conjunção de operadores, parâmetros explícitos,
sem condição, loop ou nome de métrica. A quantificação é semântica do operador,
não código dentro do template.

## 6. Semântica fechada por família

- eq/not_eq: igualdade/desigualdade de escalares do mesmo tipo nominal;
  same_identity: kind/ref/version iguais; kind_is/state_is: igualdade exata,
  sem alias/coerção. fingerprint_is mede todos os campos materiais por
  instrumentação e compara com o digest contratado, não aceita digest do nó.
- date_in_period: respeita kind e limites civis explícitos. registry_snapshot
  e request_execution não são períodos de data e esse operador os rejeita.
  period_eq exige mesmo kind e todos os campos iguais, não apenas interseção.
  same_month compara ano/mês; range_contains respeita os quatro limites.
  all_dates_in_period testa todos os membros e observa sua estrutura.
- set_eq exige mesmos membros tipados; set_subset exige policy revisada que
  permita parcial e nunca prova complete. cardinality_eq compara cardinalidade
  do set; count_eq compara comprimento da sequência, sem deduplicação.
- all_match exige conjunção verdadeira para cada membro; none_match exige que
  nenhum membro satisfaça a conjunção. Não são OR arbitrário. Vazio satisfaz
  esses quantificadores, mas não prova coverage/existência/evidence_set;
  essas obrigações continuam independentes e obrigatórias.
- field_eq compara campos do mesmo tipo. join_eq requer chaves únicas nos dois
  lados, mesmos domínios de chaves e relação um-a-um. Chave ausente/duplicada é
  erro. Não é operador de many-to-one; usar provas por membro já existentes.
  same_field exige conjunto não vazio com um único valor distinto no campo;
  não retorna verde por ausência de elementos.
- ref_targets_node resolve alvo kind/ref/version; edge_target_in_set exige
  essa identidade no set. edge_pair_complete exige exatamente dois nós
  distintos, cada um com o selector apontando à mesma identidade J declarada;
  não prova sinais, valor ou ownership, que continuam predicados separados.
- sum_eq usa soma inteira verificada, mesma unidade e recusa overflow em cada
  operação; vazio soma zero, sem implicar coverage. opposite_sign exige dois
  valores não zero com sinais contrários; abs_eq compara magnitudes, sem
  decidir neutralidade financeira por conta própria.
- ordered_by recebe descriptor fechado de chaves e direções asc/desc, com
  desempate explícito por identidade. Compara lexicograficamente valores do
  mesmo tipo/unidade, sem collation de locale implícita. O descriptor não pode
  conter callback; ties não resolvidos falham quando o contrato exige ordem
  total. Ordem observada é parte do trace, não apenas o conjunto dos membros.

Todos retornam boolean para relação válida/ inválida; input/path/tipo/versão
inválido produz violação estrutural, nunca true por fallback. Operadores
numéricos provam relações auxiliares; não produzem o resultado R da métrica.

## 7. Limites desta entrega

Proposta após auditoria: operator-registry-v2.json preserva as 27 entradas v1
e acrescenta cinco relações civis. Tipos, semântica, falhas e propriedades
estão em temporal-relations-decision-v1.md e
temporal-and-selection-witnesses-v1.json. A versão 2 exige auditoria conforme
NEXT-00 §8; não ratifica a si própria nem altera retroativamente a versão 1.

Estes registries são especificação de autoria, não implementações testadas.
A validação mecânica confere nomes, campos, tipos, targets e cobertura do
inventário observado; não prova predicados, traces, mutações ou 76 grafos.
Schemas de payload/grafo e manifest auxiliar já existem como rascunhos. Sua
consistência e suficiência devem ser confrontadas com cada grafo antes da
revisão independente integral N02-F.

Evidência local registrada em 2026-09-10: 14/14 checks em memória passaram,
abrangendo os dois inventários positivos e recusas de campo material omitido,
dinheiro classificado como apresentação, tipo/target inválido, enum sem domínio,
descriptor com código, label sem justificativa válida, campo desconhecido na
fixture e operador ausente ou com campo arbitrário. O inventário conferido tem
22 kinds, 102 campos de payload, cinco non_material, 14 origins primárias e
27 operadores. Esses checks são inspeção mecânica de autoria, não suíte de
regressão persistida nem execução dos operadores. Os 20 checks dos schemas de
claim/metric registry pertencem à entrega anterior e não foram reexecutados.

Na integração final, evaluation_policy foi acrescentado como o 23º kind, com
campos materiais explícitos e snapshot próprio. A evidência histórica 22/102
acima descreve a etapa anterior; não é o inventário vigente do candidato.
```

## docs/contracts/next/provenance-v2/snapshot-manifest-v1.json

SHA-256 2547229db3c07f2dd0941601ab5164bf89981ce966e4e23a2e3058124edba8c4; Git blob f83ff603add9d90b2850a2f05ad87e36923e88ed; bytes 52403.

```json
{
  "schema_version": 2,
  "manifest_id": "NEXT-GOLDEN-SNAPSHOT-MANIFEST-V2",
  "stage": "authoring",
  "synthetic": true,
  "material_registry_version": 1,
  "sources": [{"path":"tests/fixtures/financasbot-next/golden-financial-fixture-v1.json","sha256":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b"},{"path":"tests/fixtures/financasbot-next/golden-fact-contracts-v1.json","sha256":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2"},{"path":"docs/contracts/next/provenance-v2/evaluation-policy-v1.json","sha256":"sha256:4b6ee6a6fb365aa97a22a087de032e998dbb31ffd929d3ea2b094544f28f40dd"}],
  "snapshots": [
    {"ref_id":"family-example","kind":"family","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"family-example","label":"Familia Exemplo","members":["person-a","person-b"]},"authorship":{"source":"fixture","collection":"families","record_id":"family-example","mapping":"identity_payload"},"semantic_fingerprint":"sha256:7653bf0250d2422b32119aec2ba137b0da2ba5aa42eb50833e91a26badb389e6"},
    {"ref_id":"family-outside","kind":"family","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"family-outside","label":"Familia Externa","members":["person-c"]},"authorship":{"source":"fixture","collection":"families","record_id":"family-outside","mapping":"identity_payload"},"semantic_fingerprint":"sha256:eefcf75297b9b9c016ed167dba87c9439671bde91670155c7f21b99a6f98f8ae"},
    {"ref_id":"person-a","kind":"person","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"person-a","label":"Pessoa A","family_id":"family-example"},"authorship":{"source":"fixture","collection":"people","record_id":"person-a","mapping":"identity_payload"},"semantic_fingerprint":"sha256:37b8d4a3ec13a7498756b5dcda9162338e06c91d57465288ab3512cf07ac67c6"},
    {"ref_id":"person-b","kind":"person","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"person-b","label":"Pessoa B","family_id":"family-example"},"authorship":{"source":"fixture","collection":"people","record_id":"person-b","mapping":"identity_payload"},"semantic_fingerprint":"sha256:0727eed1b087b390effd2b0bc018c08907be89c583a820d3df42ed74add4bf13"},
    {"ref_id":"person-c","kind":"person","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"person-c","label":"Pessoa C","family_id":"family-outside"},"authorship":{"source":"fixture","collection":"people","record_id":"person-c","mapping":"identity_payload"},"semantic_fingerprint":"sha256:e6fcdde3e18270208466c3d7f09b483d405b31e19e26e648fda36c0c002dbc99"},
    {"ref_id":"account-a","kind":"account","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"account-a","label":"Conta Principal A","owner_id":"person-a","type":"checking","opening_balance_minor":0,"opening_balance_as_of":"2042-06-01"},"authorship":{"source":"fixture","collection":"accounts","record_id":"account-a","mapping":"identity_payload"},"semantic_fingerprint":"sha256:550c513138b6ba9eb4da7adb7602e04a98cc08393f44e0a2ca32a3dbf5219250"},
    {"ref_id":"account-b","kind":"account","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"account-b","label":"Conta Principal B","owner_id":"person-b","type":"checking","opening_balance_minor":0,"opening_balance_as_of":"2042-06-01"},"authorship":{"source":"fixture","collection":"accounts","record_id":"account-b","mapping":"identity_payload"},"semantic_fingerprint":"sha256:afae74f3f3b323aebfcc0c1de92a455d0d9aedf92b7c03ead0c8438933c8ef6d"},
    {"ref_id":"account-reserve","kind":"account","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"account-reserve","label":"Reserva Exemplo","owner_id":"person-a","type":"reserve","opening_balance_minor":0,"opening_balance_as_of":"2042-06-01"},"authorship":{"source":"fixture","collection":"accounts","record_id":"account-reserve","mapping":"identity_payload"},"semantic_fingerprint":"sha256:a99eca5b3d0230554b297ed8e216b39d483083d4ae08603b5c495df71adce089"},
    {"ref_id":"card-blue","kind":"card","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"card-blue","label":"Cartao Azul","owner_id":"person-a","closing_day":10,"due_day":17},"authorship":{"source":"fixture","collection":"cards","record_id":"card-blue","mapping":"identity_payload"},"semantic_fingerprint":"sha256:287ce34ecb5741e87838945370f226856d4eb555ffcbfcb55bc427549cd93729"},
    {"ref_id":"card-green","kind":"card","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"card-green","label":"Cartao Verde","owner_id":"person-b","closing_day":20,"due_day":27},"authorship":{"source":"fixture","collection":"cards","record_id":"card-green","mapping":"identity_payload"},"semantic_fingerprint":"sha256:389b9ae67176263c281c5d7f9765c24af08ee88793554dc6ab2cee2bf35f1e2f"},
    {"ref_id":"card-offline","kind":"card","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"card-offline","label":"Cartao Offline","owner_id":"person-a","closing_day":5,"due_day":12},"authorship":{"source":"fixture","collection":"cards","record_id":"card-offline","mapping":"identity_payload"},"semantic_fingerprint":"sha256:c08e5381eec0897121a04e9913969f8c663b29a91d64971e2a6b1a7dfd3da668"},
    {"ref_id":"food.snack","kind":"category","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"food.snack","label":"Lanche","kind":"expense","budget_class":"flexible"},"authorship":{"source":"fixture","collection":"categories","record_id":"food.snack","mapping":"identity_payload"},"semantic_fingerprint":"sha256:082758a835d3f03a5aaa9c5aa3a40a64797332dd7290eb25fe8b4bdbef0f967f"},
    {"ref_id":"food.market","kind":"category","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"food.market","label":"Supermercado","kind":"expense","budget_class":"essential"},"authorship":{"source":"fixture","collection":"categories","record_id":"food.market","mapping":"identity_payload"},"semantic_fingerprint":"sha256:236191d7b139be3f8aea9bb687db80f52b3076662ac6a6443eab316db9871188"},
    {"ref_id":"food.restaurant","kind":"category","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"food.restaurant","label":"Restaurante","kind":"expense","budget_class":"flexible"},"authorship":{"source":"fixture","collection":"categories","record_id":"food.restaurant","mapping":"identity_payload"},"semantic_fingerprint":"sha256:f510e2b44dff81c555e6ea65173b0c8e6e6fa884ed0dacd1e48c8aff1f79593f"},
    {"ref_id":"transport.fuel","kind":"category","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"transport.fuel","label":"Combustivel","kind":"expense","budget_class":"essential"},"authorship":{"source":"fixture","collection":"categories","record_id":"transport.fuel","mapping":"identity_payload"},"semantic_fingerprint":"sha256:0baea145300bfe15f42af0b3e9c21b347dc9c5a7444d19b7198990f6e179cdf2"},
    {"ref_id":"housing.rent","kind":"category","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"housing.rent","label":"Moradia","kind":"expense","budget_class":"essential"},"authorship":{"source":"fixture","collection":"categories","record_id":"housing.rent","mapping":"identity_payload"},"semantic_fingerprint":"sha256:e0eda6332dfcfe425084363f2a2518ab4da3f776e4d0bdfd6d25032efd41be64"},
    {"ref_id":"leisure.cinema","kind":"category","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"leisure.cinema","label":"Cinema","kind":"expense","budget_class":"flexible"},"authorship":{"source":"fixture","collection":"categories","record_id":"leisure.cinema","mapping":"identity_payload"},"semantic_fingerprint":"sha256:5a62ecd7378de7579fcd8bdedf2b23f9e5f842604d07e98db2554a1dfbfd7656"},
    {"ref_id":"gifts","kind":"category","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"gifts","label":"Presentes","kind":"expense","budget_class":"flexible"},"authorship":{"source":"fixture","collection":"categories","record_id":"gifts","mapping":"identity_payload"},"semantic_fingerprint":"sha256:8d6eadba5f2a18cf7bad63b45b8912819cf3c694e7e3758c6569fe008fdf1388"},
    {"ref_id":"income.salary","kind":"category","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"income.salary","label":"Salario","kind":"income"},"authorship":{"source":"fixture","collection":"categories","record_id":"income.salary","mapping":"identity_payload"},"semantic_fingerprint":"sha256:00e1754656fa898458e8e5a94c98f1ba13eb3c43ca8084c1f1be1507f8dad50a"},
    {"ref_id":"neutral.transfer","kind":"category","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"neutral.transfer","label":"Transferencia interna","kind":"neutral"},"authorship":{"source":"fixture","collection":"categories","record_id":"neutral.transfer","mapping":"identity_payload"},"semantic_fingerprint":"sha256:6eb0a80402c0657d78116c7af91419a8c01aefb6cceb46fdd9d6d8797ec1f1c6"},
    {"ref_id":"neutral.invoice_payment","kind":"category","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"neutral.invoice_payment","label":"Pagamento de fatura","kind":"neutral"},"authorship":{"source":"fixture","collection":"categories","record_id":"neutral.invoice_payment","mapping":"identity_payload"},"semantic_fingerprint":"sha256:f01b43f2389abc00a013f33f4222aa0c8b4c59739b9dee666ed9377f3f77d05b"},
    {"ref_id":"neutral.refund","kind":"category","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"neutral.refund","label":"Estorno","kind":"compensation"},"authorship":{"source":"fixture","collection":"categories","record_id":"neutral.refund","mapping":"identity_payload"},"semantic_fingerprint":"sha256:372397028e01b2da4309d900affe636c3625e6776154b52330a06fac1255ad25"},
    {"ref_id":"health.general","kind":"category","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"health.general","label":"Saude Exemplo","kind":"expense","budget_class":"essential"},"authorship":{"source":"fixture","collection":"categories","record_id":"health.general","mapping":"identity_payload"},"semantic_fingerprint":"sha256:58af6bb0b3f80693af1994e737e992d0aba0bd42e74aca055f820a9a958b9529"},
    {"ref_id":"evt-salary-a","kind":"event","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"evt-salary-a","date":"2042-06-03","person_id":"person-a","account_id":"account-a","category_id":"income.salary","amount_minor":500000,"state":"confirmed"},"authorship":{"source":"fixture","collection":"events","record_id":"evt-salary-a","mapping":"identity_payload"},"semantic_fingerprint":"sha256:1ebcafb3872a6943cedfc7d659efddd73671ef6db3225396bcc83b4d0e35c165"},
    {"ref_id":"evt-market-a","kind":"event","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"evt-market-a","date":"2042-06-04","person_id":"person-a","account_id":"account-a","category_id":"food.market","amount_minor":-30000,"state":"confirmed","merchant_key":"merchant-market-example"},"authorship":{"source":"fixture","collection":"events","record_id":"evt-market-a","mapping":"identity_payload"},"semantic_fingerprint":"sha256:daf31ec20b7073a452ea1d8cd679a353a6b0a2da24e9e21712d40a05823161f1"},
    {"ref_id":"evt-snack-a","kind":"event","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"evt-snack-a","date":"2042-06-05","person_id":"person-a","card_id":"card-blue","category_id":"food.snack","amount_minor":-1200,"state":"confirmed"},"authorship":{"source":"fixture","collection":"events","record_id":"evt-snack-a","mapping":"identity_payload"},"semantic_fingerprint":"sha256:db879c6c24f0d4c1928842add3a0307b2bcec1c1106152272bc5a8d6e3711214"},
    {"ref_id":"evt-fuel-a","kind":"event","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"evt-fuel-a","date":"2042-06-06","person_id":"person-a","card_id":"card-blue","category_id":"transport.fuel","amount_minor":-20000,"state":"confirmed"},"authorship":{"source":"fixture","collection":"events","record_id":"evt-fuel-a","mapping":"identity_payload"},"semantic_fingerprint":"sha256:63b70b7d189559bae6cc703ca08d1ddb4eeedaff36fc8f3e7992039f44ffa3f1"},
    {"ref_id":"evt-restaurant-b","kind":"event","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"evt-restaurant-b","date":"2042-06-07","person_id":"person-b","card_id":"card-green","category_id":"food.restaurant","amount_minor":-4500,"state":"confirmed"},"authorship":{"source":"fixture","collection":"events","record_id":"evt-restaurant-b","mapping":"identity_payload"},"semantic_fingerprint":"sha256:66a132ccbd33680ba7c80e3a3d1b603e8923612da1d9713db631a79ee0077366"},
    {"ref_id":"evt-refund-b","kind":"event","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"evt-refund-b","date":"2042-06-09","person_id":"person-b","card_id":"card-green","category_id":"neutral.refund","amount_minor":4500,"state":"confirmed","compensates":"evt-restaurant-b"},"authorship":{"source":"fixture","collection":"events","record_id":"evt-refund-b","mapping":"identity_payload"},"semantic_fingerprint":"sha256:528251b1dfe5dfd5071cb5c65bcd175523803eb563c7b7a86410d282563bb466"},
    {"ref_id":"evt-cinema-b","kind":"event","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"evt-cinema-b","date":"2042-06-10","person_id":"person-b","card_id":"card-green","category_id":"leisure.cinema","amount_minor":-3200,"state":"confirmed"},"authorship":{"source":"fixture","collection":"events","record_id":"evt-cinema-b","mapping":"identity_payload"},"semantic_fingerprint":"sha256:8d21c0a1e0865031f406c31b0bdc2fae18b1a2462719e13f26fbdcceb9a2d63e"},
    {"ref_id":"evt-gift-b","kind":"event","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"evt-gift-b","date":"2042-06-11","person_id":"person-b","account_id":"account-b","category_id":"gifts","amount_minor":-5000,"state":"confirmed"},"authorship":{"source":"fixture","collection":"events","record_id":"evt-gift-b","mapping":"identity_payload"},"semantic_fingerprint":"sha256:fb90f4162d3dbb71b2df8b590ec59f1d5f91c451d68fdb60b1d522a56c0257ed"},
    {"ref_id":"evt-transfer-out","kind":"event","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"evt-transfer-out","date":"2042-06-12","person_id":"person-a","account_id":"account-a","category_id":"neutral.transfer","amount_minor":-15000,"state":"confirmed","transfer_pair":"transfer-01"},"authorship":{"source":"fixture","collection":"events","record_id":"evt-transfer-out","mapping":"identity_payload"},"semantic_fingerprint":"sha256:2e82205aef713e6fec797e1a04cefe3f0f5a4f3e90e3fc97df1866937a610f2d"},
    {"ref_id":"evt-transfer-in","kind":"event","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"evt-transfer-in","date":"2042-06-12","person_id":"person-a","account_id":"account-reserve","category_id":"neutral.transfer","amount_minor":15000,"state":"confirmed","transfer_pair":"transfer-01"},"authorship":{"source":"fixture","collection":"events","record_id":"evt-transfer-in","mapping":"identity_payload"},"semantic_fingerprint":"sha256:3cb8d479d48bb7ce46d1e960fb6583731f9c8756f251e53638b7a613b8ceebbb"},
    {"ref_id":"evt-invoice-payment","kind":"event","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"evt-invoice-payment","date":"2042-06-13","person_id":"person-a","account_id":"account-a","category_id":"neutral.invoice_payment","amount_minor":-60000,"state":"confirmed","settles_card_id":"card-blue"},"authorship":{"source":"fixture","collection":"events","record_id":"evt-invoice-payment","mapping":"identity_payload"},"semantic_fingerprint":"sha256:b49d3cdddbe9fc4283d4a7615d647845a0f1c5924570e14f0677539388bd8d9e"},
    {"ref_id":"evt-rent-a","kind":"event","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"evt-rent-a","date":"2042-06-14","person_id":"person-a","account_id":"account-a","category_id":"housing.rent","amount_minor":-100000,"state":"confirmed"},"authorship":{"source":"fixture","collection":"events","record_id":"evt-rent-a","mapping":"identity_payload"},"semantic_fingerprint":"sha256:5d6ea72a6d179f57f5e9fde84b6a19301de0eb245e5829382a1ca55a840fe9e7"},
    {"ref_id":"evt-installment-1","kind":"event","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"evt-installment-1","date":"2042-06-14","person_id":"person-a","card_id":"card-blue","category_id":"gifts","amount_minor":-10000,"state":"confirmed","installment_plan":"plan-01","installment_number":1,"installment_total":3},"authorship":{"source":"fixture","collection":"events","record_id":"evt-installment-1","mapping":"identity_payload"},"semantic_fingerprint":"sha256:a767d54ab804664f470e2a691fb2e30a42844f41796574d1381bc03486410466"},
    {"ref_id":"evt-installment-2","kind":"event","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"evt-installment-2","date":"2042-07-14","person_id":"person-a","card_id":"card-blue","category_id":"gifts","amount_minor":-10000,"state":"projected","installment_plan":"plan-01","installment_number":2,"installment_total":3},"authorship":{"source":"fixture","collection":"events","record_id":"evt-installment-2","mapping":"identity_payload"},"semantic_fingerprint":"sha256:9a5a1fcfb9ff012aa4bd27dac97a93437bc4b2bac23722d50206fd2fa489e0e7"},
    {"ref_id":"evt-installment-3","kind":"event","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"evt-installment-3","date":"2042-08-14","person_id":"person-a","card_id":"card-blue","category_id":"gifts","amount_minor":-10000,"state":"projected","installment_plan":"plan-01","installment_number":3,"installment_total":3},"authorship":{"source":"fixture","collection":"events","record_id":"evt-installment-3","mapping":"identity_payload"},"semantic_fingerprint":"sha256:dcfb129d55d1850427760d6e0292745888df53d81cd9be79807ec5790b38825a"},
    {"ref_id":"evt-bill-projected","kind":"event","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"evt-bill-projected","date":"2042-06-25","person_id":"person-b","account_id":"account-b","category_id":"housing.rent","amount_minor":-80000,"state":"projected"},"authorship":{"source":"fixture","collection":"events","record_id":"evt-bill-projected","mapping":"identity_payload"},"semantic_fingerprint":"sha256:7b11303bfa4f70b281c26b05bd4f730b8c4ce139e8cadb9c88991f651b6cef70"},
    {"ref_id":"budget-snack","kind":"budget","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"budget-snack","family_id":"family-example","category_id":"food.snack","period":"2042-06","limit_minor":20000,"evidence_state":"confirmed","source":"synthetic-ledger"},"authorship":{"source":"fixture","collection":"budgets","record_id":"budget-snack","mapping":"identity_payload"},"semantic_fingerprint":"sha256:4fd5a501f93561e9b8fbc05bbc1a7d6d0c6a2ac5a8b45f3a9173dd3937b0f4c8"},
    {"ref_id":"budget-leisure","kind":"budget","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"budget-leisure","family_id":"family-example","category_id":"leisure.cinema","period":"2042-06","limit_minor":15000,"evidence_state":"confirmed","source":"synthetic-ledger"},"authorship":{"source":"fixture","collection":"budgets","record_id":"budget-leisure","mapping":"identity_payload"},"semantic_fingerprint":"sha256:b33c0c9eaf9a5be01466c3aabfc6fb6eb8d991048a8c425ab221c6c08f55a222"},
    {"ref_id":"bill-rent-b","kind":"bill","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"bill-rent-b","person_id":"person-b","due_date":"2042-06-25","amount_minor":80000,"status":"open","evidence_state":"confirmed","source":"synthetic-ledger"},"authorship":{"source":"fixture","collection":"bills","record_id":"bill-rent-b","mapping":"identity_payload"},"semantic_fingerprint":"sha256:5396650d54f585faa289423b531348e3d7c773ccdb7bf081d88ab2a057469696"},
    {"ref_id":"source-complete-june","kind":"source_state","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"source-complete-june","source":"synthetic-ledger","period":"2042-06","coverage":"complete"},"authorship":{"source":"fixture","collection":"source_states","record_id":"source-complete-june","mapping":"identity_payload"},"semantic_fingerprint":"sha256:89bf3b79c8f6b4fbc9575cf148ce7bf147ba55bff0820e46b1ecf2f7b23cf4b3"},
    {"ref_id":"source-partial-may","kind":"source_state","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"source-partial-may","source":"synthetic-ledger","period":"2042-05","coverage":"partial"},"authorship":{"source":"fixture","collection":"source_states","record_id":"source-partial-may","mapping":"identity_payload"},"semantic_fingerprint":"sha256:d05bb74fc49b4dd0dc265679183ce855b4024b423731db444be7880f4800ac1f"},
    {"ref_id":"source-offline-card","kind":"source_state","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"source-offline-card","source":"synthetic-open-finance","entity_id":"card-offline","coverage":"unavailable"},"authorship":{"source":"fixture","collection":"source_states","record_id":"source-offline-card","mapping":"identity_payload"},"semantic_fingerprint":"sha256:00a4c5eaa554a09625c6f451143eeb1aee15c4952ddd481cfb7ae5292dc71f4d"},
    {"ref_id":"source-empty-health","kind":"source_state","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"source-empty-health","source":"synthetic-ledger","period":"2042-06","category_id":"health.general","coverage":"complete","event_count":0},"authorship":{"source":"fixture","collection":"source_states","record_id":"source-empty-health","mapping":"identity_payload"},"semantic_fingerprint":"sha256:beb9b796b67566d9ec87044769ee275462fb84b2f3dbec1e3b04a8b4dd2cda9e"},
    {"ref_id":"proposal-active","kind":"proposal","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"proposal-active","state":"presented","expires_at":"2042-06-15T12:10:00-03:00","source_version":"obs-v2"},"authorship":{"source":"fixture","collection":"proposals","record_id":"proposal-active","mapping":"identity_payload"},"semantic_fingerprint":"sha256:756db6cb217f77b5909d068f405c05edacd29f37911a7b88bd9d660a9e05d4db"},
    {"ref_id":"proposal-expired","kind":"proposal","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"proposal-expired","state":"expired","expires_at":"2042-06-15T11:55:00-03:00","source_version":"obs-v1"},"authorship":{"source":"fixture","collection":"proposals","record_id":"proposal-expired","mapping":"identity_payload"},"semantic_fingerprint":"sha256:6ddf5c8f770661f14973894f2d24947460b9459825ded18f8ab938775fb49b1c"},
    {"ref_id":"proposal-superseded","kind":"proposal","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"proposal-superseded","state":"superseded","expires_at":"2042-06-15T12:20:00-03:00","source_version":"obs-v0"},"authorship":{"source":"fixture","collection":"proposals","record_id":"proposal-superseded","mapping":"identity_payload"},"semantic_fingerprint":"sha256:2b918c08bd6c31a01fa24ba5ab4e46732da5e2384504f8d77cd8d967a98cf70b"},
    {"ref_id":"rule-market-example","kind":"merchant_rule","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"rule-market-example","merchant_key":"merchant-market-example","category_id":"food.market","application":"suggestion","reversible":true,"evidence_state":"confirmed","source":"synthetic-ledger"},"authorship":{"source":"fixture","collection":"merchant_rules","record_id":"rule-market-example","mapping":"identity_payload"},"semantic_fingerprint":"sha256:641784f9b584f861cc7649f4657e90f919f55484b2bcbbbf7491847558235180"},
    {"ref_id":"NEXT-GOLDEN-FINANCIAL-V1","kind":"fixture","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"NEXT-GOLDEN-FINANCIAL-V1","synthetic":true,"closed_world":true,"currency":"BRL","fixed_clock":"2042-06-15T12:00:00-03:00"},"authorship":{"source":"fixture","fields":["fixture_id","synthetic","closed_world","currency","fixed_clock"],"mapping":"fixture_id_to_id"},"semantic_fingerprint":"sha256:c16747859756cdfdf59378c5f28d0b69cb86a5f732022701d5d3c10b5a92853b"},
    {"ref_id":"collection-families","kind":"collection","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"collection-families","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1","collection_name":"families","members":["family-example","family-outside"]},"authorship":{"source":"fixture","collection":"families","mapping":"ordered_complete_membership"},"semantic_fingerprint":"sha256:7b4d9b02d13675632ca10a297c982d6c69288fcf715afacf2bcaff7d92901325"},
    {"ref_id":"collection-people","kind":"collection","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"collection-people","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1","collection_name":"people","members":["person-a","person-b","person-c"]},"authorship":{"source":"fixture","collection":"people","mapping":"ordered_complete_membership"},"semantic_fingerprint":"sha256:7e10337f25cf76a2ba22f5be985cd8a548ade5aa3036c5a685f1e2c2fe86abb7"},
    {"ref_id":"collection-accounts","kind":"collection","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"collection-accounts","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1","collection_name":"accounts","members":["account-a","account-b","account-reserve"]},"authorship":{"source":"fixture","collection":"accounts","mapping":"ordered_complete_membership"},"semantic_fingerprint":"sha256:32fe91079519e6ca2f52a38324140b14bf7dfa8f892f5444d741f807bcca5810"},
    {"ref_id":"collection-cards","kind":"collection","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"collection-cards","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1","collection_name":"cards","members":["card-blue","card-green","card-offline"]},"authorship":{"source":"fixture","collection":"cards","mapping":"ordered_complete_membership"},"semantic_fingerprint":"sha256:7f662da7e7d250973cfa37f9ca2e68ae9edc457ee374f66170b65596d27a2a74"},
    {"ref_id":"collection-categories","kind":"collection","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"collection-categories","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1","collection_name":"categories","members":["food.snack","food.market","food.restaurant","transport.fuel","housing.rent","leisure.cinema","gifts","income.salary","neutral.transfer","neutral.invoice_payment","neutral.refund","health.general"]},"authorship":{"source":"fixture","collection":"categories","mapping":"ordered_complete_membership"},"semantic_fingerprint":"sha256:6e80296ad50e3d0d0540c596fc8337b9f375f0d03dc33724e68e3f3d251d9181"},
    {"ref_id":"collection-events","kind":"collection","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"collection-events","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1","collection_name":"events","members":["evt-salary-a","evt-market-a","evt-snack-a","evt-fuel-a","evt-restaurant-b","evt-refund-b","evt-cinema-b","evt-gift-b","evt-transfer-out","evt-transfer-in","evt-invoice-payment","evt-rent-a","evt-installment-1","evt-installment-2","evt-installment-3","evt-bill-projected"]},"authorship":{"source":"fixture","collection":"events","mapping":"ordered_complete_membership"},"semantic_fingerprint":"sha256:12ffa391f3d93a69c26e6d9e9fd0263896ab95bbcf2d59fcea9ecee5a37e2313"},
    {"ref_id":"collection-budgets","kind":"collection","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"collection-budgets","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1","collection_name":"budgets","members":["budget-snack","budget-leisure"]},"authorship":{"source":"fixture","collection":"budgets","mapping":"ordered_complete_membership"},"semantic_fingerprint":"sha256:38397d69c7cf68eaf390af60219703092c9bf035e60f54a62f7f37d63dd63ab5"},
    {"ref_id":"collection-bills","kind":"collection","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"collection-bills","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1","collection_name":"bills","members":["bill-rent-b"]},"authorship":{"source":"fixture","collection":"bills","mapping":"ordered_complete_membership"},"semantic_fingerprint":"sha256:80f31d22e8f3b9714f3eef56abfaee6ecc70908ec5c019fe41221cb021213d2c"},
    {"ref_id":"collection-source_states","kind":"collection","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"collection-source_states","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1","collection_name":"source_states","members":["source-complete-june","source-partial-may","source-offline-card","source-empty-health"]},"authorship":{"source":"fixture","collection":"source_states","mapping":"ordered_complete_membership"},"semantic_fingerprint":"sha256:b31d424330c21d39168e071c3e553659aca99091ba1d5c4eea864c2cddff304c"},
    {"ref_id":"collection-proposals","kind":"collection","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"collection-proposals","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1","collection_name":"proposals","members":["proposal-active","proposal-expired","proposal-superseded"]},"authorship":{"source":"fixture","collection":"proposals","mapping":"ordered_complete_membership"},"semantic_fingerprint":"sha256:84913dfdfd3206b7ae4cbc26ff23d33672d6a8b33da03bd87a65eb0f605f951b"},
    {"ref_id":"collection-reminders","kind":"collection","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"collection-reminders","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1","collection_name":"reminders","members":[]},"authorship":{"source":"fixture","collection":"reminders","mapping":"ordered_complete_membership"},"semantic_fingerprint":"sha256:652a65230654d8d3ec59a388260762bcfbb67a26dbbd340890b3a702422ed59e"},
    {"ref_id":"collection-calendar_events","kind":"collection","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"collection-calendar_events","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1","collection_name":"calendar_events","members":[]},"authorship":{"source":"fixture","collection":"calendar_events","mapping":"ordered_complete_membership"},"semantic_fingerprint":"sha256:d269e6e4685fce5ea2e4f1b70e420dac9f3ac2e414ecaaa956c3798d4ea740fd"},
    {"ref_id":"collection-side_effects","kind":"collection","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"collection-side_effects","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1","collection_name":"side_effects","members":[]},"authorship":{"source":"fixture","collection":"side_effects","mapping":"ordered_complete_membership"},"semantic_fingerprint":"sha256:c52ebf181a63b23d4c85c2c1203eaf23eaa9dfd1f988ca3b974f2a3f7def2c71"},
    {"ref_id":"collection-merchant_rules","kind":"collection","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"collection-merchant_rules","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1","collection_name":"merchant_rules","members":["rule-market-example"]},"authorship":{"source":"fixture","collection":"merchant_rules","mapping":"ordered_complete_membership"},"semantic_fingerprint":"sha256:7b8001fc39744cb0bda546840d340a9cbc10c91527bbd9a5821fb3f1bdab4358"},
    {"ref_id":"synthetic-ledger","kind":"source_origin","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"synthetic-ledger","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fixture","mapping":"literal_source_identifier"},"semantic_fingerprint":"sha256:a43f5f95b7b0fd8bcc20296b39a0a452af6056008d6ce719d72cd2afc94a4729"},
    {"ref_id":"synthetic-open-finance","kind":"source_origin","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"synthetic-open-finance","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fixture","mapping":"literal_source_identifier"},"semantic_fingerprint":"sha256:72bd9b86dab567fa217c0ca7bc5de59c60c4b22f8d9232c5a8122d8c4c660a28"},
    {"ref_id":"merchant-market-example","kind":"merchant_identity","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"merchant-market-example","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fixture","mapping":"literal_merchant_identifier"},"semantic_fingerprint":"sha256:94cf3c8d6a9b1953ce8b6660735cbb677105efaa522e26f59f57d2c6a094c7d4"},
    {"ref_id":"transfer-01","kind":"transfer_identity","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"transfer-01","members":["evt-transfer-out","evt-transfer-in"]},"authorship":{"source":"fixture","collection":"events","mapping":"exact_transfer_pair_members"},"semantic_fingerprint":"sha256:7affe3cadf3bcee97e22f276e382677f98ae76c11fc5bee1b20b20450b1bb134"},
    {"ref_id":"plan-01","kind":"installment_plan","version":"sha256:09cee92a0d5e706d06dd94c900b2f40e14261770adf74329341171f748ba696b","payload":{"id":"plan-01","members":["evt-installment-1","evt-installment-2","evt-installment-3"],"installment_total":3},"authorship":{"source":"fixture","collection":"events","mapping":"exact_plan_members_and_consistent_declared_total"},"semantic_fingerprint":"sha256:e5c3187e81e1e8d7baae97afd6064331d35a44e8a232cc440f8813070250afeb"},
    {"ref_id":"S-01#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"S-01#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"S-01#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:53623079b58aaf55b69809553d35ecb9eac80cb157b7fc81951fe6d932041b4a"},
    {"ref_id":"S-02#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"S-02#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"S-02#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:97d8522bcfee87a1c75f9a3176766f5b4e558eb955904b7e1446594c0f1d929c"},
    {"ref_id":"S-03#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"S-03#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"S-03#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:cd9474bbfcc2c5b0c29c02aa4da18f0fd92f3c40625c1deb699948bb920798a5"},
    {"ref_id":"S-04#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"S-04#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"S-04#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:a2a32a4c044edbfdd113b506e4e2f6662d1d323d256944f7e6563f4dd0ad39ab"},
    {"ref_id":"S-05#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"S-05#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"S-05#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:f484f75acf542e853e58389d9d6a8ad2d4923a97f68f418dccc816484fb52156"},
    {"ref_id":"S-06#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"S-06#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"S-06#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:ad3adfc6fb51ec01bf242941543f68f4616afb65190a8e8b56a664b961f6d080"},
    {"ref_id":"S-07#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"S-07#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"S-07#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:15a5667f7f7a8f1a64d08a6da2b571fc8f8e9f3549ec0eb579fcc31f8cfc7459"},
    {"ref_id":"S-08#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"S-08#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"S-08#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:aac1e6296f05dc8807db29d404bbc497aa2f99b261631043ce7ae9ce9b188a24"},
    {"ref_id":"S-09#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"S-09#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"S-09#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:63301b41b73f8e30c3e2dd0fcc52d9c127cf0acda69242740b44792d2154065c"},
    {"ref_id":"S-10#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"S-10#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"S-10#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:b777ae8cf88824a88c4f1482f6f3c450c7f5a65943b2158cfbf9fedd8e51e5b7"},
    {"ref_id":"S-11#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"S-11#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"S-11#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:6af8defe58b2e19863693a9d524efb6cd15324607c634604cb4706a51478168c"},
    {"ref_id":"S-12#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"S-12#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"S-12#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:4e1939a41f8cd955004f97b888c7947270fc57cd918e050fca5b480a873bdc1d"},
    {"ref_id":"S-13#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"S-13#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"S-13#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:972ed1f62b638dff013e10efc2cd3207516f3b804abe65ebeaeaacb45898bad9"},
    {"ref_id":"S-16#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"S-16#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"S-16#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:1a0c7e6af1eef38bbecf9f3d34f8138316cf103a15c245cbc6d3627a41a66f07"},
    {"ref_id":"M-01#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"M-01#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"M-01#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:00237be7679dac8e29a73bd1d6af727df54da1ebec2469ecd53ae359b1953b84"},
    {"ref_id":"M-02#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"M-02#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"M-02#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:a62ed7d7583f3a251b81922f1a369728b28fcae2128c96421712ded63018dcfb"},
    {"ref_id":"M-03#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"M-03#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"M-03#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:a5be9dca447af4149473d6fe0a42eaae4149f141c749932d9dd0424926273719"},
    {"ref_id":"M-04#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"M-04#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"M-04#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:68f4c87e4021a609d595c000305c79e2562df90dd53b7db6cb2ff117bf0dcae2"},
    {"ref_id":"M-05#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"M-05#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"M-05#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:8d4e47dd9d6c7d337c43118295b6f449f6249021e1446fdf9593d19ff5eac85e"},
    {"ref_id":"M-06#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"M-06#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"M-06#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:01194f8bc135d8336f5845860a49ad4f708b7cebecc73f5bd7242b44c8cf9079"},
    {"ref_id":"M-07#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"M-07#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"M-07#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:eb08d03ab23aaedad3495b4c721a5fd67f64bc5ea3477e0729c2cc2d7ee72169"},
    {"ref_id":"M-08#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"M-08#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"M-08#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:fb1ef44dcf5431d4d1ce0916b22f83e4f2f23d962a2c730d79fc09aa89fae9f8"},
    {"ref_id":"M-09#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"M-09#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"M-09#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:3e0f248aeff6b3aeb2aaf1e987e909c3917baf776fb2b5bb5c54306c6dfd5e4b"},
    {"ref_id":"M-12#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"M-12#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"M-12#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:cd3dccaeb696c5344270735b1a8d4d2df8b4e77edd1da688cdbe86c01702c194"},
    {"ref_id":"M-13#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"M-13#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"M-13#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:95c4974050007b63d71dedb884a4022c246e8018c20cca0c4be8d7c2ac046034"},
    {"ref_id":"M-14#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"M-14#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"M-14#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:8d9a9667cef20cab5d89660c6a1c64e58022f8caa5adcea823b62d53c2acd2b4"},
    {"ref_id":"M-15#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"M-15#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"M-15#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:e58022d78a08916ae46295c46ac028a0935cd12783205ebbe1e638d00b465e88"},
    {"ref_id":"M-16#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"M-16#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"M-16#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:9b410a78680a55b4775cecaaa940f4e533b267600caf771588e0d649ad52bf03"},
    {"ref_id":"F-01#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"F-01#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"F-01#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:87cee09ffe4ba0771412e53dffbea51f0fd346dbe1bb3f8650d3298c4fc0c1c6"},
    {"ref_id":"F-01#2","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"F-01#2","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"F-01#2","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:0ae699ecc38ffaf477f739fc66592625f581643d76a95aa6a8324bcdf820a657"},
    {"ref_id":"F-02#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"F-02#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"F-02#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:fb25a77a5f13c8d26a9c52a60be0bc7b264b6281939080325a5a0d1c239e4764"},
    {"ref_id":"F-03#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"F-03#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"F-03#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:9fc4ee9b700c15f960cccbc1dae2942b53de9eae6670ab58c855b6059d0d88d3"},
    {"ref_id":"F-03#2","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"F-03#2","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"F-03#2","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:c7c9e0b15cf0856dfa5ca98963b369d5e7b8a8da72f78078ac472eed3ba68b96"},
    {"ref_id":"F-04#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"F-04#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"F-04#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:36760bf1553a9d343525c6199cf246a066c2ba5b6e688fec7deba573c087d428"},
    {"ref_id":"F-04#2","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"F-04#2","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"F-04#2","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:eb7984228abba8e67983f691bf18137abfeaded4560ab077b8a1281d4f403e05"},
    {"ref_id":"F-05#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"F-05#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"F-05#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:e94d424259850c40c31b1440ecb383b253b50377c80bb280dbf2a970f121d28b"},
    {"ref_id":"F-05#2","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"F-05#2","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"F-05#2","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:eb6ddb4cbc1d517646a3e8fd6e1fe4c7eb23fd1e2f4f35ca7cf9dc50799c5d7e"},
    {"ref_id":"F-06#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"F-06#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"F-06#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:67fbb204e7335b4daa10474486f5567d74aae3a88199c5f9e6e869c22a16d565"},
    {"ref_id":"F-06#2","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"F-06#2","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"F-06#2","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:add98c833daf043ace755019024eabef3d77cfbbde81e292dd4a543520f13b24"},
    {"ref_id":"F-07#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"F-07#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"F-07#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:0b79c569f784019e96823ff328732fe1ad1b13e5d1958e103890e479a4b97903"},
    {"ref_id":"F-07#2","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"F-07#2","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"F-07#2","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:c0a69859a127aa5f1b142fe0dcf599cdb57fc91d7789d0cc0d258d73b90dc059"},
    {"ref_id":"N-04#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"N-04#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"N-04#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:72ae8fb09136121ce138f3a975693703e797bb604b9d9dfd22cb604fe3d9435c"},
    {"ref_id":"N-07#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"N-07#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"N-07#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:2b41bcc0e32c98b500bae74f8b0b437bc4f440aec83a12d7ef5c3cc0525ded40"},
    {"ref_id":"N-08#1","kind":"turn","version":"sha256:377373a33f9042a3ea0cfb0a368b4bf2b32a1529d873de7525edb38f92d8e8c2","payload":{"id":"N-08#1","fixture_id":"NEXT-GOLDEN-FINANCIAL-V1"},"authorship":{"source":"fact_contract","turn_id":"N-08#1","mapping":"declared_turn_identifier"},"semantic_fingerprint":"sha256:3d1f6c47fc2e150ead66b40043d49256dad8e5920e35fba993d9593012c21e68"},
    {"ref_id":"evaluation-policy-v1","kind":"evaluation_policy","version":"sha256:4b6ee6a6fb365aa97a22a087de032e998dbb31ffd929d3ea2b094544f28f40dd","payload":{"calendar":"proleptic_gregorian","timezone":"America/Sao_Paulo","ranking_key":"validated_consumption_minor","ranking_direction":"desc","ranking_tie_break":"lexical_internal_id","daily_pace_divisor":15,"daily_pace_rounding":"floor","daily_pace_start":"2042-06-16","daily_pace_end":"2042-06-30","daily_pace_as_of":"2042-06-15","id":"evaluation-policy-v1"},"semantic_fingerprint":"sha256:c400913f0bf6ecf4352cc824b5431f73f39e8c44eadcfa58f14d99846f2f0b53","authorship":{"source":"evaluation_policy","mapping":"explicit_versioned_policy"}}
  ]
}
```

## docs/contracts/next/provenance-v2/temporal-and-selection-witnesses-v1.json

SHA-256 92329f779a5b08f46f4554d129b934dcc2acf176741bf66ba82ab794f2c095bf; Git blob 70dde64e3e11b94acf11d9eb0f15bb6a3c74dd00; bytes 7193.

```json
{
  "schema_version": 1,
  "stage": "authoring",
  "execution_status": "not_executed",
  "operator_registry_version": 2,
  "scope": "documentary_discriminants_not_complete_runtime_mutation_suite",
  "materialization_requirement": "Congelar grafo e claim corrigidos. Materializar inputs schema-valid; recalcular fingerprints/versions/refs sem reparar predicados sob teste. Preservar demais átomos. Isolamento impossível falha UNSATISFIED_MUTATION_WITNESS. Casos de contract_mutation exigem nova revisão de autoria. Regressões com várias relações falsas no mesmo átomo não substituem witnesses ortogonais por átomo.",
  "cases": [
    {
      "id": "input_state_becomes_eligible",
      "kind": "input_mutation",
      "change": "evt_installment_2 passa a confirmed, data 2042-06-14, categoria efetiva e família do orçamento; reparar refs/fingerprints.",
      "expected": "r0013_exclude_state falso nos dois safe_daily_pace; output permanece estimated.",
      "expected_atom": "evidence_state",
      "fact_keys": [
        "M-13#1#3",
        "M-13#1#6"
      ]
    },
    {
      "id": "account_opening_moves_forward",
      "kind": "input_mutation",
      "change": "account_a.opening_balance_as_of passa a 2042-06-02; salário selecionado permanece em 2042-06-01.",
      "expected": "selection_window.start resolve June-02 e selected_period do salário fica falso. Não há range literal separado.",
      "expected_atom": "period",
      "fact_keys": [
        "S-06#1#1"
      ]
    },
    {
      "id": "account_reversed_range",
      "kind": "input_mutation",
      "change": "opening_balance_as_of posterior ao corte do claim.",
      "expected": "Resolver janela falha com start > end, inclusive com seleção vazia.",
      "expected_atom": "period",
      "fact_keys": [
        "S-12#1#1"
      ]
    },
    {
      "id": "statement_closing_day",
      "kind": "input_mutation",
      "change": "closing_day passa a 11, mantendo janela com fechamentos em dia 10.",
      "expected": "calendar_close_day falso. Novo contrato com janela alterada exige revisar eventos do dia 11.",
      "expected_atom": "period",
      "fact_keys": [
        "S-05#1#1",
        "M-05#1#1",
        "F-03#2#1"
      ]
    },
    {
      "id": "statement_due_day",
      "kind": "input_mutation",
      "change": "due_day passa a 18; claim mantém vencimento em dia 17.",
      "expected": "calendar_due_day falso.",
      "expected_atom": "period"
    },
    {
      "id": "statement_previous_close",
      "kind": "contract_mutation",
      "change": "Somente selection_window.start muda de 2042-05-10 para 2042-05-11.",
      "expected": "calendar_previous_close falso. Inclusão/exclusão usam a mesma janela.",
      "expected_atom": "period"
    },
    {
      "id": "safe_clock_cutoff",
      "kind": "input_mutation",
      "change": "fixed_clock passa a 2042-06-14T12:00:00-03:00; policy/claim preservados.",
      "expected": "calendar_clock_cutoff falso.",
      "expected_atom": "period"
    },
    {
      "id": "safe_successor",
      "kind": "input_mutation",
      "change": "policy.daily_pace_start muda de June-16 para June-15.",
      "expected": "calendar_next_day, calendar_day_count e calendar_claim_window falsos.",
      "expected_atom": "period"
    },
    {
      "id": "safe_month_end",
      "kind": "input_mutation",
      "change": "policy.daily_pace_end muda de June-30 para June-29.",
      "expected": "calendar_budget_bounds, calendar_day_count e calendar_claim_window falsos.",
      "expected_atom": "period"
    },
    {
      "id": "safe_divisor",
      "kind": "input_mutation",
      "change": "policy.daily_pace_divisor muda de 15 para 14.",
      "expected": "calendar_day_count e temporal_6 falsos.",
      "expected_atom": "period"
    },
    {
      "id": "safe_budget_month",
      "kind": "input_mutation",
      "change": "budget.period muda de 2042-06 para 2042-07; datas preservadas.",
      "expected": "calendar_budget_bounds, calendar_cutoff_in_budget e calendar_start_in_budget falsos.",
      "expected_atom": "period"
    },
    {
      "id": "local_date_offset",
      "kind": "operator_property",
      "change": "Instant 2042-06-16T01:00:00Z, timezone America/Sao_Paulo.",
      "expected": "civil_date_matches aceita June-15 e rejeita June-16; não extrair data UTC."
    },
    {
      "id": "civil_successor_leap",
      "kind": "operator_property",
      "change": "2040-02-28 + 1 day; repetir em 2042.",
      "expected": "civil_offset_matches aceita 2040-02-29 e 2042-03-01; rejeita os destinos trocados."
    },
    {
      "id": "civil_month_year",
      "kind": "operator_property",
      "change": "2042-01-10 + (-1) month.",
      "expected": "civil_offset_matches aceita 2041-12-10."
    },
    {
      "id": "civil_month_no_clamp",
      "kind": "operator_property",
      "change": "2042-03-31 + (-1) month, target 2042-02-28.",
      "expected": "Falha estrutural porque February-31 não existe; clamp proibido."
    },
    {
      "id": "month_end_leap",
      "kind": "operator_property",
      "change": "month 2040-02, start 2040-02-01, end 2040-02-29; repetir em 2042.",
      "expected": "month_bounds_match aceita February-29 em 2040 e February-28 em 2042; rejeita alternativas."
    },
    {
      "id": "day_number",
      "kind": "operator_property",
      "change": "date 2042-06-10; day 10, 11, 0, 32.",
      "expected": "day_of_month_matches verdadeiro para 10, falso para 11; 0/32 inválidos."
    },
    {
      "id": "inclusive_count",
      "kind": "operator_property",
      "change": "range June-16..30 inclusivo; count 15,14,16; depois range de um dia, exclusivo e invertido.",
      "expected": "Aceita 15; rejeita 14/16; um dia conta 1; exclusivo ou invertido é inválido."
    },
    {
      "id": "calendar_types_fail_closed",
      "kind": "operator_property",
      "change": "Calendário/unidade/timezone desconhecidos, data inexistente, string numérica ou overflow.",
      "expected": "Falha estrutural; sem coerção, fallback, timezone implícito ou normalização."
    },
    {
      "id": "examined_is_not_selected",
      "kind": "trace_mutation",
      "change": "Preservar 40 nós examinados e reads, mas registrar os 40 como selecionados em S-12.",
      "expected": "Comparação selected_nodes falha; required_nodes permanece válido.",
      "expected_atom": "trace",
      "fact_keys": [
        "S-12#1#1"
      ]
    },
    {
      "id": "selection_observation_missing",
      "kind": "trace_mutation",
      "change": "Omitir/duplicar operação required_selections ou trocar seus conjuntos; reads preservados.",
      "expected": "Comparação de operações falha; reads não provam seleção.",
      "expected_atom": "trace"
    },
    {
      "id": "derived_parent_is_operand",
      "kind": "trace_mutation",
      "change": "Marcar pais consumidos diretamente como selecionados sem operação de seleção.",
      "expected": "selected_nodes deve ser vazio; required_nodes/reads/receipts dos pais continuam obrigatórios.",
      "expected_atom": "trace",
      "fact_keys": [
        "M-01#1#3",
        "M-01#1#4",
        "M-14#1#3"
      ]
    }
  ]
}
```

## docs/contracts/next/provenance-v2/temporal-relations-decision-v1.md

SHA-256 a6581b9533f25d6a8864091ffacda0119e2d93df323c37918bddb0c56e297f1e; Git blob 30eb790446fb57d010489bfcef2c04ee813b65dc; bytes 5865.

```markdown
# ADR N02-F — relações civis e seleção observada

Estado: PROPOSTA DOCUMENTAL; aprovação independente pendente.
Base auditada: ef04368c95af33a12c0e8b5b286c0e0b01ae27f8.
NEXT-00 §8 exige versão, ADR, propriedades e auditoria para novo operador.
Este documento não modifica a ratificação v1.

## Decisão

Preservar os 27 operadores v1 e propor registry v2 com cinco relações civis
booleanas genéricas e referências tipadas a janelas nomeadas. Nenhum operador
conhece métrica, fact_key, fixture ou fórmula financeira.

Repetir literais ou confiar somente no hash do evaluator futuro deixa a
inconsistência de autoria sem prova relacional. Operador financeiro por métrica
duplicaria a autoridade de cálculo. As cinco relações abaixo cobrem o problema
sem linguagem de expressões executáveis.

## Janelas e tipos

windows é mapa local de nomes para range ou month. Range tem start/end como
scalarBinding e flags booleanos de inclusão; month tem value como scalarBinding.
scalarBinding aceita exclusivamente field, claim ou literal tipado. Não aceita
chamada, expressão, outra janela ou ciclo.

period_ref resolve a janela; period_bound extrai start/end de um range com tipo
date. Nome ausente, limite inexistente, tipo incompatível, data inválida ou
start > end falha fechado. Datas civis usam anos 0001..9999.
Leituras de field/claim são instrumentadas em cada fase que as utiliza.
Seleção e exclusão compartilham o mesmo period_ref, sem caches independentes.
Limite literal derivável de evidência precisa de relação que o ligue à fonte;
schema e fingerprint não substituem a revisão da suficiência dessa relação.

## Relações v2

Todos retornam boolean; tipo/valor inválido causa violação estrutural.
Calendário permitido: proleptic_gregorian. Sem coerção, fallback ou relógio
implícito. Não contar dias civis por duração em milissegundos.

| Operador | Semântica exata |
|---|---|
| civil_date_matches(instant, date, timezone, calendar) | A data civil do instante com offset, convertida no timezone explícito, é exatamente date. |
| civil_offset_matches(origin, offset, unit, target, calendar) | target é origin mais offset inteiro seguro em day ou month. Em month preservar o dia; destino inexistente/overflow falha, sem clamp. |
| month_bounds_match(month, start, end, calendar) | start/end são primeiro/último dia civil do mês/ano informado. |
| day_of_month_matches(date, day, calendar) | date existe e seu número de dia é day, inteiro 1..31. |
| inclusive_day_count_matches(range, count, calendar) | Range não vazio e inclusivo em ambas as pontas; count positivo é a cardinalidade exata de datas civis. |

Timezone deve resolver na policy registrada. A implementação futura de
civil_date_matches precisa congelar dados/regras de timezone no closure/
ambiente declarado; não usar timezone do processo. A fixture usa
America/Sao_Paulo. Os outros operadores recebem datas civis já tipadas.

## Aplicação

Account balance: selection_window = [account.opening_balance_as_of,
claim.period.value]. O saldo inicial é anterior aos movimentos da primeira
data civil; ambos os limites são inclusivos. Início/fim resolvem diretamente
as autoridades, conforme convenção explícita do contrato funcional.

Statement total: selection_window = (previous_close, current_close]. Provar
dia do fechamento, mês/ano da data statement_due, dia do vencimento e diferença
exata de um mês entre fechamentos. Preservar a convenção histórica v1 de
fechamento no mesmo mês do vencimento e as duas lentes time_basis revisadas;
não generalizar regras bancárias futuras.

Safe daily pace: selection_window começa no primeiro dia de budget.period e
termina em policy.daily_pace_as_of; remaining_window usa start/end da policy.
Provar corte = data civil do clock; start = corte + 1 dia; end = último dia do
mês do orçamento; corte/início futuro contidos no mês; divisor = cardinalidade
inclusiva; claim.period = remaining_window, inclusive flags. O descriptor
histórico de 15 dias precisa coincidir com a cardinalidade provada.
floor é configuração funcional. Inputs confirmed e output estimated são
distintos; nenhum estado do output justifica exclusão de evento.

## Seleção observada

required_nodes conserva nós examinados para cálculo, fingerprint, exclusão,
coverage ou vínculos. Não criar examined_nodes como segunda lista equivalente.
required_selections enumera pares candidate_set/selected_set por fase conforme
a regra de bindings de graph-binding-contract-v1.md §4. Proof conserva todas
as selections do grafo; derivation exige as de roster ligado a node_set e não
repete seleção de operandos node já vinculados. selected_nodes é a união exata
dos sets selecionados das operações daquela fase e subconjunto de required_nodes.

O recorder observa seleção real por fase; não copia selected_nodes autorado
nem transforma leitura em seleção. S-12#1#1 examina 40 nós e seleciona zero.
Pais derivados consumidos diretamente permanecem em reads/required_nodes,
sem selected_nodes quando não há operação de seleção.

selection.input_evidence_state é requisito funcional da entrada: cada inclusão
prova esse estado e exclusão por estado prova sua violação. Os predicados devem
coincidir com esse requisito, independente de claim.evidence_state. Nos dois
safe_daily_pace, confirmed é obrigatório na entrada e estimated no resultado.

## Limites e validação

temporal-and-selection-witnesses-v1.json especifica discriminantes futuros
authoring/not_executed. Checks locais de datas/documentos não são execução do
motor. Os 76 grafos adotam seleção explícita; sete têm janelas relacionadas.
Claims, fixture, oracle e snapshots permanecem iguais. Admissão do registry v2
exige reauditoria do contrato; nenhum compiler/evaluator é autorizado aqui.
```

## docs/contracts/next/provenance-v2/type-and-identity-contract-v2.md

SHA-256 41082ed25096b7289028d632e2ba7db86aa5400f9c5fbeb73da4ce7e3d9f560b; Git blob 98b670e78a50c3f60348c39dd4f7efda9addd979; bytes 9362.

```markdown
# Tipos, identidade e vínculo de execução — proposta N02-F

Estado: RASCUNHO NÃO RATIFICADO. Nenhuma implementação de runner ou evaluator.
Deriva do desenho NEXT-00 §§3–8/12–14, roadmap §6 e Model Data Boundary §3–5.

## 1. Identidades distintas

O contrato de autoria possui `contract_id` e um `claim_id` opaco, atribuído
pelo autor e único dentro desse contrato. `fact_key` permanece uma referência
independente ao corpus. Dois fact_keys não podem compartilhar claim_id no mesmo
contrato. A unicidade é comparação de valores, não convenção lexical.

Identidade estática: `(contract_id, claim_id)`. A revisão congela uma associação
imutável entre essa identidade e o descriptor inteiro do claim: fact_key,
métrica/unidade, sujeito, período, lente, coverage/estado, evaluator_ref e
operand_bindings. Alterar descriptor mantendo ID não mantém a revisão antiga:
o hash integral do contrato muda e exige revisão. Nunca resolver só pelo ID.

Identidade de uma instância: `(execution_id, contract_id, claim_id)`, associada
pelo host confiado à invocação real. `execution_id` vem do host, não da fixture,
do modelo ou do evaluator. Para um mesmo escopo, associação duplicada ou
divergente é erro; outra execução cria outra instância, mesmo com mesmo valor.

O executor futuro entrega handles segundo os bindings resolvidos. Seu retorno
funcional R é validado como saída daquela invocação e só pode ser associado ao
claim previsto. Uma resposta de outra invocação não é aceita por ter o mesmo
valor. O vínculo está no host confiado, não em um claim_id retornado pelo
evaluator. A aceitação confronta separadamente R/oracle e T/provenance; não
constrói um envelope comum denominado trace.

O código do projeto que mantém esse vínculo e decide a aceitação pertence ao
`validation_tcb_root`; não existe associador não pinado entre resultado, claim
e execução. Isso especifica uma responsabilidade do host existente, não um
novo serviço ou uma terceira autoridade sobre R/T.

Para derived_claim, a identidade adicional permanece exatamente
`(fact_key, evaluator_version, result_hash)`. O contrato de hashing do resultado
derivado deve incluir resultado tipado, descriptor, bindings de roles e hashes
dos pais. Pais são associados por role, não reordenados arbitrariamente;
ciclos falham. O preimage proposto, sua ordem canônica e a resolução dos pais
estão em `graph-binding-contract-v1.md`, §5. A autoria mantém referência ao pai;
somente uma execução validada futura pode materializar seu resultado/hash.

## 2. Projeção pública

O gateway futuro aloca IDs públicos opacos e efêmeros a partir do namespace
privado do request, mantendo mapa interno para as instâncias validadas. Tokens
não derivam de IDs internos, hashes estáveis ou contadores globais. Reutilizar
o mesmo token dentro do request pode referenciar o mesmo claim; associá-lo a
outro claim é erro. Fora do request a resolução falha, mesmo se o token existir
em outro mapa. O descarte/TTL deve acompanhar o contrato de request.

Não expor contract_id, fact_key, execution_id interno, hashes/roots, source IDs
ou a tabela de binding. O envelope público só conterá os campos permitidos pela
Model Data Boundary. `claim-contract.schema.json` descreve contrato interno de
autoria, não esse envelope público e não autorização de egress.

## 3. Tipos e semântica além do JSON Schema

O schema é closed-world estrutural. Ele não prova sozinho: unicidade de IDs
entre objetos; igualdade de conjuntos; validade de datas no calendário;
ordenação de intervalos; resolução de refs por kind; permissões; consistência
da unidade com evaluator; completude ou provenance. Esses checks são obrigações
do futuro compile/proof gate. PASS de JSON Schema não será PASS financeiro.

Datas são datas civis ISO válidas, sem coerção de timestamp. Intervalos usam
start/end com inclusividade explícita; start deve ser <= end. `through` e
`as_of` são tipos distintos mesmo quando usam a mesma data. Mês tem início/fim
calculados sob calendário/policy explicitamente registrados, não relógio global.
statement_due e statement_competence não são aliases de billing_period.

`registry_snapshot` referencia uma revisão explícita; `request_execution` é
ligado ao turno sintético do corpus. Nenhum deles implica uso de estado global
corrente. A lente histórica `15_full_days_after_as_of` permanece enum explícito;
o evaluator contract deve declarar a propriedade correspondente, sem extrair
parâmetro por regex ou entregar a matemática ao modelo.

Sujeitos simples têm kind/ref_id; composições têm campos tipados separados.
Comparações usam sujeito da consulta e roles de operandos do registry, não
strings como `person-a-minus-person-b`. A extensão `budget_person` explicita a
composição já presente no contrato v1 e será revisada no schema v2.

## 4. Registry de autoria versus execução

`metric-evaluator-registry.schema.json` distingue documentos completos por
`stage`: `authoring` ou `execution`. A mesma entrada id/version conserva uma
única definição de roles e contrato; não existe tabela paralela autoritativa.

Authoring exige contrato funcional existente/referenciado e seu hash real, mas
declara `artifact_status: not_built` e proíbe artifact root. Não pode ser usado
para execução, medição, PASS de closure ou freeze executável. Não é `null`
interpretado como sucesso. O conjunto declarativo pode ser revisado antes do
código, conforme a ordem ratificada.

Execution exige roots reais para todas as entradas e revisão independente do
candidato que os introduziu. Uma flag não promove authoring: resolver o
documento authoring no runner é erro, mesmo que todos os outros checks passem.
Alterações de código/contrato/roles requerem nova versão e revisão; a vinculação
inicial do artefato requer revisão do novo hash, sem alegar que a auditoria da
declaração anterior já aprovou esse executável.

O hash do contrato é medido sobre seus bytes UTF-8 exatos, sem normalização
implícita. Artifact root continua Merkle root do closure pós-transformação
integral, conforme NEXT-00; nunca o hash isolado de entry module. O freeze
referencia somente o hash integral do registry para essa autoridade.

Além do schema, o futuro gate deve exigir unicidade de id/version por entrada
e de role_id por evaluator, resolução de contract_path/witness IDs, hash real
dos bytes, consistência de metric/unit com a assinatura e igualdade exata dos
bindings com os roles declarados. Array presente ou digest bem formado não
comprova nenhuma dessas propriedades.

Os identificadores dos schemas são URNs locais: resolvê-los não autoriza I/O
nem lookup de rede. Os metasschemas são usados apenas por ferramentas locais
de validação documental; não entram como código remoto no closure.

## 5. Snapshots sem alteração da fixture v1

O snapshot v2 precisa identificar explicitamente fixture/version e registro.
Onde v1 não tem version por registro, a revisão imutável da fixture pode ser
parte da identidade de snapshot; não inventar uma versão bancária de origem.
O manifest de autoria deverá mapear o registro original e cada campo promovido
ao objeto tipado, preservando presença/ausência e sem inferir statement_id.

Uma coleção vazia exige objeto de prova que registre coleção, revisão, escopo,
cobertura e membership observado. Zero elementos não implica complete: é o
closed-world sintético revisado que deve sustentar essa declaração. O schema
dos membros e o witness de adição válida continuam necessários, mesmo sem
exemplos presentes. O material registry, snapshot schema e manifest já existem
como rascunhos; sua validação de shape/referências não prova coverage financeira.

## 6. Critérios adversariais documentais

Os schemas devem rejeitar campos desconhecidos, resultado numérico dentro do
claim de autoria, cópia de hashes/roles nele, sujeito/período com shape errado,
bindings não tipados, authoring com artifact root e execution sem root.
Testes mecânicos desses shapes não substituem as futuras provas causais de
troca de invocação, colisão de IDs, egress entre requests, DAG ou execução real.

Validação local de 2026-09-09: 20/20 checks com `Test-Json -Schema`, aplicados
aos dois schemas. Os dados temporários foram montados em memória e não são
fixtures financeiras nem um registry publicado. Os hashes repetidos usados
nesses exemplos são apenas witnesses de formato, nunca hashes medidos.

| Grupo | Casos executados | Resultado |
|---|---|---|
| Claim positivo | contrato mínimo tipado | aceita |
| Campos proibidos | value, result, evaluator_contract_hash, roles, unknown | rejeita os cinco |
| Shape do claim | sem claim_id; sujeito string; range sem inclusividade; mês inválido; binding string; hash em evaluator_ref | rejeita os seis |
| Registry positivo | authoring sem root; execution com shape de root | aceita os dois apenas estruturalmente |
| Registry negativo | root em authoring; execution sem root; root null; hash placeholder; cardinalidade incompatível; stage desconhecido | rejeita os seis |

Esta bateria pontual ainda não é uma suíte de regressão versionada. As provas
causais finais continuam pendentes; nenhum total foi promovido a GO N02-F.
```

## docs/plans/workstreams/financasbot-next-02-n02g-compositional-path-qualification-proposal-v1.md

SHA-256 0c831d290c0ae47960d1fc11b9ea530d792a926cb2211a1313d7d070f0d24eba; Git blob 82112f0c4d6eeed21d4823c8b1dd3d3ca8ce1bf2; bytes 18783.

````markdown
# N02-G — proposta de qualificação composicional de paths

Data: 2026-10-08. Estado: PROPOSTA NÃO RATIFICADA; SEM IMPLEMENTAÇÃO OU GO.
Decisão normativa nova: substituir SOMENTE o método de fechamento da família
predicate_path_semantic/v2 por path-qualification/v3. Não declarar o contrato
anterior cumprido nem chamar recusa de admissão de witness semântico.

## 1. Decisão, necessidade doméstica e limites

Perguntas domésticas precisam usar pessoa, conta/cartão, período, base temporal
e fontes corretos. Cálculo exato sobre o campo errado também é resposta errada.
Preservar compiler, isolamento, observação real, claims, resultado e pais.
Não multiplicar perfis contrafactuais para fazer autoria estruturalmente inválida
atravessar o compiler. Qualificar conjuntamente a barreira estática e o caminho
semântico admitido, com evidência distinta para cada garantia.

Original primeiro: o confronto consumer-first e de confiabilidade já consta em
financasbot-domestic-roadmap-review-20261007.md. Reutilizar regras financeiras,
consumidores, casos e controles existentes quando compatíveis; não portar a
normalização permissiva, a autoridade heurística ou os defeitos de contexto do
legado. Esta decisão não reconstrói engine, gateway ou sessão e não abre adapters.

Fontes normativas confrontadas: financasbot-next-02-n02g-v1.md, §§2/5/7/8;
financasbot-next-02-n02g-path-domain-proposal-v2.md, §§2–6, ratificada em
f892a35fce88fe21d474bd7ed408fe2697052ce7; contratos provenance-v2 e adendos
mensal/selected-day referidos no plano doméstico. Seus artefatos são imutáveis.

Alcance: todos os predicados path-bearing do inventário v2, sem lista de IDs,
fact_keys, métricas ou causas históricas dispensadas. As regras são derivadas
da gramática, tipos, namespaces, vínculos e consumidores reais de cada candidato.
Nenhum destino é inferido de uma mensagem de erro ou de um relatório antigo.

Fora do delta: demais estratégias/átomos G11, os controles path/reference de
admissão por site, G07/G08/G14, pais, oracle, trace, limites, schemas financeiros,
corpus e qualidade conversacional. Não importar exceções mensal/A-B/source-state.
Não alterar compiler/checkers para permitir negativos antes recusados.

## 2. Garantia proposta — e diferença honesta para v2

Para cada predicado com path, demonstrar uma destas propriedades:

1. Há alternativa admitida e discriminante: executar o witness semântico normal
   de v2, precomprometido, com rejeições exatas e C/M/S genuínos.
2. Nenhuma alternativa tipada existe, ou todas violam uma restrição estática
   obrigatória: provar a completude do domínio e o vínculo dessa restrição com
   a admissão normal e com o executável; exercer a barreira separadamente.
3. Há alternativas admitidas, mas são semanticamente equivalentes por uma
   relação necessária do contrato: provar essa equivalência, incluindo todos
   os consumidores. Coincidência de valores na fixture não satisfaz este caso.

Sem uma dessas provas, permanece BLOQUEADO. A inexistência de alternativa no
gerador atual não prova singleton; a recusa atual não prova segurança estática;
o resultado igual não prova equivalência. Referência independente ausente,
cofalha inexplicada e timeout continuam bloqueios, não novas disposições.

Isso NÃO é equivalência literal ao teste contrafactual de v2: v2 exige witness
semântico mesmo quando ele não existe nesse domínio. A proposta muda o método
de assurance e o significado do fechamento; precisa de ratificação explícita.
Pretende preservar a garantia sobre comportamento admitido, mas sua suficiência
depende do modelo de falha abaixo, da prova de composição e da auditoria. Até
lá não alegar garantia equivalente demonstrada ou N02-G encerrado.

### Modelo de falha coberto

Troca de um locator authored por outro de mesma forma/tipo nominal/unidade,
incluindo anchor permitido e paths dentro de templates/ref_set/sort/projection;
substituição incompatível com selection bindings/requirements; omissão ou
adulteração de autoria, IR, programa, medição, observações ou vínculo ao claim.
Uma troca material não pode ser compensada alterando claim/oracle/outro predicado.

O argumento é: autoria fora do domínio não chega aos handles; autoria admitida
executa sob bytes confrontados com toda a autoria; reads/escopo/ordem/seleções
reais e R correspondem ao claim e à referência independente. Falha de qualquer
termo invalida a composição. Um teste do compiler isolado não fecha esse argumento.

Ameaças da plataforma/TCB e limites externos permanecem os já declarados nos
contratos ratificados. Hash, VM, AST ou testes por amostragem não provam ausência
geral de comportamento JavaScript, autenticação de auditor humano ou segurança
de plataforma comprometida. Captura de bytes não é replay BUILD independente.

## 3. Domínio completo, selado antes do negativo

Para candidato C, predicado p e cada site authored s:

- L(s): todos os locators distintos do original no closed world declarado,
  com o mesmo ramo, kind, tipo nominal, unidade e forma, conforme schema/registry.
- A(s): membros de L(s) que satisfazem as restrições estáticas normativas para
  a única troca nesse site, mantendo o restante da autoria/payload/claim/oracle.
- W(s): membros de A(s) cuja troca é discriminante segundo referência semântica
  independente, respeitando o conjunto exato de violações exigido por v2.

Registrar L, A, W e seus fundamentos por site, sem deduplicar bindings/sites
por valores iguais. Domínios finitos devem ter enumeração integral; uma regra
paramétrica só substitui expansão se sua totalidade e aplicação a TODOS os
membros forem verificáveis no closed world desse candidato. Limite do analisador,
alias não resolvido, namespace novo ou import dinâmico deixam a prova bloqueada.

Expected vem de enumeração independente de schema+autoria, não de IR observado,
TAP, actual, trace ou da lista que o executor conseguiu gerar. Confrontar todos
os sites, inclusive templates aninhados, anchors, versões/hashes e namespaces.
Nenhum namespace implícito, registry inventado ou corpo omitido por conveniência.

Os domínios, a disposição prevista, a referência, o primeiro site/candidato
discriminante e expected_violations são selados antes de M e de seus resultados.
Classificar por restrições authored e semântica normativa independente; não
executar alternativas até achar uma que falhe como desejado. Compiler/actual
podem contradizer o selo e bloquear; nunca ajustá-lo depois para fazer PASS.

Para provar A, citar as regras do contrato e suas instâncias, incluindo relações
entre campos/bindings/requirements. Uma lista de tipos não resolve restrições
relacionais. Reutilizar schemas/registries/índices e compiler atuais; não criar
um novo schema financeiro nem replicar o compiler como autoridade independente.
A independência é do fundamento e da enumeração, não alegada pelo nome do módulo.

## 4. Disposições exclusivas por predicado

| Disposição | Condição necessária | Evidência de fechamento | Crédito semântico |
| --- | --- | --- | ---: |
| semantic_witness | Algum W(s) não vazio | Primeiro witness selado, compiler normal integral, C/M/S e violações exatas de v2 | Uma invocação própria, sem compensação |
| static_domain_proof | Todos L(s) vazios ou todos A(s) vazios | Prova completa por site, baseline, vínculo à barreira e controles da §5 | 0 |
| semantic_equivalence_proof | Algum A(s) não vazio, todos W(s) vazios por equivalência NECESSÁRIA comprovada | Prova integral de cada alternativa admitida e de todos consumidores, §6 | 0 |
| blocked | Qualquer lacuna, contradição, falha, alternativa não classificada ou referência ausente | Diagnóstico e fronteira que faltam | 0 |

Se algum W(s) existir, semantic_witness tem precedência; não escolher disposição
estática/equivalente para evitar um negativo executável. Um predicado com sites
mistos recebe witness no site discriminante, sem perder a prova de domínio dos
demais sites nem os controles de admissão obrigatórios por site. Não converter
forma do locator, operador ou literal para criar alternativa fora da estratégia.

Cada row mantém identidade de p e todos os sites. expected_predicates é exatamente
o conjunto v2 path-bearing; a cardinalidade atual não vira constante do código.

Fundamento comum às três disposições: baseline integral, domínio fechado,
enumeração independente, todas as exclusões justificadas, vínculo autoria→IR→
programa/closure, identidade/observação reais e referência independente. Aplicar
as condições pertinentes da §5 também aos sites excluídos num row semântico ou
equivalente; nenhuma disposição dispensa os controles de admissão v2 por site.
Se parte do domínio não tem prova, o predicado inteiro fica blocked.

## 5. Prova estática — não é recusa promovida a PASS

static_domain_proof exige conjuntamente:

1. Baseline admitido pelo compiler NORMAL inteiro, C e S positivos sob toda a
   autoria, resultado/oracle e coverage/trace normativos, não só predicado alvo.
2. Enumeração/derivação integral de L e A por site. Singleton é propriedade do
   domínio admitido, não falta contingente de dados, suporte do gerador ou valor.
3. Para cada exclusão, regra normativa e instância causal exatas que a impõem,
   restrição de bindings/requirements e coordenada esperada precomprometidas.
4. Evidência executada da barreira normal para cada instância distinta exigida:
   autoria sintaticamente válida, alteração única, diagnóstico e coordenada
   autênticos, zero abertura de handles e restauração positiva. Quando L vazio,
   usar o negativo unknown_path do namespace exato previsto em v2, sem chamá-lo
   de locator tipado existente. Schema inválido não demonstra o resolver.
5. Para L não vazio/A vazio, todos os membros têm justificativa de exclusão.
   Exercitar cada instância de regra necessária; membros só compartilham um
   controle se aplicação paramétrica completa estiver provada, não por mensagem
   igual ou por receberem o mesmo label. Não supor proof geral a partir de teste.
6. Independência contra erro comum: o pacote de qualificação confronta a regra
   declarada, os bytes do compiler/checker e os campos/vínculos authored. REDs
   incluem retirar/inverter a guarda, trocar sua coordenada e admitir um membro
   excluído. Asserção só do texto de erro não satisfaz esses controles.
7. Conformance integral autoria→IR→programa e closure medidos antes de handles.
   Comprová-la para o programa REAL, incluindo helpers/resoluções/bindings e
   consumidores; não confiar no IR produzido pelo mesmo compiler nem em flag.
   Prova estática sem ligação ao executável não fecha o row.
8. R/I/M/L/T e identidade confiada continuam exigidos nos positivos. Mutant
   excluído publica dp_execution=false; nenhuma passagem parcial como D/P.

As condições não instituem um novo motor em produto: são evidência de
qualificação/build a compor com os mecanismos existentes. Reuso só com hashes,
escopo, regra/instância e autoridade compatíveis. Se a instância não é coberta,
executar o controle faltante; não declarar todo grupo histórico coberto.

## 6. Equivalência necessária e detecção semântica

Igualdade de resultado, tipo ou valor numa fixture não basta. O argumento deve
cobrir identidade/origem, escopo/owner, versão, período, unidade, membership,
cardinalidade, ordem, medidas/reads, todos os consumidores e o valor de R/claim,
conforme contratos aplicáveis. Igualdade numérica entre pais não os substitui.

Uma relação necessária decorre do domínio/contrato e vale para suas entradas
admitidas, não só para o snapshot atual. Se duas folhas podem divergir em dados
válidos, ou se um consumidor observa sua identidade distintamente, não são
equivalentes. A classe201 histórica sem discriminante NÃO recebe equivalência
automática. Referência insuficiente deixa blocked; não preencher com actual.

Provar ausência de consumer relevante por lista authored é insuficiente: exigir
closure executável completa com capacidades e aliases resolvidos. Não transportar
o certificado narrow selected-day para operadores/consumidores que ele exclui.
Análise parcial ou helper não declarado bloqueia, sem relaxar o loader/checker.

Quando há W, preservar a prova D/P de v2, seleção anterior ao mutant e isolamento
da alteração. Rejeição colateral não é sucesso. Core/oracle/coverage e C/M/S usam
as regras normativas da autoridade explicitada; nenhuma fringe, lease ou exceção
de perfil existente se torna licença genérica. Um perfil ratificado só qualifica
seu alcance, em ledger próprio, nunca preenche esta proposta por analogia.

## 7. Composição, contagens e história

Novo ledger path_qualification/v3, SEM misturar suas provas com execution/matched
de semantic_mutation/v2. Um row por predicate_path_semantic/v2 esperado, ID antigo
preservado como target e nova autoridade explícita. Estado terminal verified só
após TODOS os artefatos/evidências da disposição serem confrontados.

```text
expected_predicates = enumerated_predicates = classified_predicates = verified_predicates
verified_predicates = semantic_witness + static_domain_proof + semantic_equivalence_proof
blocked = 0
```

É partição disjunta de IDs, NÃO soma de PASS entre ledgers. Num certificado
estático, verified não significa executed ou semantic_mutation_credit. Publicar
contagens separadas de provas estáticas verificadas, controles executados,
witnesses semânticos e equivalências, com IDs/instâncias e invocações próprias.
Ledgers obrigatórios de execução mantêm expected=generated=executed=matched.
Qualquer evento/captura incompleto, omissão, duplicata, replay ou fonte divergente
invalida sua evidência e bloqueia o fechamento correspondente.

Migração total: um row por ID v2 esperado, incluindo matches e pendências; target,
antiga autoridade/estado/evidência, nova disposição e justificativa, novos IDs
de evidência e hash normativo. Nenhum ID some. Confrontar conjuntos exatos,
não apenas2419 ou outra cardinalidade. Inventário v1→v2 já ratificado fica intacto;
não reconstruí-lo nem promover suas supersessões a testes.

Relatórios anteriores preservam UNSAT/RED/matched/valid/credit como publicados.
O velho ledger semântico não se torna verde: os rows estáticos/equivalentes têm
seu método supersedido prospectivamente após ratificação, não um witness cumprido.
Não somar387matches locais, selected-day1, focais ou relatórios de diferentes
autoridades. Reuso de evidência executada requer toda a identidade causal e a
invocação própria comprovadas; sem isso, nova execução necessária.

## 8. Critério de ativação e efeito no roadmap

Antes de aplicar: APTO DOCUMENTAL independente sobre ESTE método, sua suficiência
e limites; confronto local dos achados e ratificação explícita. APTO de helper,
verifier ou hashes não ratifica a substituição. A proposta não autoriza aplicação.

Depois, um recorte de implementação fechado: inventário/disposições/ledger e
integração à validação existente, com REDs gerados por classe/contraexemplo,
focais/afetados, uma ampla estável e auditoria independente do código completo.
Não criar auditoria por predicado/helper. Ramo não previsto bloqueia; duas falhas
da mesma classe exigem composição/contrato, nunca terceiro remendo nominativo.

Saída desse recorte: migração integral, ledgers exatos, provas/capturas válidas,
fontes/roots/TCB auditados conforme contrato e nova qualificação própria sob a
autoridade ratificada. Byte-binding candidato não vira validation_tcb_complete.
Enquanto falte qualquer parte, N02-G continua incompleto e NEXT-03 fechado.

N02-G-v3 só substitui a condição de saída PATH aqui descrita. Não basta este
ledger para GO: os76/76grafos,39/39entradas, G07/G08/G14, outras famílias G11,
pais/derivados e condições restantes do charter continuam integrais. G05/G06/
G09/G10/G13 e gates posteriores não são fechados por N02-G. Abrir NEXT-03 requer
seu pré-requisito global ratificado; não reduzir corpus ou selecionar subset
doméstico por conveniência nesta proposta.

O roadmap doméstico permanece em revisão. Sua qualidade factual e conversacional
não muda: precisão, follow-ups, isolamento, estado/recuperação, confirmação e
idempotência conservam suas metas. Esta decisão não é deploy/finance/receipt/
validated_parent, nem autorização de dados reais ou resposta financeira.

## 9. Revisão adversarial e saída finita

O candidato de código deve demonstrar estas classes, sem tratá-las como testes
já executados nesta proposta:

- Gerador omite alternativa/site/anchor/template ou deduplica valores iguais:
  confronto independente bloqueia; jamais singleton por ausência no gerador.
- Regra estrutural omitida/invertida, erro forjado/wrong-coordinate, compiler
  aceita membro selado como excluído: blocked antes de crédito/handles.
- IR/programa/helper lê outro campo ou ignora vínculo apesar de autoria correta:
  conformance/medição/trace/oracle falham; admissão positiva isolada não protege.
- Alternativa admitida passa com valores coincidentes: não usar equivalência
  sem relação necessária; manter referência/garantia faltante como blocked.
- Site misto com alternativa discriminante: exigir witness normal mesmo havendo
  outros sites singleton; negar escolha oportunista da disposição mais fácil.
- Snapshot/TCB/BUILD/certificado/parent adulterado e rehash, replay e clone:
  identidade/autoria/autoridade e freshness confrontadas; nenhum autoatestado.
- C/M/S compartilham erro ou oracles/expected vêm de actual: independente recusa;
  zeros, overflow, filtros, base temporal e pais mantêm controles herdados.
- Duplicar IDs ou somar prova estática com crédito semântico: partição e ledgers
  separados bloqueiam; história permanece inalterada.

Nesta etapa documental NÃO executar matriz ou ampla. Saída finita: um parecer
normativo sobre a proposta inteira, não sobre helpers. O auditor deve responder
se a composição realmente protege o campo usado e a resposta admitida, quais
hipóteses não estão cobertas e se algum critério foi enfraquecido indevidamente.

Veredito solicitado: APTO DOCUMENTAL PARA IMPLEMENTAR, NÃO APTO ou REVISÃO
INCOMPLETA. Não pedir GO de código/gate/produto. Evidência histórica só sustenta
a motivação:731sem alternativa,945recusas estruturais,201sem discriminante,
151referência pendente e4cofalhas/timeout NÃO são disposições v3 já provadas.
````
