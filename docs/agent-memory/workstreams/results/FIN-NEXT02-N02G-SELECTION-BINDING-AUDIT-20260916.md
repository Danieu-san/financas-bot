# FIN-NEXT02-N02G-SELECTION-BINDING-AUDIT-20260916

Status: **REVISÃO FOCAL CONCLUÍDA — AJUSTE NORMATIVO NECESSÁRIO**.

Escopo: compatibilidade focal de `source_coverage` / `S-16#1#1`. Este parecer não audita os 76 grafos, não aprova os comparadores WIP e não autoriza GO global N02-G, NEXT-03, produção, deploy, integrações ou dados reais.

## 1. Identidade e delta confirmados

- candidato: `856bc07272ac630c077492f1c1abb8ca1701e252`;
- parent único: `2ca7d32505728b985f7616dcaa17bec4acd11e18`;
- compare: 1 commit à frente, 0 atrás;
- delta exato, quatro paths adicionados:
  1. `docs/plans/workstreams/financasbot-next-02-n02g-selection-binding-review-v1.md`;
  2. `docs/audit-evidence/n02g-selection-binding/evidence-manifest.json`;
  3. `docs/audit-evidence/n02g-selection-binding/focal-record.json`;
  4. `docs/audit-evidence/n02g-selection-binding/verify-evidence.cjs`.

Os quatro arquivos foram lidos integralmente no candidato. O manifest fixa oito origens no SHA fonte `2ca7d32505728b985f7616dcaa17bec4acd11e18`; os oito `git_blob_sha1` declarados foram confrontados com os blobs reais e conferem. O verifier foi revisado e realmente recompõe as oito origens via `git show`, calcula SHA-256 e blob Git, exige unicidade global de `fact_key`, extrai o registro focal e compara manifest/focal por `assert.deepEqual`. Não executei a suíte local nem o verifier; portanto, resultados de execução continuam separados abaixo como evidência relatada.

Foi necessário consultar somente uma regra causal além do recorte: `docs/contracts/next/provenance-v2/graph-binding-contract-v1.md`, no mesmo SHA fonte, especialmente §§1, 3, 4 e 5.

## 2. Operação real observada hoje

A implementação atual **não executa a seleção derivacional** de `candidates -> selected` para `source_coverage`.

O registry/claim expõe dois inputs normativos: `context:claim_context` e `source:node`; o binding de `source` já aponta para `source_complete_june`. No `compileSnapshotAccess`, `openSet({fact_key, role_id:'source'})` falha porque o binding não é `node_set`, e `open(...)` só admite o alias já ligado ao role. O evaluator de `source_coverage` recebe esse handle já escolhido, valida identidade contra `claim.subject.ref_id`, valida mês/período e lê `coverage`; ele não chama `select` nem examina as outras três fontes.

A única seleção executável mostrada no recorte está em `openProof`: o host de proof abre o conjunto `candidates`, roda um predicado sobre cada membro e produz a vista `selected`. O teste focal demonstra quatro eventos `select_member`, todos sob roles `proof/...`. Isso é **proof**, não derivation, e não pode ser reclassificado como `derivation_trace`.

## 3. Inputs autorizados e cobertura por fase

### Derivation

Inputs normativos disponíveis ao evaluator:

- `context`, por handle instrumentado de `claim_context`;
- `source`, por handle instrumentado de um único `node`, `source_complete_june`.

O `trace_contract.derivation` exige:

- `required_nodes = [source_complete_june]`;
- reads somente de `source_complete_june` (`id`, `period`, `coverage`) mais os claim reads declarados;
- `required_selections = [{candidate_set:'candidates', selected_set:'selected'}]`;
- `selected_nodes = [source_complete_june]`.

### Proof

Proof admite os quatro candidatos, contém reads sobre eles e também exige `candidates -> selected`. O mecanismo existente de `openProof(...).select(...)` é compatível com essa cobertura de proof e produz observações sob namespace de proof.

## 4. Alternativa examinada: seleção observada pelo host durante resolução do binding

Essa alternativa foi examinada antes de julgar a autoria e **não fecha sob os contratos atuais**.

Há somente duas formas causais de o host chegar ao binding escolhido:

1. **Escolha estática a partir da autoria/binding já publicado.** Nesse caso não houve seleção observada por I. Emitir depois um evento de seleção equivaleria a copiar a seleção autorada, expressamente proibido pelo §4. A resolução documental/estática também não é execução: §1 separa resolução de documentos de execução, e §3 diz que projeção/resolução de operands sequence/set não é operador financeiro.

2. **Seleção real pelo host, examinando os quatro candidatos antes de entregar o handle `source` ao evaluator.** Nesse caso as observações que excluem três candidatos são causalmente parte da fase que resolveu a seleção. Pelo §4, toda leitura causal precisa estar coberta pela fase correta, e `required_nodes` é o inventário de nós examinados/consumidos na fase. Logo os três candidatos excluídos — e os campos usados para excluí-los — teriam de aparecer no contrato de derivation. O contrato focal não os admite.

Não existe terceira via válida em que o host leia/examine quatro candidatos, esconda essas leituras fora da fase, e ainda declare que `required_selections` foi observado em derivation. Também não é válido executar a seleção em proof e reutilizar `proof_trace` como `derivation_trace`.

