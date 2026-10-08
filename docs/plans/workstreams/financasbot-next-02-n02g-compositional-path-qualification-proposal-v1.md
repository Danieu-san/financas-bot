# N02-G — proposta de qualificação composicional de paths

Data: 2026-10-08. Estado: PROPOSTA NÃO RATIFICADA; SEM IMPLEMENTAÇÃO OU GO.
Decisão normativa nova: substituir SOMENTE o método de fechamento da família
predicate_path_semantic/v2 por path-qualification/v3. Não declarar o contrato
anterior cumprido nem chamar recusa de admissão de witness semântico.

## 1. Decisão, necessidade doméstica e limites

Perguntas domésticas precisam usar pessoa, conta/cartão, período, base temporal
e fontes corretos. Cálculo exato sobre o campo errado também é resposta errada.
Preservar compiler, isolamento, observação real, claims, resultado e pais.
Não multiplicar perfis contrafactuais para fazer autoria estruturalmente inválida
atravessar o compiler. Qualificar conjuntamente a barreira estática e o caminho
semântico admitido, com evidência distinta para cada garantia.

Original primeiro: o confronto consumer-first e de confiabilidade já consta em
financasbot-domestic-roadmap-review-20261007.md. Reutilizar regras financeiras,
consumidores, casos e controles existentes quando compatíveis; não portar a
normalização permissiva, a autoridade heurística ou os defeitos de contexto do
legado. Esta decisão não reconstrói engine, gateway ou sessão e não abre adapters.

Fontes normativas confrontadas: financasbot-next-02-n02g-v1.md, §§2/5/7/8;
financasbot-next-02-n02g-path-domain-proposal-v2.md, §§2–6, ratificada em
f892a35fce88fe21d474bd7ed408fe2697052ce7; contratos provenance-v2 e adendos
mensal/selected-day referidos no plano doméstico. Seus artefatos são imutáveis.

Alcance: todos os predicados path-bearing do inventário v2, sem lista de IDs,
fact_keys, métricas ou causas históricas dispensadas. As regras são derivadas
da gramática, tipos, namespaces, vínculos e consumidores reais de cada candidato.
Nenhum destino é inferido de uma mensagem de erro ou de um relatório antigo.

Fora do delta: demais estratégias/átomos G11, os controles path/reference de
admissão por site, G07/G08/G14, pais, oracle, trace, limites, schemas financeiros,
corpus e qualidade conversacional. Não importar exceções mensal/A-B/source-state.
Não alterar compiler/checkers para permitir negativos antes recusados.

## 2. Garantia proposta — e diferença honesta para v2

Para cada predicado com path, demonstrar uma destas propriedades:

1. Há alternativa admitida e discriminante: executar o witness semântico normal
   de v2, precomprometido, com rejeições exatas e C/M/S genuínos.
2. Nenhuma alternativa tipada existe, ou todas violam uma restrição estática
   obrigatória: provar a completude do domínio e o vínculo dessa restrição com
   a admissão normal e com o executável; exercer a barreira separadamente.
3. Há alternativas admitidas, mas são semanticamente equivalentes por uma
   relação necessária do contrato: provar essa equivalência, incluindo todos
   os consumidores. Coincidência de valores na fixture não satisfaz este caso.

Sem uma dessas provas, permanece BLOQUEADO. A inexistência de alternativa no
gerador atual não prova singleton; a recusa atual não prova segurança estática;
o resultado igual não prova equivalência. Referência independente ausente,
cofalha inexplicada e timeout continuam bloqueios, não novas disposições.

Isso NÃO é equivalência literal ao teste contrafactual de v2: v2 exige witness
semântico mesmo quando ele não existe nesse domínio. A proposta muda o método
de assurance e o significado do fechamento; precisa de ratificação explícita.
Pretende preservar a garantia sobre comportamento admitido, mas sua suficiência
depende do modelo de falha abaixo, da prova de composição e da auditoria. Até
lá não alegar garantia equivalente demonstrada ou N02-G encerrado.

### Modelo de falha coberto

Troca de um locator authored por outro de mesma forma/tipo nominal/unidade,
incluindo anchor permitido e paths dentro de templates/ref_set/sort/projection;
substituição incompatível com selection bindings/requirements; omissão ou
adulteração de autoria, IR, programa, medição, observações ou vínculo ao claim.
Uma troca material não pode ser compensada alterando claim/oracle/outro predicado.

O argumento é: autoria fora do domínio não chega aos handles; autoria admitida
executa sob bytes confrontados com toda a autoria; reads/escopo/ordem/seleções
reais e R correspondem ao claim e à referência independente. Falha de qualquer
termo invalida a composição. Um teste do compiler isolado não fecha esse argumento.

