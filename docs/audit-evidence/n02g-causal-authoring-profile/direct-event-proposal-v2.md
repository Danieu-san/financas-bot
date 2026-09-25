# DIRECT-EVENT v2 — composição proposta a partir dos contratos

2026-09-24. Base imutável: `f51b32f4f6a57364ddac1cb7e0282af7017a5d4a`.
NÃO APLICADA. Substitui a proposta v1 rejeitada, preservada no Git e nos
artefatos sem sufixo v2. Não altera runtime, registry, contratos ou 76 grafos.

## Confronto do NÃO APTO

HIGH confirmado: invoice_payment_amount exige explicitamente validação de
categoria, conta e cartão. Sua referência account_id precisa de get + resolução
derivacionais, ainda que o payload da conta continue em proof. Não interpretar
a ausência dessa obrigação no grafo como autorização para dispensá-la.

MEDIUM confirmado: as relações person_id/category_id de balance_delta,
person_id de amount, person_id/category_id/card.owner_id de target/correspondence
não são justificadas pelos respectivos cálculos. Resolver uma referência já é
dependência causal, mesmo sem payload. Não introduzir reads para fazer runtime
coincidir com autoria histórica excedente. Remover somente da derivation
proposta, mantendo integralmente proof, relações, snapshots e predicados.

LOW incorporado: o novo helper testa a geração completa de nodes/reads/edges/
claim_reads/structural, não somente a inserção keys. Identidade e conteúdo de
canonicalValue são conferidos contra a base antes de importar a dependência.
Igualdade de proof significa preservação estrutural, não suficiência semântica
nem execução de seus predicados.

## Perfil proposto (decisão normativa explícita, ainda não autorizada)

O núcleo de contexto preserva o evento específico ligado ao role event,
identidade do evento, data civil válida igual à consulta, state confirmed e
date/event_date. Lê subject.kind/ref_id, period.kind/value e time_basis por
handle. balance_delta tem subject account; os demais têm subject event.
Guards/identidade da invocação não tornam pessoa/categoria/conta/card obrigatórios
quando a semântica específica não os usa. Nenhum expected entra no evaluator.

| Métrica | Referências e payloads derivacionais além do núcleo | Resultado |
|---|---|---|
| balance_delta | event.account_id (get + relação admitida), compara com subject account; event.amount_minor | valor com sinal |
| invoice_payment_amount | event.category_id, account_id, settles_card_id (cada scalar + relação admitida); categoria nominal neutral.invoice_payment; event.amount_minor | magnitude |
| invoice_payment_target_card | event.settles_card_id (scalar + relação); identidade/id/version do cartão resolvido ligada ao role card | ID do cartão |
| statement_payment_correspondence | keys do evento, em conjunto com schema v1 fechado, sem consumo do role card nem settles_card_id | unproven |

Contas, pessoas e categorias resolvidas em nível de referência não ganham
payload/identidade examinados automaticamente. Sua tipagem e coerência de alvo
são admitidas antes do guest pelo mecanismo existente; proof preservada valida
as obrigações econômicas completas. Para amount, a categoria nominal deve ser
validada especificamente: neutral genérico não basta. Para target_card, a
identidade/version do cartão realmente retornado deve concordar com o role;
não ler owner_id nem impor igualdade entre pagador e titular.

### Correspondence não herda a fórmula de target_card

Esta é uma decisão explícita da v2, não inferência de aprovação anterior.
O contrato statement_payment_correspondence retorna unproven pela ausência
estrutural de vínculo a fatura e declara que trocar somente o cartão não cria
correspondência. Portanto sua fórmula v1 não precisa resolver ou consumir cartão
para chegar a esse estado. A existência do role card na assinatura atual não
obriga leitura: binding de role não é prova de dependência causal. O host ainda
admite os roles/snapshots e proof mantém integralmente card, vínculos e checks.
Nenhum role é removido/redefinido no registry por esta proposta.

O auditor deve julgar especificamente essa separação. Se o contrato exigir
consumo de cartão para validar o domínio da pergunta antes de unproven, a v2
não pode ser aplicada como está; é preciso justificar tal pré-condição e seu
perfil. Não conservar card só porque constava na derivation ou no código.

O schema v1 é additionalProperties:false e não admite statement_id,
settles_statement_id, settles_statement_period. keys registra a estrutura
exposta. O código futuro deve recusar extensões não revistas, não devolver
unproven após ignorá-las. Não fabricar proven e não usar somente o schema como
substituto da observação estrutural explicitamente exigida pelo contrato.

## Gerador e delta completo separados da execução

O helper v2 usa perfil declarativo por metric ID + roles. Gera o conjunto
completo derivacional pretendido das cinco dimensões; o grafo atual só fornece
bindings e relações materiais, não a lista de reads a preservar. O diff entre
autoria atual e proposta é calculado depois. Nenhum input actual, oracle, resultado
financeiro, evaluator ou recorder entra na geração. As primitivas são leitura
do contexto, identidade do evento/cartão, escalar, referência admitida e keys.
Operação, role, relação ou métrica inválidos falham; target nominal é conferido
com snapshots versionados da base. Não reconstruir os outros 71 grafos.

Preservar required_selections/selected_nodes (vazios nessas derivações) e
evidence_set_mode exact. O helper verifica esses invariantes, sem usar seus
valores para aprender o perfil. Simula substituição em cópia, nunca grava corpus.
Saída contém atual, proposto, delta exato e regra de cada obrigação. Proof,
claims, sets, predicates, edges e demais campos são comparados integralmente.
Remover uma edge da obrigação derivacional não remove a relação do grafo/proof.

Delta calculado: cinco grafos modificados na simulação, 71 intactos; remover
um required_node, adicionar um read e remover 13, adicionar uma edge e remover
12, adicionar um keys. required_claim_reads e seleção não mudam. Cada alteração
está discriminada no JSON; não são contagens de aprovação financeira.

Validações internas: geração completa equivariante a renomeação de aliases e
edge IDs; reordenação de claims/grafos/nodes/edges; invariância à adulteração
da antiga lista de reads; negativos de métrica, role, ausência/duplicação/
incoerência de referência e target card divergente. Cada teste tem alcance
mecânico explícito; não prova as escolhas normativas acima por si só.

Inputs fixados por SHA/blob: contratos do registry, registry, claim/corpus,
snapshot manifest, schema, material registry, binding e canonicalValue. O helper
não autentica uma execução externa ou todo fingerprint semântico. A proposta
v2 inclui as cinco derivações completas para o auditor não depender da leitura
integral do grande corpus no navegador. Hashes identificam, não provam semântica.

## Gate seguinte

Somente após APTO documental confrontado: aplicar o delta exato revisado e
atualizar suas identidades dependentes pelo workflow existente; implementar a
mesma composição por métrica; REDs gerados e cinco integrações com expected
congelado antes da execução; testes negativos de perda de cada observação;
resultado comparado separadamente ao oracle; afetados e uma ampla estável;
auditoria independente do novo código. Nenhum código aprovado por este texto.

Demais 12 divergências da sonda e três derivados continuam fora deste recorte.
Sem GO global N02-G/NEXT-02, NEXT-03, deploy, produção ou dados reais.
