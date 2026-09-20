# N02-G — proposta de responsabilidade de fase para refund_amount

Data: 2026-09-20. Estado: PROPOSTA REVISADA, aguardando nova revisão independente.
Base inspecionada: `22e7616b7ed7cb984a26193d53f4fd736ae1c3f6`.
Escopo desta revisão: proposta, extrato mecânico e recibo da primeira revisão.
Nenhuma mudança normativa,
de runtime, de seleção, de resultado ou de produção. Não concede GO.

## Problema demonstrável no commit de base

Fontes, relativas à raiz do repositório e disponíveis no mesmo commit:

- `docs/contracts/next/provenance-v2/evaluator-contracts/refund_amount.json`;
- `docs/contracts/next/provenance-v2/graph-binding-contract-v1.md`, seção 4;
- `docs/contracts/next/provenance-v2/graphs-v2.json`, grafos `M-06#1#2` e
  `F-06#2#1`, trace_contract, predicates e obligations;
- `src/next/provenance/metricEffects.js`, evaluateEffects;
- `tests/next/provenance/metricEffects.cases.js`, EFFECT-METRIC-001/002.

A primeira revisão (`614abbe9d5088ed756794f276a863fb34360948e`) não conseguiu
ler o arquivo integral de grafos (>4 MiB no leitor web). Parecer limitado,
NÃO APTO; síntese em `docs/audit-evidence/n02g-refund-phase/independent-review.md`.
Nova evidência: `docs/audit-evidence/n02g-refund-phase/graphs-extract.json`
contém os dois objetos integrais, extraídos do blob Git daquele hash, sem
selecionar somente predicados favoráveis. A igualdade com a origem foi
verificada localmente. O extrato é material de revisão, não nova autoridade
normativa; leitura do extrato não deve ser chamada de leitura remota do blob
integral. Source commit, blob Git e SHA-256 estão registrados no próprio extrato.

O contrato da métrica exige somar o valor não negativo dos estornos
consultados **com vínculo ao evento compensado**. O código da base resolve o
alvo, rejeita autorreferência, exige alvo confirmado e mesma pessoa, verifica
categoria própria compensation e categoria do alvo expense. Não há leitura
de required_reads para fabricar o trace.

Nos dois grafos, derivation.required_nodes contém apenas `evt_refund_b`.
Suas required_reads são id, date, person_id, category_id, amount_minor e state
desse nó. As arestas derivacionais são somente e0002 (pessoa do estorno) e
e0004 (categoria do estorno). Entretanto, a aresta e0005 (compensates para
`evt_restaurant_b`) e as leituras do alvo estão declaradas somente em proof.
Logo, a validação do vínculo pelo avaliador não cabe no contrato da derivation.
O conflito já existe na base publicada; não depende de alterações locais.

Proof contém, entre outras obrigações, os predicados economic_links:

- `link_1_refund_sign`: sinais opostos dos valores do estorno e da compra;
- `link_2_refund_person`: igualdade entre pessoas;
- `link_3_refund_card`: igualdade entre cartões;
- predicados de alvo das referências e fingerprints dos snapshots.

Não confundir identidade/fingerprint com uma regra semântica de categoria ou
estado do alvo. Os três predicados acima, sozinhos, não afirmam que a compra
compensada está confirmada nem que sua categoria tem kind expense.

## Decisão proposta (não aplicada)

**Preservar a validação causal do vínculo em derivation e corrigir sua autoria
de cobertura; manter proof integral e independente.**

A razão não é fazer o actual passar. A exigência de vínculo está na própria
semântica da métrica, e o cálculo usa a validação para decidir se pode produzir
um resultado. Remover a validação mudaria essa fronteira e dependeria de uma
composição final ainda não demonstrada. Acrescentar silenciosamente o actual
ao expected também seria incorreto. A correção deve partir da especificação
abaixo, revisada antes de qualquer alteração normativa.

Alternativa considerada: deixar derivation apenas calcular e transferir toda
a elegibilidade para proof. Pode ser um desenho válido em outro contrato, mas
não é uma correção mínima: exige reespecificar a assinatura, garantir que nenhum
consumidor aceite R isoladamente e comprovar a composição no host. Não adotar
essa alternativa como atalho para esconder observações extras.

## Responsabilidade causal mínima a explicitar

Para cada candidato a estorno, antes da seleção e do cálculo:

1. Validar identidade event e campos de escopo do candidato (data, estado e
   pessoa), sem confundir o alvo compensado com candidato financeiro.
