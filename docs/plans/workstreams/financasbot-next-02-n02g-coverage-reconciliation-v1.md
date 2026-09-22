# N02-G — diagnóstico e reconciliação de cobertura

Estado: diagnóstico local reproduzido em 2026-09-19; composição, consumo,
metadados e conversão civil locais; reconciliação integral pendente. Sem GO.
Base inspecionada: `22e7616b7ed7cb984a26193d53f4fd736ae1c3f6`.
O GO focal de seleção de `8b66d1e6eac869cf7363beee3b2c1445840fb66e`
permanece limitado ao delta e ao recibo já ratificados.

## Objetivo e limite

Confrontar as derivações existentes com as cinco dimensões publicadas do
trace_contract, identificando o pré-requisito de aceitação integral e dos
recibos de parents. Não implementar host/recibos sobre cobertura incompleta.
Não alterar grafos, contratos normativos, runtime de produto, políticas, pins
ou integrações reais. O comparador de desenvolvimento permanece em escopo.

Ferramenta: `scripts/agent/diagnoseNextProvenanceCoverage.cjs`. Executar com
Node 22.17.0, da raiz desta worktree:

```text
node scripts/agent/diagnoseNextProvenanceCoverage.cjs
node scripts/agent/diagnoseNextProvenanceCoverage.cjs --output .codex-temp/coverage-new.json
```

O segundo comando exige diretório temporário existente e arquivo novo. Sem
argumentos imprime apenas resumo; `--details` inclui os deltas por fact_key.
Exit zero significa que o diagnóstico terminou, nunca que a cobertura passou.

A sonda usa os mesmos roles e quatro famílias dos testes authoringIndex.
Expectativas vêm dos grafos, antes e independentemente da observação. Não
importa oracle e não confere resultados funcionais. Admite fixtures sintéticas
com autoridade local autocalculada e normalização LF, como o fixture de teste;
isso não prova autenticidade dos artefatos nem do host. Não é runner isolado.
O relatório identifica HEAD, alterações tracked, hash da ferramenta e digest
dos 52 documentos normalizados; HEAD sozinho não identifica árvore suja.

## Evidência obtida

As duas execuções locais, da sonda inicial e da ferramenta reproduzível,
produziram as mesmas contagens e deltas de cobertura:

| Verificação derivacional | Resultado |
| --- | --- |
| Grafos exercitados | 73 de 76 |
| Seleções coincidentes | 73 de 73 |
| Comparador parcial de reads/edges matched | 0 de 73 |
| Cinco dimensões exatas, desconsiderando eventos não classificados | 1 de 73 |
| Invocações com diferença em reads | 72 |
| Invocações com diferença em claim_reads | 34 |
| Invocações com diferença em edges | 65 |
| Invocações com diferença em structural | 51 |
| Invocações com diferença em nodes | 24 |

As dimensões se sobrepõem; não somar essas contagens como número de defeitos.
Os três não exercitados são M-01#1#3 (ranking_winner), M-01#1#4
(consumption_difference) e M-14#1#3 (income_minus_open_bills). Não foram
reprovados por esta sonda: faltam execução e recibos dos operandos derivados.

Digest dos documentos normalizados, calculado sobre os pares path/SHA256
ordenados e serializados em JSON:
`b62696ec64697af8fdb2c7c47fd11260df7ec4b7aeac1cef133472e82d47c037`.

## Causas distintas, sem exceções por grafo

1. **Projeções ainda não compostas.** compareReadEdgeCoverage é explicitamente
   parcial e fail-closed. Não classifica identity, operações de operand sets e
   seleções, navegação em records ou civil_date. A sonda observou 154 gets de
   records, 3.586 eventos de identidade e dois civil_date, além dos eventos de
   sets/seleções. Seleção já possui comparador próprio. Ignorar esses eventos
   não resolve as divergências das cinco dimensões em 72 invocações.
2. **Acesso real diferente do contrato autorado.** M-15#1#2 exige
   bill_rent_b/person_id, mas metricDirectReads faz follow('person_id') sem
   get desse campo. M-16#1#1 apresenta o mesmo padrão em merchant_key.
   Traversal e leitura escalar são observações independentes; não sintetizar
   get dentro do comparador nem eliminar a obrigação para fazê-lo passar.
3. **Leitura real extra.** Em M-15#1#3 e M-15#1#4, collectionMatches lê
   collection_name, ausente dos respectivos required_reads. Essa leitura é
   real, não um artefato da classificação. Sua necessidade deve ser confrontada
   com o contrato do evaluator antes de decidir entre código e autoria.
4. **Semântica estrutural diferente.** Por exemplo, membership de family.members
   não prova iterator/order/cardinality. Instrumentar uma operação não autoriza
   anunciar outras operações que o avaliador não executou.

S-16#1#1 é o único caso com as cinco dimensões exatas na sonda, mas seus dois
gets de records e duas identidades ainda impedem matched. Isso fornece um
controle pequeno para testar a composição, não uma permissão de aceitação.

Fontes: graph-binding-contract-v1.md §4/§5; proofAcceptance.js;
observationContract.js; metricDirectReads.js; metricSelection.js;
graphCompiler.js; authoringIndex.cases.js. Os caminhos de código ficam sob
src/next/provenance/ e o teste sob tests/next/provenance/.

## Composição inicial implementada localmente

compareReadEdgeCoverage e compareSelectionCoverage agora informam as sequências
que efetivamente examinaram. Seus critérios anteriores de matched permanecem.
comparePhaseCoverage executa ambos sobre o mesmo trace/escopo/expectativas e
compõe essas sequências, sem aceitar resultados ou permissões do chamador.
Uma sequência não pode receber dois componentes responsáveis.

O inventário por evento distingue covered, invalid (erro explícito da seleção)
e unsupported (não comprovado pelos validadores disponíveis). Unsupported
também pode conter uma operação inválida ainda sem diagnóstico específico;
não significa que a operação seja válida. Covered atribui responsabilidade
por observação, não GO individual: todos os deltas e erros dos componentes
continuam impedindo matched. O resultado conserva graph_accepted=false.

Somente as operações do lifecycle da seleção comprovadas pelo comparador
contribuem: start, acesso ao candidato durante a seleção, decisão e retorno.
O comparador antigo verifica identidade da view sem validar seu consumo;
por isso iterate/next/length/etc. de sets/views continuam unsupported.
Records, identidade, civil_date e medições também não foram liberados.
Esse incremento não afirma que a cobertura de eventos já é total.

Validação local: nove REDs novos antes da função existir; 30/30 testes focais;
quatro testes de integração abrangendo as 73 derivações. Inclui retirada de
cada evento causal com renumeração, troca de escopo, entradas malformadas,
eventos sem validador, navegação/traversal/membership não substituindo outras
leituras e tentativa de fornecer vereditos prontos. A integração compara os
deltas dos componentes isolados com os mesmos deltas na composição.
Depois da integração, a bateria causal tests/nextProvenance.test.js passou
274/274, zero FAIL/SKIP/TODO, Node 22.17.0, 82,9 segundos. Os 73 registros da
sonda preservam exatamente os deltas anteriores; workflow/diff-check OK.

Nova sonda: 8.013 eventos cobertos, zero invalid da seleção, 4.629 unsupported,
73 seleções corretas e zero fases integralmente cobertas. As cinco contagens
de divergências anteriores permanecem. Nenhum grafo foi aprovado por essa sonda.
A ampla verde anterior não valida este delta causal; não iniciar nova ampla
enquanto o candidato de reconciliação estiver incompleto.

## Consumo de conjuntos e views implementado localmente