Ameaças da plataforma/TCB e limites externos permanecem os já declarados nos
contratos ratificados. Hash, VM, AST ou testes por amostragem não provam ausência
geral de comportamento JavaScript, autenticação de auditor humano ou segurança
de plataforma comprometida. Captura de bytes não é replay BUILD independente.

## 3. Domínio completo, selado antes do negativo

Para candidato C, predicado p e cada site authored s:

- L(s): todos os locators distintos do original no closed world declarado,
  com o mesmo ramo, kind, tipo nominal, unidade e forma, conforme schema/registry.
- A(s): membros de L(s) que satisfazem as restrições estáticas normativas para
  a única troca nesse site, mantendo o restante da autoria/payload/claim/oracle.
- W(s): membros de A(s) cuja troca é discriminante segundo referência semântica
  independente, respeitando o conjunto exato de violações exigido por v2.

Registrar L, A, W e seus fundamentos por site, sem deduplicar bindings/sites
por valores iguais. Domínios finitos devem ter enumeração integral; uma regra
paramétrica só substitui expansão se sua totalidade e aplicação a TODOS os
membros forem verificáveis no closed world desse candidato. Limite do analisador,
alias não resolvido, namespace novo ou import dinâmico deixam a prova bloqueada.

Expected vem de enumeração independente de schema+autoria, não de IR observado,
TAP, actual, trace ou da lista que o executor conseguiu gerar. Confrontar todos
os sites, inclusive templates aninhados, anchors, versões/hashes e namespaces.
Nenhum namespace implícito, registry inventado ou corpo omitido por conveniência.

Os domínios, a disposição prevista, a referência, o primeiro site/candidato
discriminante e expected_violations são selados antes de M e de seus resultados.
Classificar por restrições authored e semântica normativa independente; não
executar alternativas até achar uma que falhe como desejado. Compiler/actual
podem contradizer o selo e bloquear; nunca ajustá-lo depois para fazer PASS.

Para provar A, citar as regras do contrato e suas instâncias, incluindo relações
entre campos/bindings/requirements. Uma lista de tipos não resolve restrições
relacionais. Reutilizar schemas/registries/índices e compiler atuais; não criar
um novo schema financeiro nem replicar o compiler como autoridade independente.
A independência é do fundamento e da enumeração, não alegada pelo nome do módulo.

## 4. Disposições exclusivas por predicado

| Disposição | Condição necessária | Evidência de fechamento | Crédito semântico |
| --- | --- | --- | ---: |
| semantic_witness | Algum W(s) não vazio | Primeiro witness selado, compiler normal integral, C/M/S e violações exatas de v2 | Uma invocação própria, sem compensação |
| static_domain_proof | Todos L(s) vazios ou todos A(s) vazios | Prova completa por site, baseline, vínculo à barreira e controles da §5 | 0 |
| semantic_equivalence_proof | Algum A(s) não vazio, todos W(s) vazios por equivalência NECESSÁRIA comprovada | Prova integral de cada alternativa admitida e de todos consumidores, §6 | 0 |
| blocked | Qualquer lacuna, contradição, falha, alternativa não classificada ou referência ausente | Diagnóstico e fronteira que faltam | 0 |

Se algum W(s) existir, semantic_witness tem precedência; não escolher disposição
estática/equivalente para evitar um negativo executável. Um predicado com sites
mistos recebe witness no site discriminante, sem perder a prova de domínio dos
demais sites nem os controles de admissão obrigatórios por site. Não converter
forma do locator, operador ou literal para criar alternativa fora da estratégia.

Cada row mantém identidade de p e todos os sites. expected_predicates é exatamente
o conjunto v2 path-bearing; a cardinalidade atual não vira constante do código.

Fundamento comum às três disposições: baseline integral, domínio fechado,
enumeração independente, todas as exclusões justificadas, vínculo autoria→IR→
programa/closure, identidade/observação reais e referência independente. Aplicar
as condições pertinentes da §5 também aos sites excluídos num row semântico ou
equivalente; nenhuma disposição dispensa os controles de admissão v2 por site.
Se parte do domínio não tem prova, o predicado inteiro fica blocked.

## 5. Prova estática — não é recusa promovida a PASS

static_domain_proof exige conjuntamente:

1. Baseline admitido pelo compiler NORMAL inteiro, C e S positivos sob toda a
   autoria, resultado/oracle e coverage/trace normativos, não só predicado alvo.
2. Enumeração/derivação integral de L e A por site. Singleton é propriedade do
   domínio admitido, não falta contingente de dados, suporte do gerador ou valor.