## 5. Regra ratificada decisiva

A incompatibilidade decorre diretamente do §4 do `graph-binding-contract-v1.md`:

- cada fase declara nós, campos, operações estruturais e seleção esperados;
- a execução futura observa cada fase pelo recorder;
- toda leitura causal deve estar coberta pela fase correta;
- `required_nodes` é o inventário de nós examinados/consumidos na fase;
- `required_selections` coincide exatamente com os pares de seleção da fase;
- `selected_nodes` é observado pelo recorder por fase;
- é proibido copiar a seleção autorada ou tratar leitura como seleção.

Essas regras impedem interpretar a seleção de quatro candidatos como uma simples etapa estática invisível e, ao mesmo tempo, satisfazer `required_selections` de derivation.

## 6. Findings por severidade

### HIGH — N02G-SB-001 — contrato derivacional exige seleção que sua própria cobertura não pode observar

`S-16#1#1` exige em derivation `candidates -> selected`, mas autoriza como `required_nodes/required_reads` apenas a fonte escolhida. Uma seleção real sobre quatro fontes exige examinar causalmente candidatos excluídos; uma escolha que não os examina é apenas reutilização da autoria/binding e não seleção observada. Portanto, **não há implementação compatível com os contratos atuais para satisfazer simultaneamente essas duas exigências**.

Classificação: **ajuste normativo necessário**, não mera lacuna de implementação.

Cláusula precisa a decidir: `graph.trace_contract.derivation.required_selections` / `selected_nodes` de `S-16#1#1`, em conjunto com a regra de §4 que define `required_nodes` como todos os nós examinados/consumidos na fase e exige cobertura de toda leitura causal.

A decisão normativa mínima é uma destas, sem preferência deste parecer:

- **seleção somente em proof para este fluxo**: derivation passa a consumir apenas o `source:node` já ligado; então a operação `candidates -> selected` não pode permanecer como obrigação observada de derivation e `selected_nodes` de derivation deve refletir ausência de seleção nessa fase; ou
- **seleção realmente derivacional**: o contrato de derivation precisa admitir os quatro candidatos e os reads/estruturas causalmente usados para a seleção; o host pode então selecionar sob recorder de derivation e entregar o único handle selecionado ao role `source:node` do evaluator.

Escolher entre essas semânticas é decisão de autoria/contrato. Este parecer não a implementa.

### INFO — N02G-SB-002 — implementação e teste atuais reproduzem corretamente a fronteira, mas não a resolvem

O compiler atual rejeita `openSet` para o role `source:node`, rejeita aliases não ligados e não emite seleção em derivation; o evaluator apenas lê a fonte ligada. `N02G:SELECTION-BINDING-001` reproduz exatamente essa fronteira e demonstra que proof consegue executar a seleção separadamente. Isso é evidência diagnóstica útil, mas não prova consistência arquitetural nem transforma proof em derivation.

## 7. Menor correção e teste causal depois da decisão normativa

Não há correção puramente de implementação antes da decisão acima.

Se a decisão for **proof-only**, a menor correção normativa é remover a obrigação de seleção da fase derivation para este grafo e fazer `selected_nodes` dessa fase corresponder às operações realmente observadas. Teste causal mínimo: executar derivation e exigir ausência total de eventos `select_*`; injetar um evento de seleção em derivation deve falhar por trace extra; proof continua exigindo a seleção sobre os quatro candidatos.

Se a decisão for **seleção derivacional**, a menor correção normativa é incluir na cobertura de derivation todos os candidatos efetivamente examinados e os campos usados pelo predicado, preservando `required_selections`. Depois disso, a menor implementação é um seletor do host instrumentado na fase derivation que observa os candidatos via I e entrega apenas o handle selecionado ao evaluator. Teste causal mínimo: mutar a identidade de cada candidato, um por vez, e provar que a seleção/resultado ou a validação muda/falha por causa dessa observação; o trace derivacional deve registrar exatamente os reads/select events dos quatro candidatos, e um `proof_trace` idêntico em conteúdo mas marcado como proof não pode satisfazer derivation.

## 8. Resultados relatados, separados da revisão própria

Relatado pelo executor para N02-G local: `262/262` testes PASS, zero `FAIL/SKIP/TODO`; o teste `N02G:SELECTION-BINDING-001` PASS e reproduz a fronteira. Esses resultados **não foram reexecutados por este auditor** e não alteram o finding causal acima.

Os comparadores do parent permanecem WIP e não estão submetidos a GO nesta pergunta.

## 9. Conclusão inequívoca

**AJUSTE NORMATIVO NECESSÁRIO.**

A alternativa de seleção observada pelo host durante resolução do binding foi considerada e não produz uma implementação compatível com o contrato focal atual: se a seleção é real, faltam os candidatos/leitura causal na cobertura de derivation; se não é real, ela apenas reutiliza a seleção/binding autorado e não satisfaz a obrigação de seleção observada. Não há base para GO focal por simples implementação.

Este parecer não autoriza GO global N02-G, NEXT-03, produção, deploy, integrações ou dados reais.