comparePhaseCoverage passa a exigir operandSets: lista explícita de role e
aliases provenientes dos operand_bindings admitidos. Roster ausente, duplicado
ou diferente do candidate_set do binding de seleção é rejeitado; as observações
não fornecem autoridade. Os consumidores de teste e a sonda usam os bindings
do claim, não os resultados da execução.

O componente interno compareOperandConsumption valida length, includes, at,
iterate, next, return e reuse_iterator. Compara cada resultado com o roster
imutável e o cursor; done antecipado, membro/índice trocado, resultado de
membership ou comprimento falso e cursor incoerente impedem matched. Views
selecionadas são registradas somente pelo retorno efetivamente comprovado da
seleção, na mesma fase e role. Não aceita recibos externos nem apenas o digest.

Limite explícito: o protocolo não identifica cada instância de iterador.
Por isso, a abertura de dois iteradores vivos sobre a mesma role/view produz
ambiguous_iterator e bloqueia o componente, mesmo quando os handles permitem
essa execução. Não adivinhar qual cursor originou um evento. Iteradores de
views distintas podem intercalar e uma view fechada pode ser iterada novamente.
Essa restrição conservadora não altera o protocolo ou o comportamento do guest.

A cobertura de consumo é de conteúdo/protocolo, não uma declaração de leitura
de payload nem de conclusão do grafo. Em especial, enumerar um roster não
satisfaz required_structural de um campo de snapshot; ler seu comprimento não
consome os nós. Nenhuma alteração de grafo/contrato normativo foi realizada.

Sete grupos novos: quatro falharam antes da implementação; três testes de
rejeição já passavam por bloqueio conservador da nova entrada. Focal final:
37/37 PASS; integração: 4/4 PASS, 73 derivações. Os testes adulteram resultados
das operações, cursores, ordem/omissão de eventos, origem da view e autoridade
dos rosters; incluem listas vazias, retomada após return e iteração completa.

Sonda após consumo: 8.900 covered, zero invalid, 3.742 unsupported. São 887
eventos adicionais efetivamente validados; seleções e deltas de cobertura dos
73 registros anteriores preservados exatamente. Identidade (3.586 eventos),
records (154) e civil_date (2) continuam não suportados nessa sonda. Medições
não ocorreram nela; não inferir sua validação pela ausência de eventos.
Bateria causal posterior: 281/281 PASS, zero FAIL/SKIP/TODO, Node 22.17.0,
103,4 segundos. Syntax, agent-workflow e diff --check OK. Suíte ampla e
auditoria do delta continuam pendentes; este registro não promove GO.

## Identidade e navegação implementadas localmente

graphCompiler.observationMetadata({fact_key, phase}) exporta apenas alias,
role, identidade e caminhos de records presentes. Usa as mesmas formas
admitidas e reachability das fábricas de acesso; resolve contexto/roles de
derivation e os namespaces de proof separadamente. Não lê um trace, não
exporta payload e não permite override por selector. É imutável e rejeita
grafos com parents ainda indisponíveis. Elementos record de sequences não
são inventariados neste incremento; a cobertura deles permanece pendente.

O comparador recebe accessBindings do controlador local, nunca do evaluator.
Ele ainda não autentica o host nem a origem desses bytes: isso continua no
gate de execução confiada. A composição não admite vereditos externos nem
deduz os metadados dos eventos. A igualdade de identidade é separada das
leituras de payload; um nó fora de required_nodes continua incompatível,
mesmo se a identidade coincidir com um snapshot admitido.

Para records, get/has/keys exigem o ancestral observado no mesmo alias/role.
Abrir um record só é coberto se seu caminho leva a leitura escalar/estrutural
declarada (incluindo keys do próprio record). Um evento de campo filho não
repara a ausência de navegação pelo pai. Trocar record por scalar/sequence,
navegar em campo inexistente ou abrir record admitido mas não necessário
impede matched. Repetições legítimas preservam suas sequências no log.
Get de record nunca satisfaz uma leitura de folha. Keys sobre estruturas que
não tenham sido admitidas/abertas como records ficam bloqueadas, não inferidas.

Oito grupos focais novos: sete REDs e um grupo de rejeição que já passava
conservadoramente; um RED adicional da fábrica no teste de integração.
Resultado focal final: 45/45 PASS. Integração dirigida: 5/5 PASS, incluindo
73 derivações e a fábrica de metadados em derivation/proof. Cobrem troca de
kind/ref_id/version/role, remoção/reordenação dos ancestrais, campo filho sem
pai, navegação extra, metadados malformados/duplicados e imutabilidade.

Sonda final desse incremento: 12.542 covered, 98 invalid e dois unsupported.
Os 98 erros são identity_node_not_required, distribuídos nos mesmos 24 grafos
que já tinham divergência de nodes. Não foram normalizados ou dispensados.
Os dois eventos unsupported são civil_date; ausência de medições na sonda
não demonstra que foram validadas. Todos os deltas antigos dos 73 registros
permanecem exatamente iguais.

S-16#1#1 é o único matched de cobertura parcial de derivation. O resultado
conserva graph_accepted=false: proof, obrigações, R, roots/host confiados e
recibos não foram aprovados por esta comparação. Os demais 72 casos ainda
exigem reconciliação dos acessos com o contrato, não afrouxamento da comparação.
Bateria causal posterior: 290/290 PASS, zero FAIL/SKIP/TODO, Node 22.17.0,
103,2 segundos. Syntax, workflow e diff --check OK. Suíte ampla/auditoria
continuam pendentes para o candidato estável; nenhum commit novo foi publicado.

## Conversão civil implementada localmente

compareCivilDates é um componente interno de comparePhaseCoverage. Exige o
get escalar imediatamente anterior ao civil_date na sequência global, no mesmo
alias/role/path/fase, com igualdade do instante literal. Não reutiliza leitura
antiga, não normaliza strings de instantes equivalentes e não empresta um
get de outra fase. A segunda conversão precisa de novo get, como na primitiva
instrumentada. O componente não substitui o dono da leitura nem seus erros.

A data é recalculada pelo conversor existente civilDateInPinnedTimezone,
incluindo suas verificações de Node/ICU/tz/configuração e overrides. Data
adulterada, instante inválido, runtime incompatível ou origem ausente impedem
matched; timezone/calendário fora do protocolo são rejeitados na admissão.
Não há mudança de regra civil, relógio, timezone do processo ou contrato.
Essas checagens não autenticam o binário do runtime ou os roots do TCB.

Seis grupos RED observados antes da implementação. Focal final: 54/54 PASS
(51 testes de cobertura e três do conversor). Incluem fronteiras de meia-noite,
offset explícito, DST histórico, frações, campo/role/instante trocado, get
removido ou posterior, conversão duplicada, lacuna global causada por outra
fase, resultado inválido e override de ICU. O override sintético de teste
é sempre restaurado no finally e não altera a configuração do projeto.

Sonda após este incremento: 12.544 covered, 98 invalid, zero unsupported.
Os dois eventos civis foram comprovados e todos os 73 vereditos/deltas/erros
anteriores foram preservados. Apenas S-16#1#1 tem matched parcial derivacional;
graph_accepted=false em todos os resultados. Zero unsupported aplica-se só
aos eventos exercitados: não houve M, pais derivados ou execução integral.
Bateria causal dirigida posterior: 80/80 PASS (authoringIndex, instrumentedAccess,
causalRecorder), 66,9 segundos, Node 22.17.0, zero FAIL/SKIP/TODO. Os 54 testes
focais verdes não foram repetidos. Syntax/workflow/diff-check OK; corpus completo,
ampla e auditoria não foram executados neste incremento. Alterações ainda locais.

