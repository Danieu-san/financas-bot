# N02-G — proposta fechada para witnesses source_state

Status: PROPOSTA DOCUMENTAL NÃO RATIFICADA; runtime e normas vigentes intactos.
Base imutável: `6ed3822a1a4c4e8836232d3a874faefbda9ff05c`.

## 1. Decisão proposta e limite

Adotar uma separação explícita entre **calcular uma observação provisória** e
**aceitar o fato**, corrigir a seleção da fonte de uma consulta nominal e
definir uma referência funcional contrafactual para negativos semânticos.
É uma única decisão de fronteira D/P e qualificação G11, não três exceções por
fact_key. Não adicionar campos financeiros, mudar operadores dos witnesses,
agrupar átomos, reduzir inventário ou modificar os oracles positivos.

Esta proposta altera explicitamente a disciplina de qualificação negativa de
§10.0. Não alegamos que preservar R contra o oracle original seja possível nos
dois negativos de coverage de S-16. Também não alegamos que esta alteração já
seja autorizada pelas normas atuais. Deve receber **APTO DOCUMENTAL PARA
IMPLEMENTAR ESTA PROPOSTA**, após confronto independente, antes de aplicação.
Não aprova WIP, código, G11, N02-G, NEXT-02, NEXT-03, deploy ou produção.

## 2. Diagnóstico que a decisão precisa resolver

O diagnóstico anterior permanece histórico. O parecer recebido foi retificado:
`eq → not_eq` é `predicate_strategy/compatible_wrong_operator`, não substitui
`predicate_atom`. Para este último, alterar conteúdo, recalcular fingerprints,
manter claim, predicados, operands, operadores e estrutura do pacote negativo.

Há nove coordenadas pendentes: sete abortam D antes de P; duas executam, mas
mudam R e a seleção proof. Resultados locais são relatos, não testes do auditor:
23 baselines, 48 geradas, 41 executadas, 39 qualificadas. Nada neste documento
transforma essas nove linhas em PASS.

O witness e seu verificador publicados junto desta proposta extraem somente
autoridades imutáveis da base, não a árvore WIP: quatro grafos, nove predicates,
seleção de S-16, claims focais, contratos e trechos normativos. Leem o corpus
integral para exigir 76 fact_keys únicos, mas publicam apenas a projeção focal.
Isso resolve a leitura do arquivo grande sem pedir auditoria dos 76 grafos.

Em S-16, `binding_11` e `r0004_include_coverage` têm **o mesmo atom e obligation,
coverage**, além de operands/op idênticos. Duas expressões falsas não implicam
dois átomos. Porém, hoje r0004 também controla a seleção: sua falsificação muda
o selected_set observado e ameaça evidence_set/trace. Deduplicar nomes de
átomos, sozinho, não resolve a coordenada.

## 3. Autoridade de D, P e aceitação

Para `eligible_event_count_v1` e `source_coverage_v1`:

- D produz somente R tipado provisório e observações instrumentadas; não
  declara validade de período, completude, receipt ou fato aceito.
- P comprova as relações source.period/claim.period e coverage exigida.
- O host só aceita/materializa depois de P, identidade, fingerprints, seleção,
  traces, todos os gates e **oracle positivo original** passarem. Um R provisório
  não pode virar input de validated_parent, resposta financeira ou zero aceito.
- Erro de schema, identidade, acesso, artefato, timeout ou child continua erro;
  nenhum erro genérico recebe crédito de predicate_atom.

Proposta de adendo de fase aos dois contratos, sem mudar seus outputs/fórmulas:

> “Retornar após provar” refere-se ao resultado aceito pelo pipeline completo.
> A fase D pode produzir R provisório sobre inputs admitidos; as relações de
> período/completude da fonte são comprovadas por P antes de qualquer aceitação.
> Não há retorno financeiro aceito, coerção de partial/unavailable para complete
> ou promoção de zero sem essa prova e os demais gates.

Aplicação prevista:

1. `eligible_event_count`: retirar de D somente os guards de igualdade de
   source.period e de coverage complete e suas leituras sem uso funcional.
   Preservar seleção funcional por sujeito/categoria/estado/período, tipo
   nonnegative_integer e confronto source.event_count/cardinalidade. Período
   da seleção continua vindo do contexto; não vem da fonte mutada. Os guards
   de identidade, ownership e outros domínios não são removidos por este adendo.
2. `source_coverage`: retirar de D somente a comparação de source.period com
   claim.period e navegações sem uso funcional. Preservar resolução nominal,
   identidade/scope, enum válido e retorno literal de coverage, inclusive
   partial/unavailable. Não retornar complete para fazer o negativo passar.
