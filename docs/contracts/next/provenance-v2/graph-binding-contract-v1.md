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

Toda leitura causal, escalar ou estrutural, deve estar coberta pela fase correta;
leitura ausente/extra, campo non_material ou aresta ignorada impede aprovação.
selected_nodes e required_nodes são conceitos distintos: um registro examinado
para exclusão pertence às leituras, mas pode estar fora da seleção financeira.
Nenhum nó adicional pode ser admitido só para inflar a prova; seus papéis devem
ser necessários aos operands ou às obrigações explicitamente justificadas.

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
