# N02-G — presença e valor do escopo de transferência

PROPOSTA DOCUMENTAL NÃO APLICADA.
Base: 94138a06d293e0fb7d68f4d3387d9ca85e8c51d7.
Recorte: consumption_effect@1, subject.kind=transfer_pair. Não altera produto.

## Causalidade e decisão proposta

O contrato consumption_effect soma o consumo dos eventos vinculados ao objeto
consultado. Neutralidade exige categoria e vínculo econômico, não somente sinais
opostos. O registry fornece events como população ordenada node_set e context
como claim_context. Em metricEffects.js, o ramo transfer_pair executa
`event.has('transfer_pair') && id(event.get('transfer_pair')) === reference`.
Esse ramo acontece para cada candidato, antes da exclusão por estado/período.
O campo é opcional no schema e no material registry. Ausência não equivale a null.

Os três claims S-08#1#1, M-04#1#3 e N-07#1#1 ligam dois eventos, ambos com
transfer_pair presente. Derivation não declara nem o has nem o get. Proof já
declara os dois gets, mas não os has. Portanto, copiar proof não produz o
inventário derivacional correto. A regra vem da semântica, dos bindings e da
presença nos snapshots imutáveis; a sonda preexistente apenas a corrobora.

## Regra composicional, não exceção por exemplo

Não se alega corrigir toda a autoria do N02-G. Antes de outra aplicação isolada,
explicita-se a abstração ausente: uma operação opcional `has_then_get` produz
uma obrigação has para cada membro da população e um read somente quando o
campo existe no snapshot autorado. A composição tem parâmetros declarados
(role, kind, field); sua aplicação aqui é restrita por evaluator ID+versão e
subject.kind. Não inferir perfis de outros evaluators nem aplicar os parâmetros
a todo campo opcional do corpus.

Resolver events pelo role; resolver cada snapshot por kind/ref_id/version,
payload.id e fingerprint declarado. Rejeitar população/identidade ambígua.
Para todos os candidatos, inclusive os excluídos: has transfer_pair; se presente,
get transfer_pair. Não condicionar a obrigação à igualdade com subject.ref_id,
ao valor monetário, ao estado, à data ou à seleção final. Valores presentes são
IDs válidos segundo o pacote admitido. Snapshot inválido não é caso positivo.

Aliases e fact_keys apenas identificam o local do delta; não escolhem o perfil.
Actual, trace, oracle, selected_nodes e proof não são entradas da regra.
O helper é inventário documental, não um extrator semântico de código nem um
novo compiler. Seu perfil manual deve ser confrontado com o runtime na revisão.

## Delta fechado e invariantes

Adicionar em derivation, por grafo, para evt_transfer_in e evt_transfer_out:

- required_reads: segments=[transfer_pair];
- required_structural: operation=has, segments=[transfer_pair].

Total: três grafos, seis reads, seis has, zero remoções. Preservar os demais
73 grafos e todos os outros campos, proof, seleções, claims, snapshots, runtime,
contratos e registries. S-09#1#1 usa subject.kind=event e fica fora do perfil.

Não adicionar transfer_identity, accounts, famílias, payloads de alvos ou arestas
à derivação: esse ramo compara o escalar ao claim e não percorre transfer_pair.
As relações materiais e a completude econômica continuam declaradas em proof
e sujeitas à admissão/prova; esta proposta não demonstra sua execução nem as
dispensa. Se a revisão exigir uma travessia derivacional adicional, parar e
revisar o desenho, em vez de declarar este delta suficiente por conveniência.
Resultado zero dos exemplos neutros não comprova sozinho a seleção correta.

## Provas exigidas antes de concluir a implementação

Após APTO documental confrontado, e não antes:

1. RED da expectativa antiga e GREEN do delta, com igualdade integral do corpus
   contra a base mais somente as doze adições; todos os documentos protegidos
   intactos e composição explícita dos pins históricos.
2. Modelos gerados com aliases/IDs/versões/ordem/população variáveis, campo
   ausente, presente igual e diferente do claim. Has inclui todos; get inclui
   exatamente os presentes, sem depender de selected/state/date/amount.
   Rejeitar dispatch/subject/role errados, identidade ausente/duplicada/trocada.
3. Integração dos três grafos admitidos: expected congelado antes de evaluator,
   seleção preservada e R conferido depois. Expected antigo falha; retirar um
   get ou has da trace também falha. Não formar expected a partir do actual.
4. Kernel com candidatos ausentes, de outro par, fora do período e projetados;
   variar valores/categorias para discriminar seleção mesmo quando o caso
   neutro retorna zero. Rotular como kernel, não mutantes de grafos admitidos.
5. Focais/afetados, uma ampla final estável, commit sanitizado e auditoria de
   código independente. A aprovação documental não ratifica implementação.

O helper confere igualdade LF das fontes com os blobs Git completos da base e
hash do manifest/contrato. Não recalcula todos os fingerprints nem executa
evaluator, host, recorder ou suíte. Seu --check não é uma execução de testes.
Não há GO global N02-G, aceitação de grafo/host, deploy ou produção.