2. Ler category_id, resolver a mesma referência e verificar categoria
   compensation. A leitura escalar e a travessia não são equivalentes.
3. Ler compensates e resolver o mesmo ID para um event distinto do estorno.
   Validar estado confirmed e igualdade da pessoa com o candidato.
4. Ler category_id do alvo, resolver a mesma referência e verificar expense.
5. Selecionar o candidato conforme sujeito, período e estado já definidos;
   somar max(0, amount_minor) somente dos selecionados, com aritmética segura.

Os passos 2–4 preservam os critérios do avaliador publicado, mas isso NÃO
prova que cada critério já esteja especificado normativamente. A revisão
distingue as origens e a emenda ainda proposta na tabela abaixo. Um alvo
válido fora do mês do estorno não é excluído
pelo mês do alvo: não acrescentar leitura de sua data para esse fim.

### Autoridade por condição e emenda semântica explícita

| Condição | Fundamento e situação |
| --- | --- |
| Candidato é compensação e tem vínculo ao evento compensado | Semântica literal do evaluator-contract/refund_amount; e0004/e0005 e respectivos predicados de alvo no extrato. |
| Mesma pessoa | Predicado existente link_2_refund_person em economic_links, além da implementação. Duplicar a checagem em derivation não remove a obrigação de proof. |
| Pessoa resolvida | Aresta e0002 já exigida em derivation; p0018_target e p0051_kind/p0052_fingerprint pertencem a proof. Proposta derivacional: ler person_id do estorno, seguir e0002, verificar kind person e igualdade com id do alvo. Não ler família ou nome. |
| Alvo distinto do candidato | Esclarecimento proposto do significado de compensar outro evento; o grafo atual liga dois nós distintos. Não afirmar que existe predicado genérico explícito de desigualdade já executado. |
| Alvo confirmed e categoria expense | **Emenda normativa proposta**, hoje guards do avaliador publicado. Não foi identificado predicado explícito no grafo que generalize esses dois critérios. Fingerprint não é tal predicado. |

A emenda candidata é: “Para refund_amount, um vínculo elegível resolve um
evento diferente, da mesma pessoa, em estado confirmed e de categoria expense;
o evento consultado tem categoria compensation. O período filtra o estorno,
não a data do alvo.” Ela deve ser revisada como especificação de admissibilidade,
não vendida como mera reparação mecânica de cobertura. Sua motivação é que a
métrica consultada representa devolução de uma despesa confirmada, não uma
projeção ou um evento neutro/de renda. Preserva o comportamento publicado,
mas sua incorporação ao evaluator contract exige aprovação independente.
Se essa semântica for inadequada, manter bloqueada a implementação normativa;
não copiar guards do runtime para o grafo nem removê-los silenciosamente.

### Delta fechado para as duas instâncias

Sem alterar selected/candidates, proof ou claim reads, propor a seguinte
derivation (aliases apenas identificam estas instâncias, não condicionam regra):

- required_nodes exatos: evt_refund_b, person_b, neutral_refund,
  evt_restaurant_b e food_restaurant.
- required_reads exatas: evt_refund_b/{id,date,person_id,category_id,
  amount_minor,state,compensates}; person_b/{id}; neutral_refund/{id,kind};
  evt_restaurant_b/{id,state,person_id,category_id}; food_restaurant/{id,kind}.
- required_edges exatas: e0002, e0004, e0005 e e0008. e0006 não é derivacional:
  a igualdade das pessoas usa o escalar person_id do alvo e o ID da pessoa
  validada a partir do candidato, sem segunda travessia redundante.
- required_structural continua vazio; required_claim_reads,
  required_selections, selected_nodes e evidence_set_mode são preservados.
  O consumo instrumentado dos node_sets mantém seu lifecycle validado, sem
  inventar operações estruturais de snapshot que a métrica não executa.

Justificativa por dimensão, a conferir mecanicamente após aprovação:

| Dimensão | Delta justificado pela regra, anterior ao trace |
| --- | --- |
| required_nodes | Incluir categorias própria/do alvo, evento compensado e pessoa. Cada um tem papel definido acima. |
| required_reads | Acrescentar compensates do candidato; id/kind das categorias; id/state/person_id/category_id do alvo; id da pessoa. Não copiar campos completos do fingerprint. |
| required_edges | Acrescentar compensates do candidato e category_id do alvo; preservar as arestas já exigidas. Justificar separadamente qualquer outra travessia. |
| required_claim_reads | Preservar sujeito, período e time_basis; não introduzir campo de aceitação ou recibo no contexto. |
| seleções/selected_nodes | Nenhuma mudança. O alvo e as categorias não viram candidatos ou resultados financeiros. |
| proof | Não remover nós, leituras, predicados, seleções ou obrigações. |

