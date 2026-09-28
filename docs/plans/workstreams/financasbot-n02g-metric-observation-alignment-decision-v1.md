# N02-G — alinhamento normativo de observações métricas

Estado: PROPOSTA REVISADA NÃO APLICADA; auditoria documental independente pendente.
Base documental: `207ca56b87381d69a922224332fcdda3a629d822`.
Escopo: os onze claims abaixo, sem modificar registry, contract hashes,
snapshots, proof, oracle, freeze ou qualquer execução produtiva.

## Motivo e fronteira

A sonda de transporte medido executou os 73 claims sem pai. Sessenta e dois
perfis I derivacionais coincidem com a autoria vigente; onze divergem. Isso é
diagnóstico, não fonte de obrigações: a proposta abaixo deriva dos contratos
funcionais, dos roles, do schema de campos opcionais e das relações materiais.
Ela não copia o trace observado, não suprime eventos e não transforma um
`result` funcional em metadado causal. O recorder continua sendo o único
writer de L/T; o comparator atual não decide M e nenhuma aprovação de grafo
é inferida desta sonda.

| Família | Fact keys | Fórmulas |
|---|---|---|
| Conta/movimentos | `S-04#1#1`, `S-06#1#1`, `S-12#1#1` | `movement_ids`, `account_balance` |
| Parcelas | `S-11#1#1`, `S-11#1#2`, `S-11#1#3`, `M-07#1#2`, `F-07#1#1`, `F-07#1#2`, `F-07#2#1`, `F-07#2#2` | `installments_realized`, `installments_realized_amount`, `installments_projected`, `installments_projected_amount`, `projected_installments` |

## Regra comum de autoria

A nova `trace_contract.derivation` de cada um desses onze grafos deve ser
composta **antes de executar o evaluator** a partir do claim, roles do registry,
snapshot admitido, regras abaixo e `selections`/predicados autorados. O
corpus atual não é o template das obrigações: listas antigas de reads/edges
não devem ser preservadas só porque já constam nele. A seleção vigente é
uma autoridade normativa separada dessas listas: como o role `events` é o
`node_set` do candidate_set, a seção “Seleção por fase” do binding contract
exige executar também na derivation todos os predicados dos selecionados e
excluídos. Seus `field`, `presence`, `edge` e templates expandidos geram
obrigações I mesmo quando não alteram R. A proposta não autoriza gerar expected a
partir de actual, de R, do oracle ou do log do recorder.

`required_nodes` contém cada nó cujo payload/identidade a fórmula examina,
inclusive candidatos excluídos; `required_reads` contém os pares exatos
nó/campo; `required_edges` contém somente relações efetivamente resolvidas;
`required_structural` contém as operações estruturais distintas efetivamente
usadas. `required_claim_reads` cobre contexto de sujeito/período/time_basis
conforme a fórmula. A seleção autorada permanece exata e independente de R.
O `proof_trace` e suas obrigações permanecem integralmente inalterados;
retirar uma dependência derivacional excedente nunca retira uma prova.

## Conta e movimentos

O role `account` fixa a conta e sua revisão. A fórmula lê sua identidade
material e compara sujeito do claim. `account_balance` lê
`opening_balance_as_of` e `opening_balance_minor`, usando o primeiro como
limite inicial inclusivo e somando somente valores elegíveis até o corte
inclusivo. `movement_ids` não lê o saldo de abertura: sua semântica é a lista
de IDs confirmed do mês, na ordem revisada.

Para **cada evento** do role `events`, a fórmula observa identidade, data,
state e a existência estrutural do campo opcional `account_id`. Se ausente,
esse evento não pertence à conta e não se lê um valor inexistente. Se
presente, a fórmula lê a referência nominal, resolve sua aresta admitida e
confere ID e revisão do target com o role `account`; isso inclui targets de
outras contas usados para exclusão. Somente eventos confirmed, dentro da
janela e da conta exata são selecionados. `account_balance` lê
`amount_minor` somente dos selecionados. `movement_ids` lê seus IDs, já
observados na passagem sobre todos os candidatos.

Portanto, as obrigações derivacionais incluem `has(account_id)` em todos os
candidatos, `get(account_id)` e a aresta correspondente apenas onde o campo
existe, e a identidade de todo target realmente resolvido. Não incluem
`person_id`, `category_id`, `card_id` nem suas arestas apenas por serem
relações do snapshot ou obrigações de proof. Não incluem opening balance em
`movement_ids`. O conjunto material de eventos e os selected sets
ratificados não são alterados.

## Parcelas

O plano revisado fornece `members`, `installment_total`, identidade e
revisão. A lista de membros, com cardinalidade, ordem, unicidade e arestas
admitidas, é a autoridade para decidir **quais eventos são candidatos a
parcela daquele plano**. Todos os eventos da população ainda têm a identidade
material observada para comprovar unicidade e detectar membro ausente. O
evento não listado não é membro funcional do plano, mas sua exclusão continua
submetida aos predicados de `selections` já autorados. Na derivation, casos
`absent_installment_plan` exigem `has(installment_plan)` e casos
`exclude_state` exigem leitura de `state`, mesmo em não membros. Templates
de janela são expandidos para os membros de seu set e exigem as leituras
de `date` correspondentes. Isso não autoriza incluir categoria, cartão ou
conta por closure de proof: são observações da seleção, não cópia de actual.

