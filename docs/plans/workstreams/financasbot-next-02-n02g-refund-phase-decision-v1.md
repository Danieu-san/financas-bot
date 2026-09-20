# N02-G — proposta de responsabilidade de fase para refund_amount

Data: 2026-09-20. Estado: PROPOSTA, aguardando revisão independente.
Base inspecionada: `22e7616b7ed7cb984a26193d53f4fd736ae1c3f6`.
Escopo desta publicação: somente este documento. Nenhuma mudança normativa,
de runtime, de seleção, de resultado ou de produção. Não concede GO.

## Problema demonstrável no commit de base

Fontes, relativas à raiz do repositório e disponíveis no mesmo commit:

- `docs/contracts/next/provenance-v2/evaluator-contracts/refund_amount.json`;
- `docs/contracts/next/provenance-v2/graph-binding-contract-v1.md`, seção 4;
- `docs/contracts/next/provenance-v2/graphs-v2.json`, grafos `M-06#1#2` e
  `F-06#2#1`, trace_contract, predicates e obligations;
- `src/next/provenance/metricEffects.js`, evaluateEffects;
- `tests/next/provenance/metricEffects.cases.js`, EFFECT-METRIC-001/002.

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

Os passos 2–4 preservam os critérios do avaliador publicado e tornam explícita
a causalidade das referências. Exigem justificativa de autoria, não mera
presença de snapshots. Um alvo válido fora do mês do estorno não é excluído
pelo mês do alvo: não acrescentar leitura de sua data para esse fim.

Delta proposto nos dois grafos, a conferir mecanicamente após aprovação:

| Dimensão | Delta justificado pela regra, anterior ao trace |
| --- | --- |
| required_nodes | Incluir as categorias própria/do alvo e o evento compensado, pois são consumidos na validação; incluir o nó de pessoa se sua identidade for examinada para cumprir a aresta já exigida. |
| required_reads | Acrescentar compensates do candidato; id/kind das categorias; id/state/person_id/category_id do alvo; id de qualquer alvo cuja referência tenha igualdade de ID explicitamente validada. Não copiar campos completos do fingerprint. |
| required_edges | Acrescentar compensates do candidato e category_id do alvo; preservar as arestas já exigidas. Justificar separadamente qualquer outra travessia. |
| required_claim_reads | Preservar sujeito, período e time_basis; não introduzir campo de aceitação ou recibo no contexto. |
| seleções/selected_nodes | Nenhuma mudança. O alvo e as categorias não viram candidatos ou resultados financeiros. |
| proof | Não remover nós, leituras, predicados, seleções ou obrigações. |

Essa tabela é especificação de responsabilidade, não um JSON de cobertura
completo. A autoria precisa resolver também a aresta de pessoa já requerida:
o avaliador atual lê person_id, mas não a percorre. Não autoriza deixar essa
falta invisível nem incluir campos da pessoa sem uso causal demonstrado.

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
2. Gerador de casos com IDs/aliases independentes, montantes e ordens variados:
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
proposta preserva o contrato e se o delta/testes são suficientes para iniciar
a correção; indicar objeções e alternativas com evidência dos arquivos.
O veredito pedido é exclusivamente **APTO/NÃO APTO para implementar a proposta**,
nunca GO de código. Não executar mudanças nem supor que a worktree local está
publicada. Se os arquivos não forem acessíveis, declarar revisão lógica limitada.
