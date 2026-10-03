# N02-G — proposta focal de fronteira para predicate_strategy

Data: 2026-10-03. Estado: PROPOSTA NÃO APLICADA; REVISÃO NORMATIVA PENDENTE.
Base documental imutável: `98e3d6a929541e3238362400504c884c34031f22`.
Este delta não altera runtime, corpus, contratos vigentes ou resultado de gate.

## 1. Decisão solicitada e limite

Ratificar, exclusivamente para `predicate_strategy/compatible_wrong_operator/eq`,
uma qualificação composta por dois canais independentes: sondagem da autoria
mutada e witness semântico por falha controlada na asserção P compilada.
O segundo canal não recompila a autoria mutada como se ela fosse admissível.

É uma alteração normativa explícita de §§10.0/10.2/10.5/10.6 para esta família,
não uma interpretação de que erro genérico já satisfaria a norma atual.
Nenhuma implementação está aprovada por esta proposta. O parecer requerido é
APTO DOCUMENTAL PARA IMPLEMENTAR ou NÃO APTO, com limites e findings.
Não pedir revisão integral de G11, dos 76 grafos ou dos 85 paths WIP.

## 2. Problema confrontado

O §10.0 exige isolamento e preservação das demais barreiras. §10.2 exige
estratégias erradas, inclusive operador type-compatible. No lote local,
`eq → not_eq` aplicado à autoria também remove âncoras que o compiler exige
ou altera predicates reutilizados por seleção e por guards de D.

Evidência local RELATADA, não execução independente do auditor: 974 expected,
946 generated, 262 executed, 66 matched, 908 UNSATISFIED, exit1; accounting
completo, matriz vermelha, fontes medidas inalteradas. As causas foram 464
claim_requirements_missing, 146 collection_requirements_fixture_anchor,
196 collateral_or_missing_rejection, 74 host_child_evaluation e 28
parent_execution_required. O witness contém projeções pequenas e os limites.

Na base imutável, claimRequirements exige `eq` para âncoras de descrição do
claim; collectionRequirements exige `eq` para closed_world/synthetic. Isso é
proteção de admissão, não bug a remover. No WIP observado, os 74 erros de host
atingem predicates de seleção em metrics com formula_plus_selection_guards.
Esse cross-check estático demonstra acoplamento; não prova a causa interna de
cada throw. Os 196 executados não têm crédito só porque P ficou falso: seleção
também rejeitou. As 28 coordenadas parent continuam pendentes.

O witness extrai §10 da base publicada, que ainda antecede os adendos locais
de singleton/source-state. Esta proposta não os revoga nem resolve a cadeia
externa de ratificação do documento de arquitetura; usa a disciplina G11
indicada pelo charter N02-G. O APTO de 98e3d6a cobre apenas sua proposta
source-state, não esta estratégia e não o runtime WIP.

## 3. Construção fechada proposta

### 3.1 Baseline e autoridades

1. Admitir o pacote ORIGINAL, schema, registries, grafo, claim e snapshots.
2. Executar o baseline real D/P, seleção e trace exatos, oracle positivo
   independente congelado. Em graph derivado, executar realmente os pais
   válidos; não converter parent pendente em N/A ou receipt fictício.
3. Selar antes dos negativos os conteúdos, fingerprints, claim, oracle,
   acessos, selections, D, perfil, roots e IR de asserções P.
4. Inventariar a partir dos predicates eq e registry admitidos; preservar
   exatamente IDs/preimages existentes. Não usar a causa observada para
   decidir se uma coordenada entra no inventário.

### 3.2 Canal A — autoria, sem crédito semântico

Produzir a mudança de autoria eq→not_eq no predicate coordenado, com operands
e demais campos intactos. Executar admissão real e registrar seu resultado.
Se houver recusa, exigir estágio/checker específico e ligação ao predicate
alvo por dependências derivadas da autoria original, não allowlist de mensagens
observadas nem aceitação de qualquer exception. Recusa imprevista fica pendente.
Se a autoria for admitida, registrar admitted; isso não é aprovação financeira.