3. Autorar os novos required_reads/required_claim_reads de D a partir dessas
   dependências **antes** de executar. Leituras removidas de D permanecem em P
   quando causais; leituras reais novas nunca são ocultadas. A profile e os hashes
   de contratos/artefatos precisam ser atualizados e revisados em conjunto.

Isso trata esta classe de guards source-state; não promete fechar outras
famílias G11 ou autoriza uma limpeza geral de guards. Se P não provar uma
relação retirada de D, a aplicação deve falhar fechado, não remover a relação.

## 4. Seleção nominal de S-16

`source_coverage` pergunta pelo estado da fonte indicada por subject.ref_id.
Coverage é o dado medido e uma relação a provar, não a identidade que escolhe
qual fonte foi consultada. Selecionar “a fonte complete” mistura estas funções.

Aplicar no grafo S-16#1#1, antes de qualquer mutant:

```text
selections[0].selected_predicates:
  [r0004_include_coverage] → [binding_7]
```

`binding_7` já exige source_complete_june.id == claim.subject.ref_id. Não criar
novo campo, novo predicate ou alias financeiro. Manter candidate_set,
selected_set, membros/ordem, todas as exclusões de identidade, ambos os
predicates coverage e seus IDs/operadores/operands. R0004 passa a ser relação
obrigatória de coverage fora do papel de seletor; continua executado em P.

A revisão deve confirmar que a seleção nominal é suficiente e corresponde ao
claim/role, não apenas aprovar a troca sintática. Para outros grafos, não aplicar
por nome de métrica/fact_key: só uma seleção com essa mesma autoridade nominal
explicitamente ratificada pode usar este perfil. Caso não seja demonstrada,
permanecer HOLD. A escolha financeira de outros domínios não muda.

No negativo coverage complete→partial/unavailable, a mesma fonte permanece
selecionada. P lê os mesmos caminhos e rejeita coverage; evidence_set/trace
não podem ser dispensados. Num negativo de identidade, esse desenho também
precisa rejeitar seleção errada — ele não é uma seleção incondicional.

## 5. Referência funcional contrafactual — alteração normativa explícita

Os sete negativos de period/coverage que não determinam o output preservam R.
Os dois negativos de coverage retornada em S-16 não podem preservar R:
source_coverage deve devolver literalmente o novo estado válido.

Proposta de acréscimo **limitado aos negativos semânticos G11** em §10.0:

> A qualificação negativa separa validade da fórmula e validade do fato
> original. O oracle positivo e o claim permanecem congelados. Se a única
> mutação semântica altera legitimamente um input funcional, o harness exige
> uma referência contrafactual independente, tipada, pré-computada a partir
> do mutant schema-valid e da lei funcional ratificada, sem executar/importar
> o evaluator sob teste e sem ler seu actual. A diferença contra o oracle
> positivo continua registrada e impede aceitação/receipt do fato original;
> nunca é sobrescrita nem promovida a PASS do gate positivo. Somente a
> qualificação negativa usa a referência contrafactual para provar que D
> continua obedecendo à mesma lei. Sem referência independente suficiente,
> o witness permanece UNSATISFIED_MUTATION_WITNESS.

Esta é a substituição explícita da exigência de R constante **nesta classe de
teste negativo**, não uma exceção que permita fórmula errada ou cofalhas.
Não modifica o value oracle de produção/corpus. Um negativo com P false e R
errado contra sua referência continua não qualificado, ainda que fosse RED
contra o oracle positivo por qualquer razão.

Referências previstas, calculadas e seladas antes de invocar D/P:

- `source_coverage`: localizar a fonte por identidade congelada no pacote
  sintético e obter seu enum coverage admitido. A referência é o literal do
  mutant, não o R observado, nem o boolean de P, nem uma chamada ao kernel.
- `eligible_event_count`: obter seleção elegível diretamente das fixtures e
  condições ratificadas com uma implementação de referência independente.
  Confrontar source.event_count com essa cardinalidade. Nenhum campo funcional
  muda nestes seis mutants; referência e R devem permanecer iguais ao positivo.
- S-16/period: coverage factual não muda; referência e R permanecem iguais.

Publicar separadamente `positive_oracle_matched`,
`counterfactual_reference_matched`, `proof_satisfied`, cobertura D/P e
`negative_witness_qualified`. Para os dois negativos S-16/coverage, o primeiro
é false, o segundo true e P false. Não condensar isso em “fato válido”.
A referência não entra como operand, claim, payload, trace ou input do guest.

## 6. Átomo não é predicate; coordenada não é execução compartilhada

Proposta de precisão em §10.0, sem exceção de grupos atômicos:

> O conjunto observado contém os átomos de todas as barreiras recusadas, não
> somente nomes dos predicates falsos. Expressões distintas associadas ao
> mesmo átomo não criam outro átomo. Cada coordenada conserva seu ID e execução
> própria, deve falsificar seu predicate alvo e preservar toda obrigação fora
> do átomo declarado. É proibido unificar átomos diferentes, inferir a
> classificação de um erro genérico ou omitir falhas de seleção/trace/resultado.

Nos dois negativos coverage de S-16, ambos os predicates coverage falsos podem
representar `[coverage]`, mas somente se todas as outras barreiras passarem,
inclusive seleção nominal, evidence_set, trace exato, fingerprints reparados,
evaluator/artefato/roles e a referência funcional contrafactual. Se aparecer
period, identity, evidence_set, trace ou outro átomo, é UNSATISFIED, sem
“minimal co-failure closure”. O campo diagnóstico false_predicate_atoms atual
não constitui sozinho esse classificador integral.

Não deduplicar os dois IDs predicate_atom no inventário, não reaproveitar uma
execução para satisfazer duas linhas e não transferir crédito de uma família.
Predicate_strategy continua família separada. As quatro contagens e unicidade
de IDs são verificadas por família no pacote estável; mudanças de inventário
precisam ser diferenças explicadas de autoria, nunca números hardcoded.

## 7. Construção e controles de saída

Depois de ratificação, cada mutant muda apenas source.period ou coverage por
alternativa legal, repara versões/fingerprints/manifest e mantém o **grafo já
ratificado**, claim, operadores e estrutura intactos. Não usar o grafo antigo
para D e outro para P; as duas fases recebem a mesma admissão do mutant.

REDs/controles obrigatórios antes da ampla:

1. Restaurar conteúdo + fingerprints volta ao baseline positivo/oracle original.
2. eq→not_eq permanece estratégia e não satisfaz nenhum ID predicate_atom.
3. Sete casos chegam a P, com R/referência iguais ao positivo e rejeição isolada.
4. Dois casos coverage usam partial e unavailable: D devolve o literal; a
   seleção é a fonte nominal; ambas as expressões coverage são observadas;
   o classificador integral encontra somente coverage e nenhum receipt é criado.
5. Cada ID é executado separadamente; predicate alvo e reads são observados.
   Apontar expected_violations para outro átomo falha.
6. Segunda mutação de período/identidade, fingerprint errado, nó extra, fonte
   equivocada ou seleção incondicional impede qualificação. Não compensar.
7. Remover leitura real, acrescentar leitura não declarada ou preencher expected
   pelo actual falha. Não relaxar os comparadores de trace.
8. Fórmula que força complete, troca enum, retorna zero indevido ou usa a
   referência/oracle como input falha, mesmo com P false.
9. Throw, timeout, compiler/schema RED e aborto antes de P não recebem crédito.
10. Selar referência e hashes dos inputs antes da execução; alteração posterior,
    referência produzida pelo kernel ou dependência do actual deve ser recusada.
11. Validated_parent/resposta financeira só recebem R depois de todos os gates
    positivos; nenhum negativo gera receipt ou aceita dados parciais como completos.
12. Executar o subconjunto completo (23 baselines/48 coordenadas da base),
    confrontar inventário regenerado e preservar as outras 39 qualificações.
    Se o inventário mudar por autoria aprovada, publicar o delta exato e exigir
    todas as novas coordenadas. Nada disso fecha G11 global.

Com candidato estável: afetados, uma ampla final honesta e auditoria independente
do código/aplicação. A ampla anterior permanece RED: 2413 PASS/3 FAIL/10 SKIP;
falhas legadas reproduzidas na base não são PASS e não são corrigidas neste recorte.
Não repetir agora a ampla ou a família trace verde para avaliar uma proposta.

## 8. Alternativas rejeitadas e critério da revisão

Rejeitamos `eq→not_eq` como atom, campos artificiais de coverage apenas para
testes, oracle construído do actual, uso de D baseline/P mutant, ocultação de
reads, exceção de cofalhas entre átomos e redução de cardinalidade.

A revisão deve julgar, em conjunto, a autoridade D/P, a seleção nominal,
a alteração negativa explícita de §10.0 e os controles contra falso verde.
Se qualquer parte for insuficiente, emitir HOLD/finding causal: não aprovar
apenas a extração nem devolver alternativas abertas como permissão de aplicar.
Exigir identidade do commit/parent e arquivos realmente lidos; distinguir
leitura das autoridades imutáveis de resultados locais relatados.

O cabeçalho histórico da arquitetura ainda diz candidato/não normativo na base.
Esta proposta não corrige essa cadeia por conta própria: usa §§7–10 como regra
G11 apontada pelo charter vigente. Não reivindica ratificação externa adicional.
Antes de aplicação, a confirmação de autoridade desta alteração deve constar
do checkpoint; a aprovação documental não é aprovação de código.
