# N02-G — autoria do tipo de coleção nas três contagens

PROPOSTA DOCUMENTAL NÃO APLICADA. Base 6d85f096f0b88f4ecef77d62c2d9929a17547eb5.
Escopo: reminder_count@1, calendar_event_count@1 e side_effect_count@1;
M-15#1#3, M-15#1#4 e M-16#1#3.

## Fundamento

Os contratos contam membros de domínios específicos: lembretes, agenda ou
efeitos do turno. Uma coleção vazia só prova zero no domínio correto e com
população integral comprovada. Tipar apenas seus membros é insuficiente no
caso vazio: não há membro que permita distinguir duas coleções vazias.

O registry vincula collection ao role de coverage (node) e entries à população
(node_set). O schema exige collection_name no payload de collection, e o
registry material o classifica como dimensão. O helper collectionMatches em
metricDirectReads já lê e compara collection_name ao domínio da métrica antes
de conferir identidade, membros, unicidade, cardinalidade e ordem. Essa guarda
é uma dependência real do cálculo e não deve ser removida para ajustar trace.

Os três grafos já incluem o nó collection na derivation. Falta somente sua
required_read de collection_name. A lista de fontes e snapshots está no
inventário collection-kind-proposal.json da pasta n02g-causal-authoring-profile.

## Regra e delta

Para cada um dos três contratos v1, resolver collection por role e identificar
um snapshot collection por kind/ref_id/version. Autorar a leitura
{node: alias_resolvido, segments: ['collection_name']} em derivation.required_reads.
Essa obrigação independe do nome literal do alias, da quantidade de membros,
do resultado financeiro e do trace. O domínio esperado é a semântica registrada
da métrica, não um valor extraído da execução. Limitar despacho por ID e versão.

Delta fechado: uma adição por grafo, total três reads. Nenhuma remoção,
alteração de nós/arestas/estruturas/seleção/proof ou cópia da closure de proof.
Demais 73 grafos e todos os outros campos preservados. Runtime intacto.
Os fact_keys identificam o pacote revisado, não parametrizam a regra geral.

## Validação necessária após revisão documental

Autoria com renomeação, versões e diferentes populações, sem actual/oracle;
RED causal, aplicação integralmente comparada à base, composição explícita
das igualdades históricas. Três integrações com expected congelado antes do
evaluator, R/seleção preservados e retirada da leitura tornando trace inválido.
Teste de kernel deve recusar coleção de domínio errado mesmo com população
vazia, e conferir contagem positiva. Não rotular handle sintético como grafo
mutante admitido. Bateria afetada e uma ampla final, depois auditoria de código.

Helper prepare-collection-kind-proposal.cjs confere fontes contra blobs da base,
identidade/versão/fingerprint declarado e propõe inventário; não executa evaluator,
valida todos os fingerprints semânticos ou altera grafos. Aprovação do desenho
não aprova implementação, grafo, host, N02-G global ou produção.