Nenhum resultado desse canal incrementa executed/matched SEMÂNTICOS, cobre
predicate_atom ou autoriza emitir receipt. Tampouco sua recusa prova que P
executou. O canal testa a proteção de autoria e não declara ter reproduzido
um fluxo financeiro completo do grafo mutado.

### 3.3 Canal B — fault da estratégia na asserção P

Partir do IR compilado do baseline admitido. Construir um artefato negativo
de proof pela troca de eq para not_eq em UMA asserção final P identificada
pelo predicate_id. Tipo, operands e acesso permanecem iguais. A troca é
derivada do registry (mesma assinatura, semântica typed_unequal), não um
callback, texto arbitrário, return false ou override vindo do caller.

A emissão deve expor um mapa estruturado de sites de asserção. A substituição
é por identidade do site, com prova de igualdade integral fora dele; regex,
busca textual ambígua ou patch de toda ocorrência de eq são proibidos.
O mapa distingue a asserção final das cópias usadas em seleção e de guards D.
Se não conseguir localizar unicamente o site, a coordenada é UNSATISFIED.
Um verificador separado do emissor deriva da autoria/IR admitidos o ID, tipo,
operands e posição funcional esperados, e confere o artefato emitido e o mapa.
O mapa produzido pelo próprio compiler não é autoridade autossuficiente.

Executar D e P realmente no host/capsule capturados. D, seleção, cópias do
predicado usadas para selecionar, guards derivacionais e os outros sites P
continuam exatamente os do baseline. O negativo, portanto, modela uma falha
de emissão/execução da estratégia da ASSERÇÃO P; NÃO promete isolamento de
uma substituição global do predicate na autoria. Esse limite deve ser público.

Não remover leituras reais, fabricar trace, completar expected com actual ou
ocultar evento. Comparar todos os componentes normativos das duas fases,
seleção/evidence_set, fingerprints, identidade, resultado e roots observados.
O root esperado do artefato negativo é calculado/selado antes da execução;
nunca é o root positivo nem é copiado da resposta do child.

O controle financeiro de freeze/root aprovado permanece INALTERADO. Um root
negativo não pode ser apresentado como artefato revisado de produção. O harness
não recebe uma API de aceitação financeira, não insere negativo no ledger e
não cria validated_parent/receipt. Todo resultado é negative_witness_only.

Publicar separadamente negative_artifact_root_matched e
positive_release_root_matched: o primeiro exige a identidade negativa selada;
o segundo deve permanecer false para aquele artefato. Não afirmar que todas
as barreiras de aceitação do FATO POSITIVO passaram. A recusa de release por
root diferente é obrigatória e não pode dar crédito à coordenada semântica.
Ela é verificada em controle separado, não escondida ou contada como átomo
semanticamente isolado. Esta separação de contexto de teste versus release
também faz parte da ALTERAÇÃO NORMATIVA solicitada, não é uma regra já vigente.

### 3.4 Classificação e independência

Selar antes da execução uma referência tipada dos operands e da relação
mutada, reconstruída das fixtures/claim admitidos sem importar/executar o
compiler, lowerer, primitive scalar ou guest/evaluator sob teste e sem ler
actual. Para eq→not_eq, o baseline deve
ter operands iguais, a referência do alvo mutado deve ser false, e todos os
outros predicates devem continuar true. Sem referência discriminante: pendente.

Não aceitar apenas proof_satisfied=false. Exigir conjuntamente a referência
pré-computada, conformance exata do artefato (somente aquele site mudou), P
false observado pelo host e recorder externo, D/R/oracle preservados, coverage
exata, controles de restauração e de ausência de fault. O recorder já externo
continua fonte do trace; não criar canal de causas/violações autodeclaradas pelo
guest. A referência é expected independente, não prova isolada de execução.

Classificar todas as barreiras recusadas. Somente o átomo do alvo poderá
rejeitar; recusa de claim, identity, fingerprint, selection/evidence_set, trace,
evaluator/root ou erro de execução não recebe crédito. As medições distinguem
identidade do artefato negativo da identidade positiva; essa identidade
esperada NÃO relaxa freeze, root de release ou autorização financeira.

