# N02-G — autoria causal declarativa anterior à execução

2026-09-20. PROPOSTA DE MÉTODO, NÃO APLICADA. Base documental imutável:
`122b9f7decdb83a925c657fe8f6d642b73cb7651`. Não altera os 76 grafos, não
reabre o GO focal de seleção e não aprova os incrementos locais de runtime.

## Decisão pedida

Autorizar um gerador offline, independente do evaluator e do recorder, para
materializar obrigações derivacionais a partir de perfis semânticos explícitos.
Primeiro recorte: consumo por instrumento e competência/vencimento de fatura,
com núcleo de seleção econômica compartilhado. Não generalizar implicitamente
esse perfil para contagem, parcelas, saldos, pagamentos ou outros contratos.

Aprovar o método NÃO autoriza substituir trace_contract pelos seus resultados.
O gerador inicialmente produz apenas um candidato separado e um delta exato.
Esse delta precisa ser confrontado com os contratos e revisado em hash imutável
antes de aplicação normativa. Sem aprovação por mera semelhança com o actual.

## Problema e regra vigente

O binding §4 exige obrigações anteriores à execução, distinção entre get,
travessia, presença e estrutura, e inventário dos nós efetivamente consumidos,
incluindo candidatos financeiramente excluídos. Não exige toda a closure de
proof em derivation. Os 76 grafos já existem; não serão reconstruídos do zero.

As revisões focais de refund, população familiar e categoria da compensação
expuseram o mesmo risco operacional: sucessivos acréscimos manuais deixam a
regra implícita. A resposta é tornar a autoria verificável por composição de
operações, não criar allowlists de fact_key ou ajustar expected até bater.

Código, testes e sondas locais continuam candidatos. Seus resultados podem
revelar uma pergunta, mas não fornecer as obrigações normativas do gerador.

## Entradas fechadas e saídas

Entradas: perfil declarativo versionado e revisado; contrato do evaluator;
claim e operand_bindings; schemas/registries; snapshots e relações materiais
admitidos; autoria de seleção já ratificada para a fase. Todos com versões
fixadas antes de executar o evaluator. O gerador não recebe handles de runtime.

Proibido: importar/rodar metricSelection, metricDirectReads, metricEffects,
metricInstallments, host, recorder, comparador, diagnósticos, trace, oracle ou
resultado R para descobrir o expected. Proibido interpretar o código do
evaluator ou aprender um perfil a partir de sua execução.

Saída: somente candidato de required_nodes/reads/claim_reads/edges/structural,
com justificativa de cada obrigação (regra, role e caminho material). Preservar
proof, claims, predicates, sets, selections e selected_nodes. Manifestar os
digests dos inputs, perfil e saída; isso registra a autoria, não prova TCB/host.

Nenhuma tabela por fact_key, alias, hash de snapshot ou resultado. A seleção
do perfil pelo metric ID do registry é permitida, como assinatura semântica;
os bindings e as relações resolvem todos os aliases e edge IDs.

## Primitivas de autoria propostas

1. **Leitura escalar:** declarar node/path (ou claim path), e o nó fonte
   consumido. Ler um identificador para comparar valores não exige por si só
   consumir o alvo. Exemplo: igualdade de dimensões opcionais entre parcelas;
   esse exemplo delimita o método, não inclui parcelas no primeiro perfil.
2. **Guarda de presença:** declarar has no campo opcional efetivamente
   consultado, tanto presente como ausente. O ramo autorado é determinado
   pela presença no snapshot admitido, nunca pela presença no trace.
3. **Referência resolvida:** leitura escalar + aresta material. Se o contrato
   usa dados/identidade do alvo, declarar precisamente esse consumo e o nó;
   se usa apenas a relação, não acrescentar payloads de alvo decorativos.
4. **População:** distinguir referência à lista, cardinalidade, enumeração,
   ordem e resolução de membros. Resolver um membro não cobre as demais
   operações; nenhuma operação nasce só porque o schema a permite.
