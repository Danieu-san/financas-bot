# Aplicação finita de §5 aos rows de L vazio em S-01#1#1

Estado: argumento do executor PENDING_REVIEW. Não é novo método, aprovação
independente, qualificação automática, crédito semântico ou GO global.
O lote nativo de819 controles terminou e foi integralmente confrontado, e a
focal adversarial da guarda claim terminou com as quatro propriedades previstas.
Essas evidências executadas não transformam a presente nota em parecer independente.

## Objeto e alcance

O código inteiro é o herdado do candidato e050ad07ef1b877d38e81acea98d827d1eb59ffb,
sem alteração posterior de fontes, corpus, schemas, artefatos, roots ou quotas.
O método é72fc5a5b707909687da9b5cec892be2dcc892a62,
blob82112f0c4d6eeed21d4823c8b1dd3d3ca8ce1bf2, §§3–5 e7.

O inventário original contém2419 targets. A presente aplicação trata SOMENTE
dos11 targets/13 sites de S-01#1#1 cujo L é vazio em TODOS os sites.
A cardinalidade é um dado deste inventário, não uma constante nova do produto.
Os demais725 rows de L todo vazio não herdam execução positiva de S-01.
Rows mistos, A não fechado, W e equivalência não são absorvidos nesta prova.

O ledger r2 distingue preparação inicial e evidência atual do witness já
aceito. Mantém1 row verificado/2418blocked e todos os históricos inalterados:
`b4-02-pathv3-partial-qualified-ledger-r2-20261021.json`,
SHA3796929d291f64b01df528d9ba788ebf3cde3c469aae24ac4ac91d6ddc0890ed.
Os11 rows abaixo continuam blocked, sem crédito, enquanto esta aplicação não
for julgada independentemente e formalmente incorporada.

## 1. Enumeração finita anterior a M, não inferida da recusa

`pathLocatorDomainV3.js` deriva L de schema, registry e autoria admitidos;
não usa IR observado, resultado, trace ou tentativas de compiler para escolher
os membros. `claimPaths` percorre propriedades declaradas, inclusive opcionais
ausentes na fixture. `claimNominal` distingue ramo, forma e tipos nominais.
O registry está `closed_world:true`. O original é removido somente DEPOIS de
enumerar as opções de mesmo nominal no namespace e na forma originais.

Para claimPath, são resolvidos os ramos presentes e admitidos do schema de
claim: subject family/ref_id e period month/value. Não se pula para outro ramo
de subject/period que exigiria mudar a forma ou os outros campos da autoria.
`filters.budget_class`, ainda que opcional ausente, continua enumerável mas
tem enum distinto; não constitui alternativa nominal para coverage, state ou
time_basis. Campos de id também têm origem nominal distinta de family.

Para fieldPath, enumeram-se TODOS os anchors do mesmo kind no grafo e TODOS
os campos materiais daquele kind, não apenas o anchor usado. Para selector,
enumera-se o kind declarado, sem trocar para o namespace claim ou outro kind.
Em S-01 há um único anchor family, um único source_state e uma única collection.
O snapshot collection-events declara collection_name=events: members tem
forma sequence e item id/event; não é equiparado a ref escalar ou lista de person.

| Índice original | Predicado | Sites originais | Razão finita do singleton antes de retirar o original |
| ---: | --- | --- | --- |
|79|binding_3|claim.coverage|Único campo do ramo claim com enum complete/partial/unavailable.|
|689|binding_7|family_example.id; claim.subject.ref_id|Único anchor family e campo id/family; único ref_id/family no ramo claim atual, em namespaces separados.|
|1267|binding_4|claim.evidence_state|Único enum confirmed/estimated/projected no ramo.|
|1480|binding_5|claim.subject.kind|Único campo com o domínio enum completo de subject.kind desse ramo.|
|1520|link_5_pair|selector event.transfer_pair|Único campo event de ref escalar com nominal transfer_identity.|
|1565|binding_11|source_complete_june.coverage|Único anchor source_state e único campo desse kind com aquele enum de coverage.|
|1635|binding_12|source_complete_june.period; claim.period.value|Único campo month no kind source_state e único month no ramo period atual; sem cruzar namespaces.|
|1798|binding_6|claim.subject.ref_id|Mesmo fundamento nominal do site claim de binding_7, mas identidade/controle próprios.|
|1875|binding_1|claim.period|Único locator do record period de kind month; seus filhos têm formas escalares, não esse nominal.|
|1992|binding_10|collection_events.members|Único anchor collection e único ref_list com nominal sequence id/event no kind.|
|2417|binding_2|claim.time_basis|Único campo do ramo claim com o domínio enum completo de time_basis.|

Todos os sites são preservados, inclusive as duas ocorrências de
claim.subject.ref_id em predicados distintos. Não se deduplicam por valor.
O conjunto exato de target_id, qualification_id e admission_id é o do ledger
original mais o roster precomprometido, não os nomes desta tabela.