## Triagem causal por família — 2026-09-19

Leitura do relatório local `.codex-temp/n02g-coverage-civil.json`, sem nova
execução dos 73 grafos. SHA256 dos bytes desse relatório:
`01ef0958b5511060ae71b0ffe0dcfc9c8b7cc160f7272e47d51134ef8d8606d9`.
O arquivo é temporário, não uma evidência publicada; sua reprodução usa a
ferramenta e as limitações de autoridade descritas acima. O HEAD da base não
identifica sozinho o código local modificado que o produziu.

Agrupamento pelo mesmo despacho de métricas da sonda; cada célula conta
invocações com ao menos uma divergência nessa dimensão, não eventos ou defeitos:

| Família | Exercitadas | Reads | Claim reads | Edges | Estrutura | Nodes | Cinco dimensões exatas |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Econômica | 31 | 31 | 31 | 31 | 31 | 8 | 0 |
| Direta | 21 | 20 | 3 | 13 | 9 | 10 | 1 |
| Efeitos | 13 | 13 | 0 | 13 | 3 | 5 | 0 |
| Parcelas | 8 | 8 | 0 | 8 | 8 | 1 | 0 |

As dimensões se sobrepõem. O único controle exato continua S-16#1#1, sem
aceitação integral. Esta triagem identifica classes causais e prioridades;
não afirma que cada delta já recebeu uma decisão normativa definitiva.

### A. Defeito semântico demonstrado no avaliador

`evaluator-contracts/consumption_total.json` exige evento compensado para uma
compensação. Em `metricSelection.selectEconomicEvents`, o traversal de
`compensates` está condicionado aos modos de filtro por categoria/orçamento;
o modo `total` não o executa. A ausência é relevante para a semântica, não
somente para uma contagem de reads.

Sonda focal em memória, Node 22.17.0, reutilizando o fixture instrumentado de
`tests/next/provenance/metricSelection.cases.js`, com pessoa p1 e junho/2042:

| Entrada sintética | Resultado observado | Traversals de compensates |
| --- | ---: | ---: |
| Compra expense -100 e compensação +25 ligada à compra | 75 | 0 |
| Mesmos eventos, retirando o vínculo da compensação | 75 | 0 |
| Alvo trocado para categoria income, +100; compensação +25 | -25 | 0 |

A segunda linha é contraexemplo direto à exigência de existência do vínculo.
A terceira demonstra ausência de inspeção do alvo; as restrições completas de
elegibilidade do alvo devem ser confrontadas com as outras regras normativas
antes de fixar seu erro esperado. Não inventar a regra a partir deste resultado.
Todos os controles da sonda foram revogados e assertHealthy passou. O primeiro
harness, em outro realm JavaScript, foi rejeitado por observation_shape_invalid
antes da execução; isso era incompatibilidade do harness, não finding do produto.
A reprodução acima usou o mesmo realm dos handles, sem alterar suas validações.

Esse experimento não é teste RED versionado nem correção. O teste existente
METRIC-SELECTION-001 aceita qualquer traversal (por exemplo, category_id) e
portanto não demonstra o traversal específico da compensação no modo total.
O próximo RED deve testar a obrigação, não apenas o total numérico.

### B. Contrato de observação não satisfeito

- **Referência escalar versus vínculo:** category_id falta em 64 invocações
  (31 econômicas, 12 diretas, 13 de efeitos e oito de parcelas). As três
  primeiras famílias frequentemente fazem follow sem get; parcelas também
  deixam de examinar campos em candidatos excluídos. A aresta person_id falta
  nas mesmas contagens por família, embora ler seu escalar não a comprove.
  M-15#1#2 e M-16#1#1 isolam o sentido inverso: follow de person_id/merchant_key
  acontece, mas o escalar exigido não é lido. Não sintetizar get a partir de
  follow. Um eventual leitor comum deve usar o valor lido para conferir a
  identidade resolvida, com semântica do campo explícita, não gerar reads vazios.
- **População versus membership:** faltam arestas family.members e operações
  cardinality/iterator/order em 28 invocações. includes responde à presença
  de um elemento; não prova enumeração integral. Separar verificação da
  população admitida do predicado de elegibilidade, sem trocar um evento por
  outro no comparador. A enumeração deve ter uso causal verificável.
- **Curto-circuito em parcelas:** os oito grafos têm reads/edges/estrutura
  divergentes. has(installment_plan) e retorno antecipado antecedem date/state
  e demais campos dos candidatos excluídos; iterar IDs de plan.members também
  não percorre as respectivas arestas. O contrato de grafo §4 exige cobertura
  declarada de todos os candidatos. Não apagar essas obrigações porque a
  seleção final coincidiu; antes da correção, distinguir campos presentes,
  opcionais e população que cada fase deve examinar.
- **Contexto:** evidence_state é leitura extra em 34 invocações (31 econômicas
  e três diretas que reutilizam seleção econômica). O código usa essa leitura
  para rejeitar entradas; removê-la não seria limpeza neutra. Decidir seu dono
  e sua necessidade entre admissão, evaluator e prova antes de alterar código
  ou autoria.

### C. Conflitos que exigem justificar a autoria, não preencher o trace

- `due_bill_ids` de M-15#1#1 exige amount_minor, mas a fórmula publicada
  seleciona IDs por pessoa/status/data e retorna sua ordem. A necessidade
  causal do valor para essa derivação ainda não está demonstrada.
- S-04#1#1 (movement_ids), M-02#1#1 e F-03#1#1
  (consumption_by_instrument) exigem saldo inicial e sua data. As fórmulas
  publicadas não usam saldo inicial. Isso justifica revisão da obrigação,
  não sua remoção automática; pode haver uma obrigação de prova a explicitar.
- collectionMatches lê collection_name em três invocações; M-15#1#3 e #1#4
  exemplificam o extra. A checagem decide se a coleção é adequada. Determinar
  se o binding admitido já fornece autoridade suficiente ou se a autoria
  omitiu a leitura necessária; não eliminar silenciosamente a checagem.
- Validar conta/cartão é requisito explícito de invoice_payment_amount,
  porém 24 grafos no conjunto têm nodes extras e 98 identidades bloqueadas.
  Separar, por papel/fase, alvo necessário à validação e inspeção excessiva.
  Não incluir todo alvo percorrido em required_nodes por observar o actual.
- category.kind falta em 45 invocações, inclusive categorias não consumidas
  pelo predicado. A verificação da população completa precisa de fundamento
  no contrato; não ler tipos ociosos só para satisfazer a lista autorada.

Essas questões continuam abertas. Qualquer proposta de mudança dos documentos
normativos deve explicitar a obrigação causal, o delta e a revisão independente.
Nenhum grafo, contrato, comparador ou evaluator foi alterado nesta triagem.
Não houve reexecução focal/ampla: a nova evidência é a agregação do relatório,
o confronto estático e a sonda adversarial específica acima.

Telemetria prospectiva: Status informou configured=true, running=false,
healthy=false. Métricas deste objetivo: NAO_DISPONIVEL, nunca zero. Não iniciar
coleta ampliada nem bloquear o gate por essa lacuna operacional.

## Reparo local da compensação — 2026-09-19