5. **Consulta sobre candidatos:** percorrer o roster do role admitido; autoria
   das verificações semânticas não desaparece porque o candidato é excluído.
   Uma guarda causal anterior pode impedir consumo posterior, mas o perfil
   deve explicitar essa condição. Não copiar toda a proof sobre cada candidato.
6. **Campos do resultado:** contribuição monetária é consumida somente onde
   o contrato exige somá-la; listar IDs não autoriza leitura ornamental de
   amount_minor. A autoria de seleção ratificada permanece independente e o
   kernel não recebe sets selecionados como entrada.

Operação desconhecida, role ambíguo, referência ausente/incoerente, ramo não
definido ou primitiva sem interpretação deve abortar a geração. Não omitir a
obrigação, inferir um default favorável ou converter o problema em PASS.

## Primeiro perfil a especificar e testar

Fontes primárias no hash do candidato:

- `docs/contracts/next/provenance-v2/graph-binding-contract-v1.md`, §4;
- `docs/contracts/next/provenance-v2/evaluator-contracts/consumption_by_instrument.json`;
- `docs/contracts/next/provenance-v2/evaluator-contracts/statement_total.json`;
- `docs/contracts/next/provenance-v2/metric-evaluator-registry-v1.json`;
- `docs/contracts/next/provenance-v2/evidence-snapshot.schema.json`;
- `docs/contracts/next/provenance-v2/provenance-graph.schema.json`;
- `docs/contracts/next/provenance-v2/graphs-v2.json` e `claims-v2.json` somente
  para autoria atual; leitura integral desses blobs NÃO é alegada por este texto.

Os nomes consumption_by_instrument e statement_total foram conferidos no
registry e nos contratos locais. O escopo semântico é:

- validar sujeito/instrumento consultado e janela civil pelo contrato;
- examinar os eventos candidatos e a classificação econômica necessária;
- declarar presença da referência account_id ou card_id selecionada pelo
  kind do instrumento, leitura e resolução quando presentes;
- explicitar se a validação de identidade/versão de um alvo estrangeiro é
  necessária antes da exclusão; o código atual sozinho não decide isso;
- para fatura, separar janela civil de uma suposta identidade de fatura:
  vínculo a cartão não prova correspondência a uma fatura particular.

A janela de statement_total é (fechamento do mês anterior, fechamento do mês
do vencimento], com due_day/closing_day do cartão e mês civil exato. Datas
inexistentes falham, sem clamp. Não trocar por uma convenção nova de fatura.

Qualquer divergência semântica entre contrato e perfil deve ser resolvida
antes da geração normativa. Não usar essa proposta para legitimar todas as
leituras do código local ou remover faltas que ele ainda não implementou.

## Evidência mínima exigida

- executar o gerador sem importar nenhum evaluator, recorder ou oracle;
- propriedades de renomeação de aliases/edge IDs e reordenação do corpus;
- variar presença/ausência e identidade/versão do alvo em fixtures sintéticas;
- variar elegibilidade financeira sem apagar as leituras causais anteriores;
- negar operação/role/referência desconhecidos e registros duplicados;
- gerar expected antes de uma execução e provar que adulterar seu trace não
  altera esses bytes nem dispara regeneração;
- comparar candidato inteiro com a autoria original: listar cada delta e sua
  regra; provar preservação de proof/seleção e de grafos fora do perfil;
- só então submeter o delta concreto e a implementação em hash imutável.

## Pergunta de revisão

O método fechado acima mantém expected independente do actual, preserva a
distinção de operações e evita sucessivos remendos por grafo? Está APTO para
implementar somente o gerador de candidato e os testes do primeiro perfil,
sem aplicar seu resultado normativo? Aponte condições faltantes; não conceda
GO do código local, dos 76 grafos, do N02-G, de deploy ou produção.