Da enumeração completa de L vazio segue A⊆L vazio e W⊆A vazio para a estratégia
ratificada. Esta é a razão lógica da disposição estática proposta; NÃO é a
recusa de unknown_path usada para declarar um domínio vazio. Não há tentativa
de transformar unknown_path em alternativa tipada, nem de trocar operador,
literal, nó ou kind para produzir um witness inexistente nessa estratégia.

## 2. Controle de barreira por site, já fixado antes dos negativos

O roster integral foi persistido antes do primeiro M:
`b4-02-empty-L-native-controls-20261021.roster.json`,
SHAee040698d6517b5ba4200d1df0c4cfbcb4aaf05beb6074e9b601a48a363e4f36.
Contém736 rows/819 sites, dos quais estes11 rows/13 sites.

`preparePathStaticDomainControls` admite somente rows cujos sites têm domínio
completo e L vazio. Fixa namespace, admission_id, regra e coordenada. O
materializador existente v2 mantém a forma e substitui somente o último
segmento pelo nome unknown_ derivado do admission_id; não modifica um schema
para forçar recusa. `constructCandidate` muda somente esse site no corpus,
admite a tabela de bytes e sela C/M/S antes de qualquer compile capturado.
O expected de M é recusa nativa, não IR tipado fictício.

`graphStructure.js` resolve fieldPath/ref_set/selector pelos campos do kind;
ausência produz path_missing. claimPath percorre os segmentos do claim
admitido com own/Array.isArray; ausência produz claim_path. `argument` passa
a coordenada do predicado/site e `atPath` atribui a PRIMEIRA localização nativa
ao erro registrado em WeakMap. Um Error de mesmo texto não ganha autoridade.
A entrada normal `validateGraphStructure` passa qualification=null; não é a
entrada especial de month-path nem um bypass concedido ao negativo v3.

O lote usa o compiler normal capturado de root
sha256:2281d7efd3b6627fe4679427b908b06ad29ea6e75cfea66aca3c387019bed151.
Cada controle precisa apresentar C admitido, M recusado na coordenada fixa e
S restaurado, IR/authority/access iguais em C/S e handles0. A primeira
contradição interrompe e inutiliza a captura; não é trocada por outro candidato.
O confronto terminal compara todos os819 registros ao roster, não uma amostra.

O lote terminou em2026-10-21T20:18:36.879Z, duração4997309ms, nativeexit0.
Os819 controles/736rows corresponderam integralmente ao roster:548claim_path,
271path_missing;548claimPath,192fieldPath e79selector. Todos os C/S foram
admitidos no compiler normal com o mesmo package_root/IR/access da baseline,
M recusado na coordenada correta, zero handles, dp_executionfalse e crédito0.
As895 fontes foram medidas antes/depois e novamente no confronto, sem diferenças.

Bruto integral819linhas/27600402bytes:
SHA b3bf56352146c06798cd103290669f0523e45dc9882311cf0f2bf1577e0c7099.
Confronto mecânico integral1117396bytes:
SHA64f8e6a8204c81bda4af8c3468eb2e1f5109540939bb83d828b8eb76c1462d03.
Projeção de transporte dos13 registros S01 COMPLETOS,438414bytes:
SHAb5734f1230b9dba4f087ad085220cd8b5585555c88b7f8d934dc2de38a1a4c9d.
Essa projeção não omite campos dos registros selecionados, mantém suas linhas
no bruto e não substitui os demais806controles por aprovação. O confronto
recalcula também a identidade determinística de cada candidato usando o
admission_id precomprometido e a troca única v2; checksum não é prova semântica.

## 3. Independência contra erro comum e controles adversariais

A prova liga enumeração declarada, campos/instâncias authored e corpo real do
checker, não somente sua mensagem. A ampla estável já contém PATH-V3-013/014
(forma/origem/escopo de empty L),015 (coordenada e Error forjado),018 (guarda
material removida/invertida, coordenada redirecionada e C cacheado),071
(claim opcional declarado e alteração do corpo claim rejeitada pelo pin).
O relato deve preservar a diferença entre essas coberturas, não chamá-las de
quatro REDs diretos da guarda claim se não foram esses os casos executados.

Focal finita adicional EXECUTADA20:19:29.859Z–20:19:58.399Z/28541ms/native0,
sem editar fontes físicas. Quatro corpos adversariais foram definidos antes
das capturas: retirar e inverter a guarda claim de own, redirecionar a
coordenada e fornecer IR de C cacheado ao M. Reusa o padrão e as APIs de018.
Relatório103878bytes/SHA3e03000c1f1d1b0c18b6014bbd309c7777c06a4ca31ff4e23e5c8248e4f3ec3e.

| Alteração intencional em memória | Resultado causal observado |
| --- | --- |
|Retirar a guarda claim|C/S continuam admitidos. M é recusado por predicate_types_claim_path, com coordenada autêntica de OUTRO checker; native_control_matched=false. Outra recusa não se torna a barreira graph_structure esperada.|
|Inverter a guarda claim|O próprio C válido é recusado com graph_structure_claim_path antes de M; não houve C/M/S completo nesse caso. A exceção direta não forneceu retained evidence.|
|Redirecionar a coordenada|C/S admitidos; M mantém mensagem graph_structure_claim_path mas registra args/0/forged. native_control_matched=false, apesar do texto correto e da origem nativa.|
|Admitir M por IR de C cacheado|A conformance integral detecta M com IR quando o selo exigia native_rejection_only_no_mutant_ir; conformance_failed=true, varianteM, handles0, sem resultado promovido a controle válido.|