A aresta de pessoa não fica mais condicional. O avaliador atual lê person_id,
mas não a percorre; a implementação deverá usar a referência verificada para
a igualdade da pessoa. Não acrescentar family_id, nome ou outra inspeção sem
causalidade na métrica. As leituras/arestas acima estão fixadas antes da execução.

Nenhuma regra deve depender de fact_key, alias sintético ou valores do oracle.
Os dois grafos são instâncias da mesma assinatura da métrica. A transformação
de autoria deve resolver roles e referências declarados, sem consultar logs de
execução. Snapshots auxiliares de proof não são automaticamente derivacionais.

## Fronteira de aceitação permanece fechada

R calculado não é um grafo aceito. Derivation, proof, suas coberturas exatas,
obrigações, resultado funcional e medições devem pertencer à mesma execução,
invocação, claim, grafo, versões de input e closure admitidos pelo host.
O operador de composição não pode aceitar booleanos fornecidos pelo evaluator
nem juntar fases de execuções distintas. Esta proposta não implementa esse
host, medições, recibos ou os três grafos derivados.

Mesmo com derivation válida, sinal/cartão incorreto deve ser recusado por proof;
identidade/pessoa/estado/categoria/vínculo inválidos não podem ser aceitos por
retornar o mesmo número. Preservar `graph_accepted=false` nas comparações parciais
e `releaseEligible=false`. Nenhum GO global, executável ou de produção.

## REDs e critérios antes de implementação

Os itens abaixo são testes propostos, **não execuções já realizadas**:

1. Caracterização: os dois grafos publicados omitem a cobertura derivacional
   exigida pela especificação acima. O teste deve falhar com os documentos
   antigos, sem preencher expected com actual.
2. Gerador executado explicitamente com **metric=refund_amount**, cobrindo
   contexto month (M-06) e date (F-06), IDs/aliases independentes, montantes e
   ordens variados:
   referência ausente/trocada, self-link, kind errado, estado inválido, pessoa
   divergente e categoria não expense devem falhar; alvo válido em outro mês
   continua válido. Caso positivo para cada família de mutações.
3. Referências: trocar somente o ID escalar, mantendo o handle resolvido em um
   double de teste, deve falhar; admissão real também deve rejeitar relações
   inconsistentes. Declarar que o double não prova a fronteira de admissão.
4. Coverage: get separado de traverse; inventários exatos de nodes/reads/edges,
   preservando multiplicidade no log. Omitir cada acesso causal e acrescentar
   uma observação irrelevante devem produzir rejeição, não tolerância.
5. Invariância: seleção, R e proof dos dois casos devem preservar a semântica;
   exigir deep equality de trace_contract.proof, predicates, obligations,
   selections, sets e edges completos contra o blob de base, não somente
   contagens. A alteração de listas derivacionais não pode apagar prova.
   grafos de outras métricas não podem ganhar observações/normas por tabela de
   exceções. A regra deve valer para novas instâncias da assinatura.
6. Composição final futura: trocar execution/invocation/claim/versões ou usar
   proof de outro resultado deve falhar; prova com sinal/cartão falso deve
   bloquear aceitação mesmo com soma correta. Não simular GO enquanto essa
   fronteira não estiver implementada e testada.

Após decisão independente: registrar delta normativo exato, implementar REDs,
revisar autoria/avaliador/testes afetados e medir o delta sintético. Somente um
candidato de código estável fará ampla hermética e nova auditoria imutável.
Este documento não altera o GO focal histórico N02G-SB-001.

## Pedido de revisão independente

Confirmar hash e arquivos efetivamente lidos. Avaliar se a responsabilidade
proposta, incluindo a emenda semântica explicitamente nova, é adequada e se
o delta/testes são suficientes para iniciar a correção; indicar objeções e
alternativas com evidência dos arquivos. Separar aprovação do desenho da
confirmação local de equivalência do extrato ao blob grande.
O veredito pedido é exclusivamente **APTO/NÃO APTO para implementar a proposta**,
nunca GO de código. Não executar mudanças nem supor que a worktree local está
publicada. Se os arquivos não forem acessíveis, declarar revisão lógica limitada.