Desenho do reparo de compensação, antes de editar o evaluator: a resolução da
categoria efetiva depende da contribuição econômica (expense/compensation),
não de uma lista de modos que filtram por categoria. Reutilizar o bloco atual
de follow, kind event e categoria expense admitida; antecipar economicMatch
para decidir se essa regra é aplicável. income não consome compensation e
conserva seu trace. Total/instrument/statement têm o vínculo compensates
declarado em derivation nos respectivos grafos; não modificar esses grafos.
Não impor ao alvo o mês, instrumento ou seleção da compensação. Não adicionar
checagens novas de estado/titular do alvo neste reparo delimitado: a família
effects já tem regras próprias mais fortes, que não serão enfraquecidas nem
transplantadas sem reconciliação normativa. createCategoryReader e seu contrato
exportado não mudam; efeitos e eligible_event_count permanecem consumidores
indiretos na bateria causal. REDs gerados cobrem presença do vínculo, alvo
incompatível, IDs/valores/ordem variados e controle de renda sem nova resolução.

Implementado exatamente esse desenho em metricSelection: economicMatch é
calculado antes da categoria efetiva e a resolução de compensation depende
dele, substituindo a lista de modos. Não foi acrescentado acesso escalar
artificial, alterado comparator ou reescrito contrato/grafo. A falta de leitura
escalar de compensates continua registrada e não é dispensada pelo traversal.

Quatro grupos novos em metricSelection.cases: três REDs comportamentais antes
da correção, mais controle de renda que já passava. Cobrem seis bindings de
consumo, três valores, IDs variáveis, ambas as ordens dos eventos, compra fora
da janela e sem o cartão consultado, vínculo ausente, alvo de tipo errado,
autorreferência e alvo income. O conjunto falho não retorna seleção e fica
não saudável. As duas expectativas de erro internas foram corrigidas para o
erro público access_set_predicate_threw, conforme a fronteira já existente de
createNodeSetAccess; essa adaptação de teste não alterou o acesso nem o kernel.

Focal final: 15/15 PASS. Consumidores indiretos metricDirectReads/metricEffects:
10/10 PASS. Integração dirigida OBSERVED-METRIC-001..004: 4/4 PASS sobre 73
derivações, preservando valores dos oracles e seleções. O teste 001 ganhou
depois uma asserção explícita das arestas compensates esperadas, extraídas
do grafo antes de executar; somente ele foi reexecutado, 1/1 PASS sobre as
31 métricas econômicas. Não contar essa repetição como teste distinto.

Uma sonda pós-correção: `.codex-temp/n02g-coverage-compensation.json`.
Fixture digest preservado; 73 seleções coincidentes, 12.635 covered, 98 invalid,
zero unsupported e apenas o mesmo S-16#1#1 com matched derivacional parcial.
As contagens de invocações divergentes em cada dimensão não mudaram, pois
continuam existindo outras faltas nas mesmas invocações. O delta exato remove
somente e0058 (compensates) de missing edges em 13 grafos: sete consumption_total,
três consumption_by_instrument e três statement_total. Nenhuma falta/extra
nova; 60 registros inteiramente idênticos. Os 98 erros de metadados são iguais
desconsiderando o deslocamento de sequence causado pelas novas observações.
Os 91 eventos adicionais são sete por invocação afetada, não 91 novos testes.

Revisão local do diff e evidência causal concluídas para este incremento;
correção ainda local, não auditada e sem GO novo. Não executar ampla enquanto
persistir reconciliação do candidato. Sem commit/push ou acesso a produção.

## Referências escalares — reparo local de contas e regras

Desenho registrado para referências escalares: helper interno referencedIdentity
em metricDirectReads.js lê/valida o ID do campo, resolve follow, valida kind,
ID e versão pelo identity existente e exige igualdade escalar/ID resolvido.
Retorna a identidade já validada para a seleção existente. Escopo inicial:
bills_open/due_bill_ids/due_bills_total e o ramo compartilhado
owned_cards/merchant_rule_ids. Os dois call sites são explícitos, sem tabela
por fact_key e sem alteração de instrumentedAccess, comparator ou documentos
normativos. Outros consumidores exigem sua própria análise causal antes de
migração. person_id, owner_id e merchant_key nesses papéis são IDs de alvos,
não aliases de grafo ou nomes de estabelecimento.

Arquivos existentes: src/next/provenance/metricDirectReads.js,
tests/next/provenance/metricDirectReads.cases.js e integração já registrada
authoringIndex.cases.js se necessário. Nenhum arquivo novo. A admissão já
rejeita vínculo/valor incoerente; testes com handles reais preservam isso.
Test doubles somente na fronteira do evaluator demonstram que o escalar lido
participa da rejeição, sem alegar que um handle incoerente passa no compiler.
Propriedades: IDs diferentes dos aliases, ordem e exclusões preservadas,
get e traversal distintos, escalar ausente/inválido/divergente e controle válido.

Implementado o helper acima e aplicado aos dois call sites declarados. O
escalar lido participa de comparação com o ID do alvo; kind e versão continuam
validados pelas rotinas existentes. A admissão de vínculos e o comportamento
de follow permaneceram intactos. Nenhuma alteração normativa.

Três grupos novos: dois REDs antes da implementação, um controle de admissão
já verde. IDs e aliases distintos, três IDs por métrica e duas ordens preservam
seleção e exclusão em quatro métricas; ausência, tipo inválido e divergência
do escalar rejeitam na fronteira do evaluator. O double dessa fronteira não
é apresentado como handle admitido. O teste separado de admissão confirma que
relações incoerentes continuam rejeitadas antes da execução real.
Focal: 11/11 PASS. Integração OBSERVED-METRIC-002: 1/1 PASS, abrangendo as 21
derivações diretas e seus oracles. As expectativas de leitura vêm dos campos
declarados no grafo antes da execução; get e traversal são verificados
separadamente para os candidatos de bills/cards/rules.

Sonda única: `.codex-temp/n02g-coverage-references.json`. Remove sete faltas
de reads em cinco grafos, sem falta/extra nova: S-07#1#1, M-14#1#2, M-15#1#1,
M-15#1#2 e M-16#1#1. Os outros 68 registros são idênticos. Fixture digest e
os 98 erros de metadados permanecem, descontando deslocamentos de sequence.
São 12.642 covered, 98 invalid e zero unsupported. As 73 seleções coincidem;
70 invocações ainda divergem em reads. Outras dimensões preservam suas
contagens: claim_reads 34, edges 65, structural 51 e nodes 24.

Três matched derivacionais parciais: S-16#1#1, M-15#1#2 e M-16#1#1.
Em todos, graph_accepted=false; isso não emite recibos nem concede GO integral.
M-15#1#1 ainda exige amount_minor na autoria, questão causal separada no item C.
Código/testes/checkpoint locais; ampla e auditoria seguem pendentes para o
candidato estável. Nenhum commit/push, publicação ou ação de produção.

## Referências de categoria — implementação local, 2026-09-20

Desenho para category_id: extrair readReference em metricReferences.js,
dependendo somente de literalTypes. Argumentos node/field/kind; lê o escalar
como ID, resolve follow, valida kind, ID e digest da versão do alvo e confere
igualdade com a referência lida. Retorna node/ref/version; o chamador mantém
sua regra de membership e versão esperada. Não criar listas de métricas/fatos
nesse helper nem fazê-lo escolher alvos a partir dos valores esperados.
metricDirectReads passa a importá-lo; createCategoryReader conserva índice
de categorias e checagem de versão da população; refund_amount usa o helper
para as categorias da compensação e da compra (não possui role categories).
A assinatura pública de createCategoryReader não muda. Leituras repetidas
legítimas podem diminuir ao reutilizar ref já validado; não alterar required_reads.
Guest bundle requer inventário explícito da nova dependência, sem promover
executable ou medições M. REDs devem comprovar get/traversal e causalidade do
escalar nos dois caminhos de categoria, além de preservar as rejeições de
população/kind/versão. Paths concretos registrados no checkpoint antes de criar.