As quatro raízes alteradas são distintas da raiz normal2281d7ef...; são corpos
deliberadamente defeituosos de TESTE, nunca nova TCB adotada. As895 fontes no
disco permaneceram exatas antes/depois. Nenhum launcher/guest foi executado.
É uma extensão focal da validação, não alteração de código produtivo nem uma
nova suíte ampla; os2788 testes da ampla anterior não foram contados como2792.
Não se alegam32 REDs por ter8sites claim: há um corpo comum own/atPath e quatro
classes de falha, ligados por source hash e pelas13 instâncias normais reais.
Não há nova gramática, modelo, normal-candidate retry ou execução guest.

## 4. Positivos reais, conformance executável e identidade no alcance exato

Já existem C/S reais de S-01#1#1 na invocação
1c665af2-7982-4b14-b49f-1afeb85ac1f2, executada UMA vez pela cadeia INTERNAL
normal. O provisionamento foi julgado externamente no objeto e4af6912...;
os pins FIXOS de freeze e ticket foram adotados antes da execução e dos handles.
O Node oficial e as quatro folhas da TCB foram medidos antes da primeira avaliação.
Construtor, hash calculado, flags BUILD e esta nota não autenticam o operador.

Observações completas:6024184bytes,
SHA762d1859a4702a584ae068ca59a7cf07f8f9173dc80d830b04054b9d10b18119.
Coverage normal:2527322bytes,
SHAcf592594bf3ae789f17ba8a3e6f330931490fa1975305191d2eb9db1ce508592.
São os dois blobs publicados no suplemento e050, sem guest ou trace refeito.
O parecer independente e050 examinou o resultado integrado e foi confrontado:
SHA29ef2d1add922f7325239cd1c9d3c08ed36481152ffad4641585b35d2fbec604;
recibo source-bound SHAe4332083195072217d098dd7164dee01c39b702fa423c2c11b64b3523f9c0a13.

C/S têm proof_satisfied=true, resultado BRL_minor169400, roots esperados e
arrays completos iguais. Cada mundo tem355 eventos D e3426 P; as seis fases
casam com expected derivado da autoria/contrato antes de actual, e cada evento
tem proprietário. O programa proof normal agrega os predicados integrais de
S-01, não somente link_2_refund_sign. A reutilização proposta para os11 rows
é a de baseline/restauração POSITIVOS do MESMO grafo e MESMA autoria/artefatos,
não a do witness M para lhes conceder11 créditos semânticos.

Cronologia explícita: os positivos guest C/S dessa invocação antecedem o lote
unknown_path. A restauração posterior a CADA unknown_path é S do compiler
normal, não uma nova execução guest. O argumento de reuso precisa, portanto,
ligar a igualdade integral de autoria/IR/access, os artefatos fixos e a ausência
de handles no negativo à aplicabilidade dos positivos anteriores. Não se deve
relatar S guest pós-controle que não existiu, nem presumir limpeza/isolamento
universal do SO. Se esse reuso não satisfizer o alcance de§5, registrar a lacuna
em vez de promover os11 rows por uma conveniência cronológica.

O BUILD confrontado e os registros de cada controle precisam ligar seu C/S ao
mesmo package_root/IR/access da baseline. A conformance normal já julgada liga
autoria→IR→programas reais, receivers/returns/callbacks, capacidades/quotas,
trace/aceitação e fechamento das receitas/deps, com os pin/basis/ticket antes
dos handles. O novo julgamento deve confirmar a aplicabilidade desse reuso a
TODOS os13 sites: ausência de guest novo não é dispensa de§5.

## 5. Resultado proposto e limites que não podem ser apagados

Se o argumento, controles terminais, REDs pertinentes e reuso positivo forem
suficientes, a disposição proposta para estes11 targets é static_domain_proof,
dp_execution=false para seus negativos recusados e semantic_mutation_credit=0.
Isso não criaria11 witnesses nem11 execuções próprias; preservaria a única
qualificação semantic_witness já aceita e toda a migração histórica.

A decisão continua PENDING_REVIEW. Cabe ao parecer integrado sobre o objeto
inteiro julgar totalidade/aplicação e os limites desta proposta, sem APTO por
contagem, hash, AST, reassembly, 819 recusas ou resumo do executor.
Não se pede uma nova aprovação isolada de helpers, subgate ou amostra.

N02-G não se encerra com estes11 rows: faltam as disposições restantes do
inventário e as outras obrigações pertinentes, famílias/parents e migração
integrais. Não se impõe equivalência universal§6 a um witness§4, nem se
transforma§7 em45988 provas novas/2419 reruns históricos. Finance/receipt/
validated_parent/globalGO/NEXT03 continuam false; dados apenas sintéticos.