3. Para cada exclusão, regra normativa e instância causal exatas que a impõem,
   restrição de bindings/requirements e coordenada esperada precomprometidas.
4. Evidência executada da barreira normal para cada instância distinta exigida:
   autoria sintaticamente válida, alteração única, diagnóstico e coordenada
   autênticos, zero abertura de handles e restauração positiva. Quando L vazio,
   usar o negativo unknown_path do namespace exato previsto em v2, sem chamá-lo
   de locator tipado existente. Schema inválido não demonstra o resolver.
5. Para L não vazio/A vazio, todos os membros têm justificativa de exclusão.
   Exercitar cada instância de regra necessária; membros só compartilham um
   controle se aplicação paramétrica completa estiver provada, não por mensagem
   igual ou por receberem o mesmo label. Não supor proof geral a partir de teste.
6. Independência contra erro comum: o pacote de qualificação confronta a regra
   declarada, os bytes do compiler/checker e os campos/vínculos authored. REDs
   incluem retirar/inverter a guarda, trocar sua coordenada e admitir um membro
   excluído. Asserção só do texto de erro não satisfaz esses controles.
7. Conformance integral autoria→IR→programa e closure medidos antes de handles.
   Comprová-la para o programa REAL, incluindo helpers/resoluções/bindings e
   consumidores; não confiar no IR produzido pelo mesmo compiler nem em flag.
   Prova estática sem ligação ao executável não fecha o row.
8. R/I/M/L/T e identidade confiada continuam exigidos nos positivos. Mutant
   excluído publica dp_execution=false; nenhuma passagem parcial como D/P.

As condições não instituem um novo motor em produto: são evidência de
qualificação/build a compor com os mecanismos existentes. Reuso só com hashes,
escopo, regra/instância e autoridade compatíveis. Se a instância não é coberta,
executar o controle faltante; não declarar todo grupo histórico coberto.

## 6. Equivalência necessária e detecção semântica

Igualdade de resultado, tipo ou valor numa fixture não basta. O argumento deve
cobrir identidade/origem, escopo/owner, versão, período, unidade, membership,
cardinalidade, ordem, medidas/reads, todos os consumidores e o valor de R/claim,
conforme contratos aplicáveis. Igualdade numérica entre pais não os substitui.

Uma relação necessária decorre do domínio/contrato e vale para suas entradas
admitidas, não só para o snapshot atual. Se duas folhas podem divergir em dados
válidos, ou se um consumidor observa sua identidade distintamente, não são
equivalentes. A classe201 histórica sem discriminante NÃO recebe equivalência
automática. Referência insuficiente deixa blocked; não preencher com actual.

Provar ausência de consumer relevante por lista authored é insuficiente: exigir
closure executável completa com capacidades e aliases resolvidos. Não transportar
o certificado narrow selected-day para operadores/consumidores que ele exclui.
Análise parcial ou helper não declarado bloqueia, sem relaxar o loader/checker.

Quando há W, preservar a prova D/P de v2, seleção anterior ao mutant e isolamento
da alteração. Rejeição colateral não é sucesso. Core/oracle/coverage e C/M/S usam
as regras normativas da autoridade explicitada; nenhuma fringe, lease ou exceção
de perfil existente se torna licença genérica. Um perfil ratificado só qualifica
seu alcance, em ledger próprio, nunca preenche esta proposta por analogia.

## 7. Composição, contagens e história

Novo ledger path_qualification/v3, SEM misturar suas provas com execution/matched
de semantic_mutation/v2. Um row por predicate_path_semantic/v2 esperado, ID antigo
preservado como target e nova autoridade explícita. Estado terminal verified só
após TODOS os artefatos/evidências da disposição serem confrontados.

```text
expected_predicates = enumerated_predicates = classified_predicates = verified_predicates
verified_predicates = semantic_witness + static_domain_proof + semantic_equivalence_proof
blocked = 0
```

É partição disjunta de IDs, NÃO soma de PASS entre ledgers. Num certificado
estático, verified não significa executed ou semantic_mutation_credit. Publicar
contagens separadas de provas estáticas verificadas, controles executados,
witnesses semânticos e equivalências, com IDs/instâncias e invocações próprias.
Ledgers obrigatórios de execução mantêm expected=generated=executed=matched.
Qualquer evento/captura incompleto, omissão, duplicata, replay ou fonte divergente
invalida sua evidência e bloqueia o fechamento correspondente.