## 4. Contabilidade sem redução

Cada ID continua exigido e tem execução negativa própria; uma execução não
cobre duas coordenadas. expected deriva do corpus, não é fixado em 974.
Publicar dois ledgers por ID: authoring_probe e semantic_assertion_fault.
Cada ledger exige expected/generated/executed/matched completos, sem
compensação entre canais. No primeiro, executed significa executar admissão,
não D/P; no segundo, significa a execução real D/P do artefato negativo.

Uma coordenada só se qualifica com AMBOS os canais suficientes. Recusa precoce
não substitui o segundo; sucesso do segundo não oculta recusa de autoria não
explicada. A família só fecha com todos os IDs qualificados, baselines íntegros
e zero UNSATISFIED. Um lote contabilizado mas vermelho continua vermelho.

predicate_atom continua exigindo conteúdo mutado, fingerprint reparado e
estrutura preservada; eq→not_eq não lhe concede crédito. Invariantes singleton,
outras estratégias (remove/unknown/path/retarget), evaluator, edge e trace
continuam regidos por seus contratos; esta proposta não reclassifica seus IDs.
O adendo source-state ratificado em 98e3d6a permanece restrito à sua construção.

## 5. REDs e controles obrigatórios antes de aprovação do código

- Restore: reinstalar eq no MESMO site devolve P/coverage/oracle a PASS.
- No-fault: artefato original marcado falsamente como mutado não qualifica.
- Wrong coordinate/atom: descriptor de outro ID/átomo não recebe crédito.
- Secondary fault: alterar outro site, mesmo do mesmo átomo, falha fechado.
- Selector/D fault: tocar cópia de seleção ou guard D é recusado; não filtrar
  eventual cofalha da observação nem ajustar expected para aceitá-la.
- No generic-error credit: throw, timeout, schema/compiler RED, child failure,
  retorno falso constante ou execução abortada antes de P nunca qualificam.
- Root safety: medir root negativo, recusar uso com freeze positivo e provar
  que nenhum negativo gera receipt ou é usado como parent.
- Input safety: rejeitar callbacks, expected, counters, verdicts ou traces
  fornecidos pelo caller; fontes, mapa de sites e fault são reconstruídos.
- Observação: faltar leitura/aresta/seleção ou false trace payload não qualifica.
- Inventário: nenhum ID ausente/duplicado, nenhuma execução compartilhada;
  parent pendente não desaparece da cardinalidade.
- Independência: nenhum branch lê actual para montar expected/referência;
  memória selada e hashes permanecem idênticos até a execução terminar.

Testar propriedades geradas de nomes/IDs e localização do site, não apenas
allowlist dos exemplos S-01/S-04. Sem mapa e conformance verificáveis, o desenho
é NÃO APTO PARA IMPLEMENTAR; não improvisar injection por strings.

## 6. Candidato, revisão e próxima ação

Paths deste delta documental:

1. este plano;
2. `docs/audit-evidence/n02g-causal-authoring-profile/predicate-strategy-boundary-witness.json`;
3. `docs/audit-evidence/n02g-causal-authoring-profile/verify-predicate-strategy-boundary-witness.cjs`.

O helper verifica EXTRAÇÃO/consistência documental, não suficiência normativa
ou runtime. A auditoria deve julgar explicitamente se os dois canais e a
fronteira de asserção P são uma cobertura adequada da família proposta, e se
conformance + referência + captura externa + controles evitam falso verde.
Se a classe proposta não satisfizer esse propósito, exigir NÃO APTO; não
aprovar apenas porque o diagnóstico foi extraído corretamente.

Após APTO suficiente confrontado: aplicar adendo limitado, implementar mapa
e harness, executar REDs/focais/afetados, só então matriz necessária e ampla
única de candidato estável; publicar e auditar código independentemente.
O lote anterior permanece RED histórico, nunca promovido retroativamente.
Não declarar GO G11/N02-G/NEXT-02, NEXT-03, deploy, produção ou dados reais.