Para cada membro listado, a fórmula lê e resolve `installment_plan`, exige
o mesmo plano/revisão, lê número, total, data civil e state, exige sequência
sem duplicatas e datas estritamente crescentes por número. A condição
`through` ou intervalo inclusivo e o state `confirmed`/`projected`
determinam a seleção. Só os selecionados das métricas de valor têm
`amount_minor` lido e somado com o sinal contratual. Membro da lista não
encontrado na população, associado a plano diferente ou repetido falha
fechado; não vira seleção vazia.

Em `projected_installments`, a família e sua lista `members` são
observadas com cardinalidade/ordem e arestas. Para cada parcela do plano,
`person_id` é lido e sua relação admitida resolvida, então confrontado
com essa lista. A associação pessoa/família é obrigatória nessa fórmula,
não nas quatro métricas cujo sujeito é o próprio plano.

`category_id`, `card_id` e `account_id` não participam do cálculo
contratual de número, calendário, state, valor, plano ou família. Não devem
ser lidos pelo evaluator somente para satisfazer trace legado. Continuam
disponíveis à fase proof quando seus predicados econômicos os exigirem.
Se for desejada uma nova invariante funcional de categoria/cartão/conta
constantes entre parcelas, ela exige decisão normativa separada no contrato
do evaluator; esta proposta não a introduz por inferência.

## Artefato de composição e aplicação futura

O primeiro parecer sobre `399918ccf7ea209cd4ee0255d8c4e690635a2d03`
foi `INCOMPLETA / NÃO APTO`: o auditor não pôde ler o corpus-base grande.
Inspeção local do parent constatou ainda que a versão inicial removia
obrigações de predicados de seleção em oito grafos de parcelas, embora
preservasse `required_selections`. A revisão não aplica essa composição
incompleta; fecha a classe pelo contrato de seleção, sem afrouxar o comparador.

O helper offline
`docs/audit-evidence/n02g-causal-authoring-profile/prepare-account-installment-observation-proposal.cjs`
lê o corpus, claims, registry, contratos e manifest do SHA-base imutável.
Ele não carrega evaluator, recorder, oracle, valor esperado nem trace.
Produz as onze `proposed_derivation` completas no JSON homônimo,
confronta seleção, roles, referência nominal/versionada, arestas e
unicidade, e simula a substituição em memória. A simulação exige que os
outros 65 grafos e os 76 proofs permaneçam integralmente iguais; o corpus
real continua intacto. Nove negativos/controles exercitam aresta ausente
ou duplicada, alias inválido, seleção divergente, membro/link ausente,
membro ausente da população, predicado de seleção ausente ou alterado,
e independência das antigas listas de reads/edges. Onze negativos/controles
passam; o modo `--check` exige byte-a-byte a saída publicada.
O witness focal `account-installment-selection-witness.json`, gerado pelo
helper homônimo diretamente do blob imutável do parent, publica as onze
`selections`, seus predicados referenciados, digest integral de cada registro
e a comparação de dependências `field`/`presence`/`edge` e templates
expandidos com a proposta revisada. O verificador exige igualdade integral
entre cada `current_derivation` e a do corpus original; isso não é leitura
independente do Chat nem aprovação sem auditoria.

O delta revisado contém seis nós lidos adicionais de contas alternativas,
84 observações estruturais adicionais (incluindo `has(account_id)` e
`has(installment_plan)` da seleção), seis reads de identidade desses
targets e a remoção de 515 reads e 373 arestas derivacionais
excedentes nos onze grafos. Não altera required_claim_reads, seleção nem
proof. Esses totais descrevem o **perfil proposto**, não sua aprovação.
Uma alteração tão ampla deve ser julgada semanticamente, em especial a
ausência de dependência funcional de categoria/cartão/conta nas parcelas;
igualdade mecânica com a proposta não basta.

Antes de alterar `graphs-v2.json`, a auditoria documental deve julgar
explicitamente se essa composição completa é normativa. Referência
escalar que não bate com target versionado, membro duplicado/ausente e
período incompatível devem falhar fechado. Nenhum `expected` pode ser
preenchido por saída do evaluator.

## REDs de código após decisão documental

REDs do código deverão provar: alternância de presença de `account_id`;
target de outra conta/revisão; opening balance afetando só balance;
evento confirmado fora da janela; membro de plano ausente, duplicado,
apontando para outro plano ou fora do corte; ordem civil inválida; membro
da família divergente; e alteração de categoria/cartão/conta sem efeito em
R quando proof é analisado separadamente. Testes devem exigir eventos I
visíveis e cobertura exata, não apenas valor financeiro correto.

Somente após parecer documental explícito, aplicar a composição completa,
ajustar `metricInstallments.js` para usar o roster na elegibilidade e executar
os predicados de seleção autorados, inclusive observações de exclusão em
não membros, sem copiar trace nem fazer reads adicionais de categoria,
cartão ou conta; preservar `metricDirectReads.js` quando sua
observação de presença/ref é causal, executar REDs/afetados e uma suíte
hermética ampla estável, e publicar commit de código para auditoria
independente. Esta proposta não aprova esses passos nem autoriza GO global
N02-G/NEXT-02, NEXT-03, deploy, produção ou dados reais.