Migração total: um row por ID v2 esperado, incluindo matches e pendências; target,
antiga autoridade/estado/evidência, nova disposição e justificativa, novos IDs
de evidência e hash normativo. Nenhum ID some. Confrontar conjuntos exatos,
não apenas2419 ou outra cardinalidade. Inventário v1→v2 já ratificado fica intacto;
não reconstruí-lo nem promover suas supersessões a testes.

Relatórios anteriores preservam UNSAT/RED/matched/valid/credit como publicados.
O velho ledger semântico não se torna verde: os rows estáticos/equivalentes têm
seu método supersedido prospectivamente após ratificação, não um witness cumprido.
Não somar387matches locais, selected-day1, focais ou relatórios de diferentes
autoridades. Reuso de evidência executada requer toda a identidade causal e a
invocação própria comprovadas; sem isso, nova execução necessária.

## 8. Critério de ativação e efeito no roadmap

Antes de aplicar: APTO DOCUMENTAL independente sobre ESTE método, sua suficiência
e limites; confronto local dos achados e ratificação explícita. APTO de helper,
verifier ou hashes não ratifica a substituição. A proposta não autoriza aplicação.

Depois, um recorte de implementação fechado: inventário/disposições/ledger e
integração à validação existente, com REDs gerados por classe/contraexemplo,
focais/afetados, uma ampla estável e auditoria independente do código completo.
Não criar auditoria por predicado/helper. Ramo não previsto bloqueia; duas falhas
da mesma classe exigem composição/contrato, nunca terceiro remendo nominativo.

Saída desse recorte: migração integral, ledgers exatos, provas/capturas válidas,
fontes/roots/TCB auditados conforme contrato e nova qualificação própria sob a
autoridade ratificada. Byte-binding candidato não vira validation_tcb_complete.
Enquanto falte qualquer parte, N02-G continua incompleto e NEXT-03 fechado.

N02-G-v3 só substitui a condição de saída PATH aqui descrita. Não basta este
ledger para GO: os76/76grafos,39/39entradas, G07/G08/G14, outras famílias G11,
pais/derivados e condições restantes do charter continuam integrais. G05/G06/
G09/G10/G13 e gates posteriores não são fechados por N02-G. Abrir NEXT-03 requer
seu pré-requisito global ratificado; não reduzir corpus ou selecionar subset
doméstico por conveniência nesta proposta.

O roadmap doméstico permanece em revisão. Sua qualidade factual e conversacional
não muda: precisão, follow-ups, isolamento, estado/recuperação, confirmação e
idempotência conservam suas metas. Esta decisão não é deploy/finance/receipt/
validated_parent, nem autorização de dados reais ou resposta financeira.

## 9. Revisão adversarial e saída finita

O candidato de código deve demonstrar estas classes, sem tratá-las como testes
já executados nesta proposta:

- Gerador omite alternativa/site/anchor/template ou deduplica valores iguais:
  confronto independente bloqueia; jamais singleton por ausência no gerador.
- Regra estrutural omitida/invertida, erro forjado/wrong-coordinate, compiler
  aceita membro selado como excluído: blocked antes de crédito/handles.
- IR/programa/helper lê outro campo ou ignora vínculo apesar de autoria correta:
  conformance/medição/trace/oracle falham; admissão positiva isolada não protege.
- Alternativa admitida passa com valores coincidentes: não usar equivalência
  sem relação necessária; manter referência/garantia faltante como blocked.
- Site misto com alternativa discriminante: exigir witness normal mesmo havendo
  outros sites singleton; negar escolha oportunista da disposição mais fácil.
- Snapshot/TCB/BUILD/certificado/parent adulterado e rehash, replay e clone:
  identidade/autoria/autoridade e freshness confrontadas; nenhum autoatestado.
- C/M/S compartilham erro ou oracles/expected vêm de actual: independente recusa;
  zeros, overflow, filtros, base temporal e pais mantêm controles herdados.
- Duplicar IDs ou somar prova estática com crédito semântico: partição e ledgers
  separados bloqueiam; história permanece inalterada.

Nesta etapa documental NÃO executar matriz ou ampla. Saída finita: um parecer
normativo sobre a proposta inteira, não sobre helpers. O auditor deve responder
se a composição realmente protege o campo usado e a resposta admitida, quais
hipóteses não estão cobertas e se algum critério foi enfraquecido indevidamente.

Veredito solicitado: APTO DOCUMENTAL PARA IMPLEMENTAR, NÃO APTO ou REVISÃO
INCOMPLETA. Não pedir GO de código/gate/produto. Evidência histórica só sustenta
a motivação:731sem alternativa,945recusas estruturais,201sem discriminante,
151referência pendente e4cofalhas/timeout NÃO são disposições v3 já provadas.