O helper foi extraído e os três consumidores migrados conforme o desenho.
createCategoryReader preserva membership e versão esperada da população;
refund_amount lê a categoria própria e a da compra pela mesma regra geral.
Não houve mudança em instrumentedAccess, comparator ou contratos normativos.

Cinco grupos causais novos: quatro REDs antes da implementação e um controle
de membership/versão já verde. O escalar adulterado em doubles de fronteira
passa a impedir o resultado; doubles não são prova de admissão pelo compiler.
Get e traversal distintos são verificados em selecionados, excluídos e compra
alvo de compensação. Os valores financeiros e seleções continuam preservados.

Validação afetada: 33 testes de métricas PASS (18 seleção, 11 diretos e quatro
efeitos) e quatro de guest bundle PASS. O teste de bundle inicialmente tinha
expectativa incorreta de quatro imports: há quatro arquivos e cinco arestas
de importação no pacote de consumo. Corrigida a expectativa, somente o teste
afetado foi repetido. O teste adicional de pacotes diretos/efeitos foi executado
na retomada após um bloqueio operacional de aprovação por limite de uso; o
comando bloqueado não havia sido executado. Ambos os pacotes incluem o helper
direta e transitivamente e rejeitam sua ausência. executable continua false.

Integração dirigida OBSERVED-METRIC-001/002/004: 3/3 PASS, 65 derivações com
oracles e seleção conferidos. Inclui asserções dos campos category_id autorados,
obtidas antes da execução. Não repetir o teste de parcelas, que não mudou,
nem o corpus completo/ampla neste incremento.

