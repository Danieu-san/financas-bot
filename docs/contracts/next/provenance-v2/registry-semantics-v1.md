# Semântica dos registries de autoria — N02-F

Estado: RASCUNHO NÃO RATIFICADO; zero implementação de operadores ou compiler.
Os dois JSONs associados são dados declarativos, não código executável.
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