Sonda única `.codex-temp/n02g-coverage-categories.json`: 563 faltas de leitura
event/category_id resolvidas, de 736 para 173 ocorrências em todos os grafos.
São 47 registros alterados (31 econômicos, 13 de efeitos e três contagens
diretas que reutilizam seleção econômica); os outros 26 são idênticos.
Há DUAS NOVAS leituras extras, documentadas abaixo; não declarar delta livre
de regressões de cobertura. Fixture digest e os 98 erros de metadados foram
preservados, descontando deslocamentos de sequence.
Contagens: 13.239 covered, 98 invalid, zero unsupported, 73 seleções coincidentes,
três matched parciais (S-16#1#1, M-15#1#2, M-16#1#1), todos graph_accepted=false.
Contagens de invocações divergentes permanecem: reads 70, claim_reads 34,
edges 65, structural 51 e nodes 24; remover ocorrências não necessariamente
elimina todas as divergências de uma invocação.

### Conflito de fase confirmado em refund_amount

M-06#1#2 e F-06#2#1 ganharam a leitura extra
evt_restaurant_b/category_id. A categoria da compra já era percorrida e usada
pelo evaluator; agora a fonte escalar também é observada. Antes do incremento,
o alvo original e as categorias já figuravam como nodes extras, com sete
leituras extras por grafo. Os novos gets não criaram a inspeção da compra,
mas ampliaram a divergência observacional em um campo por grafo.

O confronto estático mostra que derivation.required_nodes contém somente
evt_refund_b. Nenhum campo de evt_restaurant_b é requerido nessa fase; seus
campos estão declarados em proof. A derivation exige somente as arestas
person_id e category_id da compensação; seu traversal compensates já era
extra. Por outro lado, refund_amount.json exige vínculo ao evento compensado.
Isso é conflito concreto de responsabilidade entre fórmula, prova e autoria;
não justificar sua resolução apenas pelo trace ou pelo resultado numérico.

Manter a rejeição e a pendência, sem dispensar gets, emprestar prova de outra
fase ou incluir automaticamente os nós visitados. Este incremento continua
local e não é candidato aprovado. Nenhum commit, push, ampla ou auditoria nova.

## Refund: desenho revisado e implementação local (2026-09-20)

Proposta/documentos publicados em 614abbe e 8a95579; parecer independente do
segundo hash: APTO para implementar, não GO de código. Primeira revisão limitada
pelo tamanho do arquivo de grafos; a segunda leu um extrato integral dos dois
objetos, cuja equivalência ao blob original foi conferida localmente.
Referências: financasbot-next-02-n02g-refund-phase-decision-v1.md e
../../audit-evidence/n02g-refund-phase/independent-review.md.

Implementado localmente: admissibilidade explícita de refund no evaluator
contract; referência de pessoa/compensates usando a primitiva comum; cinco
nós, 16 reads e quatro arestas derivacionais fixados antes da execução. Registry
e seu digest atualizado. Proof/predicates/obligations/selections preservados;
os outros 74 objetos de grafo permaneceram idênticos. Não há regra por fact_key.

Quatro REDs novos observados antes da correção; nove focais passaram depois.
Bateria afetada: 41 testes de authoringIndex, 78 dos módulos de admissão/
contratos, sete de efeitos e quatro de bundle PASS (130 testes distintos).
O teste de compatibilidade foi ajustado pelo delta causal explícito de quatro
edge-only cases (e0002/e0004 em cada refund), de 66/1133 para 64/1129.
Gerador refund cobre month/date, 24 positivos e 144 mutações. A sonda anterior
de quatro retiradas de guards em memória foi detectada pelo teste de
caracterização; nenhum arquivo runtime foi modificado por essa sonda.

Sonda n02g-coverage-refund-phase.json: 73 seleções corretas; cinco matched
PARCIAIS; 13.261 covered, 86 invalid, zero unsupported. Somente M-06#1#2 e
F-06#2#1 mudaram, passando a 45 covered/zero invalid cada; 71 registros ficaram
idênticos ao diagnóstico anterior. Fixture digest muda legitimamente por causa
dos documentos normativos. graph_accepted=false, sem host/medição/recibos.
Código e mudança normativa ainda locais: sem ampla, commit/push ou auditoria
de código desse incremento. As publicações acima são somente documentais.

## Próximo incremento delimitado

População familiar: a semântica de consumption_total exige membros exatos e
o contrato já requer iterator/cardinality/order e as arestas family.members.
Não há obrigação derivacional de ler campos dos alvos pessoa em S-01#1#1;
não acrescentar tais leituras nem identidades só para validar membership.

Desenho: adicionar followMember(field, ref_id) à API instrumentada para resolver
somente uma aresta ref_list já admitida, por campo e ID material (não alias ou
edge_id). Deve reutilizar traverse e emitir somente seu evento; não fabricar
get, enumeração ou identidade. Recusar singular, role_ref_list, escopo aninhado,
ref ausente/ambígua, argumentos malformados, revogação e falha do transporte.
Nenhuma expansão de reachability, roots, autorização ou novos opcodes.

Compor leitor de IDs referenciados em metricReferences: get da lista, length,
enumeração completa, IDs válidos/únicos, resolução de cada membro e conferência
de cardinalidade; o conjunto produzido deve ser usado na seleção. A natureza
nominal dos alvos continua responsabilidade da admissão schema/registry.
Consumidor delimitado: família em metricSelection; consumidores indiretos
devem preservar R/seleção. Não generalizar para parcelas/role_ref_list agora.
Testes nos arquivos existentes instrumentedAccess/metricSelection/authoringIndex
e bundle; REDs de observação e população inválida antes de implementação.

### População implementada localmente e limite encontrado

Cinco REDs observados; depois 57 testes de acesso/seleção (incluindo um controle
adversarial adicional), quatro bundles, duas integrações de 52 derivações e
oito testes do recorder PASS. 71 testes distintos no incremento; sem ampla.
followMember resolve apenas ref_list já admitida e mantém os eventos traverse
existentes; leitor completo usa os IDs coletados na seleção, sem gets/identity
dos alvos. A fixture de orçamento também ganhou relações reais de membros.

Sonda family-population: 45 registros idênticos, 28 alterados, 73 seleções e
cinco matched parciais preservados. Fixture digest inalterado; 13.168 covered,
86 invalid, zero unsupported. Menos eventos covered não significa regressão:
includes repetidos foram substituídos por enumeração única. Não houve novas
faltas; removidas 52 faltas de arestas, 78 faltas estruturais e 19 extras
estruturais. Persistem os demais deltas; graph_accepted=false.

NOVOS EXTRAS: M-13#1#3 e M-13#1#6 (safe_daily_pace), duas arestas de membros e
três operações estruturais em cada grafo. A família já era lida pelo avaliador
via budget.family_id, mas a autoria omitia seus próprios reads/nó. É outra
instância de dependência causal transitiva não atribuída à fase, não motivo
para um ramo `pace` que pule a enumeração. Manter a rejeição e submeter regra
de autoria geral antes de modificar esses grafos. A implementação permanece
local/em desenvolvimento, sem publicação ou auditoria de código.

### Delta familiar autorizado e validado localmente — 2026-09-20

Parecer f27c504 APTO documental recebido de Daniel e registrado; não reauditar
o mesmo hash. Regra geral incorporada à seção 4 do binding após RED. Em cada
safe_daily_pace: +1 family, +2 reads id/members, +3 operações estruturais e
+2 edges de members. Testes derivam a obrigação de budget/family_id/members,
sem actual/oracle, e confrontam o grafo inteiro com o extrato mais esse delta.
Prova e demais 74 grafos inalterados em relação à base local pré-delta.

Integração revelou bills_open ainda usando membership sem enumeração;
reutilizada a primitiva compartilhada, sem regra por fact_key ou nova normativa.
Regressão verifica membros sem contas e referência ausente mesmo com contas
vazias, além de mudanças causais de resultado e ausência de reads dos alvos.
105 testes distintos PASS: 93 na bateria de autoria/compilação/bindings/bundle
e 12 de direct reads. As execuções focais sobrepostas não se somam a esse total.

Sonda family-closure versus family-population: 70 registros idênticos, apenas
M-13#1#3/#1#6 e M-14#1#2 alterados. Zero novas faltas/extras. Cada pace remove
precisamente os extras familiares aprovados; bills resolve 2 edges/3 estruturas
e remove 1 extra membership. 73 seleções e 5 matched parciais preservados;
13.176 covered, 84 invalid, zero unsupported. Não valida host, proof ou R;
graph_accepted=false. Nenhuma ampla nova ou publicação de runtime/normativas.

Próximo recorte: identidade/referência dos candidatos. Distinguir payload id,
identidade e traversal de person_id a partir da semântica e dos bindings, antes
de implementar; não introduzir leitura decorativa, ampliar nó consumido só por
ser alvo, nem mascarar extras. Aplicar RED por propriedade causal geral.

Recorte iniciado: compor readReferenceId (get validado + follow da relação
admitida, sem ler alvo) e readReference (quando o cálculo também consome o
alvo). O schema/registry mantém a autoridade de tipo/coerência da relação;
o helper não substitui admissão nem valida handles arbitrários como host.
Usos escalares: person_id em seleção econômica, efeitos com população de
categorias e bills_open. Refund mantém consumo explícito do alvo revisado;
due_bills mantém comparação de identidade/version com pessoa ligada. Nenhuma
escolha consulta graph/fact_key/actual/expected. REDs devem cobrir referências
ausentes de candidatos selecionados e excluídos, resultado dependente do ID,
aliases diferentes, ausência de payload/identity dos alvos e preservação das
referências completas. Arquivos: metricReferences/Selection/Effects/DirectReads
e seus testes existentes; sem mudança normativa neste recorte.
Telemetria: Status configurado, running=false/healthy=false; NAO_DISPONIVEL.
Não iniciar coleta paralela nem ampliar escopo por essa lacuna.

Referências escalares: 43 testes dos três avaliadores e 9 integrações/bundles
PASS. Sonda owner-refs: 27 registros idênticos/46 alterados; 561 faltas de
travessia removidas, mais 1 nó/read extra de bills_open. Zero faltas/extras
novos; 73 seleções, 6 matched parciais, 13.736 covered/82 invalid/0 unsupported.
Sem mudança de grafos, normativa ou autoridade de aceitação.

Próximo incremento no mesmo recorte: composição de identidade e unicidade
dos candidatos. Um ID material identifica um evento, não um alias de handle;
dois aliases da mesma identidade não podem contribuir duas vezes nem ser
aceitos como população distinta porque um deles foi excluído. Extrair leitura
comum kind/id/version e registro de IDs por invocação, compartilhado por
seleção econômica e efeitos (estes já rejeitam duplicatas). A leitura de id
participa dessa rejeição, sem expected/graph/trace como entrada. Preservar
checagens de versão/tipo nos consumidores completos. RED real com dois aliases
e mesmo payload/identidade, inclusive excluídos; doubles apenas para tipos
malformados na fronteira do avaliador, sem alegar admissão/host completos.

Identidade implementada: 2 REDs prévios, 45 focais e 9 integrações/bundles PASS.
Sonda candidate-identity: 39 registros idênticos/34 alterados, 544 faltas de
reads removidas, nenhum extra/falta novo; 73 seleções/6 matched parciais,
14.824 covered/82 invalid/0 unsupported. O inventário normativo não mudou.

Consumidor restante da mesma composição: metricInstallments. Suas populações
family.members e plan.members são ref_list e já têm iterator/cardinality/order
e edges derivacionais autorados. Reutilizar readReferenceIds com tamanho
consultável para comparar população examinada, sem devolver Set mutável; usar
readReference completo para installment_plan e leitura de ID resolvido para
person_id/category_id. Leitura completa de pessoa não é necessária para
filtragem familiar. Preservar datas, números, dimensões, estados, assinatura,
resultados e rejeições de planos. Não forçar campos de eventos sem plano nem
resolver agora divergências normativas da guarda has. REDs antes do runtime,
em metricInstallments.cases.js; bundle e integração dos demais consumidores
na bateria afetada. Sem novo opcode, mudança normativa ou expansão de host.

Parcelas: 2 REDs prévios e 50 focais PASS. Sonda installment-refs versus
candidate-identity: 65 registros idênticos/8 alterados, 71 edges e 24 reads
faltantes removidos, 3 estruturas familiares resolvidas, 1 nó/read extra de
pessoa e 1 extra membership removidos; nenhum delta novo. 73 seleções,
6 matched parciais, 14.926 covered/76 invalid/0 unsupported. Controles de
unicidade ampliados para 112 variações de modo, exclusão, versão e ordem.

Próximo uso do leitor completo: compensates em seleção econômica e efeitos
com categoria ligada. O alvo já é consumido para classificar compensação;
get da referência deve participar da igualdade com o ID do alvo resolvido,
não só follow. Reutilizar readReference sem mudar semântica, grafos ou reads
de state/person do alvo. REDs com referência escalar ausente/malformada e ID
válido divergente, mais controle positivo e aliases independentes. A assinatura
refund já usa a composição completa e deve permanecer equivalente.

Compensates: 2 REDs e 35 focais PASS. Sonda compensation-refs remove 33 reads
faltantes e preserva seleção/metadata, mas introduz 3 reads extras em
S-13#1#1/M-09#1#1/N-04#1#1 (eligible_event_count). A aresta compensates já
era extra nesses grafos antes do incremento. Não suprimir acesso por métrica:
o contrato exige seleção por categoria e a referência histórica categoryFor
herda a categoria da compra compensada. Inspeção posterior de r0006_exclude_id
corrigiu a hipótese inicial: os três predicados JÁ comparam food_restaurant.id
com health.general; não usam a categoria direta do refund. Portanto a omissão
é do caminho transitivo, sem necessidade de mudar predicados/seleção. Pendência
normativa separada, ainda sem alteração desses contratos/grafos.
Sonda: 37 registros idênticos/36 alterados, 15.028 covered/76 invalid/0
unsupported; 73 seleções e 6 matched parciais. Guardar bloqueio da autoria.

Recorte independente seguinte: população categorial explicitamente ligada.
createCategoryReader deve indexar ID, versão e classe econômica válida de
todas as categorias; a classe lida do alvo precisa coincidir com a entrada da
população. Hoje só indexa versão e aceita classe alterada no alvo com mesmo
ID/versão, e uma entrada não utilizada com classe inválida. O uso do campo kind
será causal no índice/rejeição, não leitura descartada para completar trace.
REDs com população vazia de eventos, categoria não utilizada inválida e alvo
com classe válida mas divergente; preservar resultados/closed-world de versões.

Categorias: 2 REDs causais observados (a fixture inicialmente usava undefined
e foi corrigida para valores admitidos porém classes inválidas). Implementação
confirmada depois de bloqueio temporário do serviço de aprovação: 49 focais
e 9 integrações/bundles PASS. Sonda category-population remove 152 reads,
28 registros idênticos/45 alterados, sem faltas/extras novos; 73 seleções,
11 matched parciais, 15.568 covered/76 invalid/0 unsupported. Sem GO de grafo.

Registrar antes de criar a proposta documental de eligible_event_count:
docs/plans/workstreams/financasbot-next-02-n02g-count-compensation-decision-v1.md,
docs/audit-evidence/n02g-count-compensation/graphs-extract.json e ferramenta
scripts/agent/extractNextProvenanceReview.cjs. Publicar somente esses arquivos
sanitizados e recibo documental familiar; não misturar incrementos locais de
runtime/normativa no candidato documental. Extrair objetos completos dos blobs
Git do HEAD f27c504, verificar igualdade local e pedir revisão focal em conversa
limpa, uma tentativa por novo hash. Delta proposto: 1 read/1 edge por grafo,
sem alterar proof, predicados, seleção, nós ou resultado financeiro.

Proposta publicada e enviada: 130c74dd9fc14a15ca84a64cb839c9968f5433f3, pai
f27c504. Extrato 609.909 bytes/3 grafos/3 claims, igualdade local e controles
de saída PASS. Uma tentativa automática no Chat; aguardar parecer sem reenvio.
Recorte independente permitido enquanto aguarda: source.category_id já é
referência causal comparada com o sujeito em eligible_event_count, e sua
aresta já é exigida pela normativa. Reutilizar readReferenceId, sem leitura
do alvo, sem mudar declaração ou resultado. RED de referência ausente e
observação positiva; preservar event_count/coverage e os demais guardas.

source.category_id implementado após RED: 40 focais PASS. Parecer 130c74d:
NÃO APTO pelo fechamento documental da travessia. Sem objeção à categoria
efetiva, seleção/proof ou causalidade. Recibo registrado em
docs/audit-evidence/n02g-count-compensation/independent-review.md. Não aplicar
delta dos três grafos enquanto a ambiguidade não for resolvida.
Confronto com protocolo/schema/código publicado e TRACE-COVERAGE-003 sustenta
uma única emissão I/traverse projetada em edges; schema admite o símbolo
structural traversal mas ele não é usado nas 152 fases (6.271 edges).
Proposta revisada agora inclui texto normativo explícito, fail-closed para
declaração estrutural não suportada e fontes adicionais. Precisa de novo
hash/parecer; não tratar a inspeção local como superação do NÃO APTO.

Atualização 2026-09-20: revisão 122b9f7 APTO documental. Texto de traversal e
delta de contagem aplicados localmente; 8 focais e 192 testes causais PASS.
Sonda count-authorship sem novas discrepâncias; 73 seleções e 11 matches
parciais, nunca aceitação de grafo. Próximo incremento delimitado: substituir
identity(node.follow(field)) nas métricas diretas por readReference, mantendo
consumo/versão do alvo e acrescentando a leitura causal do identificador.
Teste positivo get + traverse e referência escalar divergente; não alterar
proof/expected para acomodar eventual delta. Sem nova normativa nesse passo.

Referências diretas: 6 REDs observados, 14 focais PASS, integração direta +
4 bundles PASS. Sonda direct-refs remove 33 faltas e expõe 3 reads extras
account_id nos pagamentos M-05#1#2/#3/#4. Não alterar esses expected aqui;
invoice_payment_amount exige validar conta, enquanto os outros dois contratos
têm alcance diferente. Registrar para revisão de autoria/assinatura por regra
geral, sem novo remendo por fact_key. Incremento seguinte da mesma composição:
referências de instrumento na seleção, usando readReference, preservando kind,
versão, has e critérios econômicos. RED escalar/target e teste de excluídos.
Instrumentos: 31 focais + 5 integração/bundles PASS; remove 48 reads ausentes,
mas agrega 18 identity_node_not_required porque o leitor completo valida
versão inclusive de alvos estrangeiros já consumidos. Esses alvos já tinham
ID/kind extras; não ocultar a divergência nem tratá-la como cobertura exata.
Concluir a classe de referências via orçamento e campos opcionais de parcelas.
Depois consolidar autoria causal em perfil declarativo pré-execução: não
continuar ciclos de deltas manuais por grafo para cada ocorrência dessa classe.

Consolidação: orçamento remove 10 edges ausentes. Travessias opcionais de
conta/cartão em parcelas foram experimentadas e retiradas após conferir que
o consumo é só a comparação escalar de dimensões; não alterar normativa para
justificá-las. Teste dessa distinção mantido. Sonda reference-consolidated:
73 seleções/11 matches parciais, 15.669 covered/94 invalid/0 unsupported;
sem novos deltas frente a instrument-refs. 60 testes dos quatro avaliadores
e syntax de 17 arquivos PASS. Integrações diretas/econômicas/parcelas PASS.

Método de autoria proposto em causal-authoring-profile-v1, publicado em
8b9c4fca93186c9f747ba1a868bf1616ba15d92a com recibo documental anterior.
Uma solicitação ao Chat em conversa limpa; só pede permissão para gerador
offline de candidato + testes, NÃO para aplicar seu resultado aos grafos.
Não implementar host/recibos/aceitação sobre as lacunas atuais.

Parecer do método 8b9c4fc: APTO para candidato, com condições vinculantes no
recibo n02g-causal-authoring-profile/independent-review.md. Próxima fatia:
`scripts/agent/nextCausalAuthoring.cjs` e
`tests/next/provenance/causalAuthoring.cases.js`, inicialmente fronteira de
projeção e pinagem (não gerador completo). Entrada serializada, projeção
estritamente permitida; expectativas antigas só no comparador posterior.
Testar não-interferência de derivation/proof/predicates/resultados; versão,
hash e política ausente devem falhar fechado. Não aplicar saída normativa.
Fronteira/admissão em 2026-09-21: 12 testes PASS, incluindo os seis grafos
reais; role policy usa kind evaluation_policy, não o nome do role. Pinagem
fechada de todas as autoridades/documentos, incluindo snapshot manifest e suas
fontes, rejeita falta, bytes divergentes, duplicação e fonte extra. Admissão
valida schemas fixados, roles, relações fornecidas, identidade e fingerprint
semântico. RED observado: payload numérico válido com hash de transporte
reparado era aceito; agora rejeitado pela primitiva canônica pura de hashing.
Não importa evaluator, recorder ou oracle. Pinagem garante consistência de
bytes fornecidos, não autenticação do host ou replay de autoria das fontes.
Incremento posterior: perfil semântico explícito e interpretação somente
candidata implementados. Pasta causal-authoring-candidates documenta o programa,
as decisões e seus limites; relatório separado compara com expected antigo
somente após gerar. 23 focais PASS + dois controles de referência PASS e uma
integração causal PASS. Inclui aliases/ordem, ausência/presença, alvos
estrangeiros, datas sem clamp e invariância frente à magnitude/sinal monetário.
Filtro semântico fora do recorte aborta, não é silenciosamente descartado.
Saída local v2: +8 nós, +11/-155 reads, +12 claim reads, -148 arestas,
+192 estruturas nos seis grafos; 76 originais/claims preservados. Remoções
ainda não justificam alteração normativa: precisam de revisão do candidato.
Inventário de desenvolvimento atualizado para 30 pendentes, nenhum hash
aprovado alterado, releaseEligible=false; quatro controles PASS após RED.
Bateria hermética afetada: 93 PASS/0 FAIL/0 SKIP. Ampla única preparada para
esta composição via wrapper runWideCausalAuthoring20260921.cjs, com manifesto
causal antes/depois. Resultado e marcador indicados no checkpoint; não repetir
verde nem acompanhar antes de 20 minutos, salvo solicitação de Daniel.
Resultado após a espera: ampla verde em 2026-09-21, 2.359 PASS/0 FAIL/10 SKIP
esperados, valid=true, candidato inalterado durante execução. Evidência e
pedido focal na pasta n02g-causal-authoring-profile. Preparar publicação da
composição como candidata; auditoria focal não concederá GO aos incrementos
fora do gerador/perfis/delta nem ao N02-G global.
Composição publicada em ace83e80a1a2cf12ba2f9a7a8f6ace9ebdc5adbd. Parecer
externo APTO focal recebido, mas contraexemplo local de outra versão admitida
do mesmo instrumento bloqueou ratificação do código. identity retornava só ID,
e a contribuição ignorava version. RED AUTHOR-GENERATE-010 confirmado;
correção geral de identidade ID + version, 26 focais e integração hermética
PASS. Seis relatórios candidatos publicados continuam exatamente iguais;
nenhuma alteração dos 76 grafos. Uma nova ampla final é necessária pela
mudança causal, não repetição da evidência verde anterior. Marcador/resultado
wide-n02g-authoring-version-20260921 em .codex-temp, conforme checkpoint.
Essa ampla concluiu verde: 2.360 PASS/0 FAIL/10 SKIP esperados, hashes
inalterados. Evidência separada version-fix-validation.json e pedido focal
version-fix-audit-request.md. Próximo passo: commit/publicação sanitizados
e auditoria da correção ID + version; não repetir a suíte verde.
Correção ID + version ratificada após APTO independente em 1e83baac; recibo
publicado em ad43ba41f0558e9329b8e494c824672d21de4b5d. Próxima fatia iniciada:
somente os dois modos instrument/statement reconciliados com o perfil candidato,
sem aplicar o delta normativo. AUTHOR-RECONCILE-001 gerou expected congelado
antes do evaluator e observou RED nas seis derivações; seleção/R já preservados.
Runtime agora exige coverage complete, consome identidade da policy, não lê
owner sem uso no escopo e observa presença/coerência/self/chain de compensações
antes do filtro. 33 focais e integração dos seis perfis PASS, com rejeição de
trace sem os has obrigatórios. Demais modos preservados, graph_accepted=false.
Bateria causal de seis arquivos concluída: 135 PASS/0 FAIL/0 SKIP, hermética.
Diff/revisão/syntax/workflow OK; corpus/gerador/perfis intactos no Git.
Próxima ampla única preparada
em runWideProfileReconciliation20260921.cjs, somente após afetados verdes,
com três hashes causais antes/depois. Não confundir com a ampla anterior de
2.360 PASS, válida apenas para o código anterior. Nenhuma mudança dos grafos,
perfis ou gerador; reconciliação local ainda exige hash próprio e auditoria.
Ampla de reconciliação concluída: 2.363 PASS/0 FAIL/10 SKIP esperados,
valid=true, exit=0, três hashes causais intactos. Heartbeat pausado. Evidência
sanitizada e checker próprios reconciliation-validation.json e
prepare-reconciliation-evidence.cjs; pedido reconciliation-audit-request.md.
Commit/publicação e auditoria focal são a próxima fronteira; nenhuma aplicação
normativa e nenhuma aceitação integral de grafo decorrem desse verde.
Reconciliação publicada e APTO focal ratificado em
3fc0f3d83ac5e418a802ca93f097b0c7459fface; recibo
reconciliation-independent-review.md. Proposta de aplicação normativa
instrument-authoring-decision-v1 preparada, mas NÃO submetida: inspeção
prévia encontrou gerador aceitando fonte income/neutral de compensação sem
erro. AUTHOR-GENERATE-011 RED (Missing expected exception em M-02#1#1),
guarda geral adicionada antes do filtro, dois focais PASS. Runtime já rejeita
esses casos, comportamento reforçado em INSTRUMENT-PROFILE-003. Seis candidatos
continuam idênticos. Validar/auditar essa correção antes da decisão normativa;
nenhum APTO anterior a cobre. Bateria afetada e ampla próprias no checkpoint.
Correção da fonte validada: 108 afetados PASS e ampla 2.365 PASS/0 FAIL/10
SKIP esperados, quatro hashes causais intactos. Acompanhamento pausado.
Pacote compensation-source-validation/compensation-source-audit-request na
pasta n02g-causal-authoring-profile; próximo passo é publicação e revisão
focal do novo hash. Proposta normativa ainda suspensa, sem aplicação.
Guarda de fonte publicada em 0a8c5709a5234e95ddce212c0b571908dacf32bf e APTO
focal ratificado; recibo compensation-source-independent-review.md. Liberada
a submissão documental de instrument-authoring-decision-v1, não aplicação.
Proposta fecha cinco campos de seis derivações e preserva todo o restante;
submeter em hash exclusivamente documental antes de alterar qualquer grafo.

Depois: reconciliar as demais leituras e estruturas das famílias
de avaliadores, por regra causal geral, com REDs independentes da execução.
Não derivar expected do actual, preencher reads sem uso causal, apagar extras,
introduzir exceção por fact_key ou modificar grafos normativos silenciosamente.
Se o conflito exigir mudança normativa, delimitar e submeter esse delta antes
de implementar a nova regra. Aplicar a trava anti-remendo da skill de execução.

Só então compor ambas as fases, obrigações, medições e identidade confiada,
seguindo o charter, e emitir recibos internos para os três grafos derivados.
O comparador atual mantém graph_accepted=false durante os incrementos locais.
Medições M seguem bloqueadas até autoridade independente de artefatos e host;
não usar hashes do próprio evento ou placeholders como esperados.

REDs mínimos da composição: evento omitido/extra/desconhecido; identidade ou
invocação trocada; record sem leitura de folha não satisfaz required_reads;
follow não satisfaz get; membership não satisfaz enumeração; seleção correta
não mascara delta de reads. Eventos de uma fase não cobrem a outra.

Validação: syntax/RED/focal e bateria causal; ampla somente quando houver
candidato estável com mudança causal. Não repetir agora a ampla verde de
2.255 PASS. Qualquer correção material continua exigindo commit imutável e
auditoria independente no Chat antes de GO. Sem deploy ou produção.
