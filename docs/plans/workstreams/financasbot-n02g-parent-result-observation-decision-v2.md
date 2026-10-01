# N02-G — observação completa de resultados parentais

Estado: **correção documental candidata; NÃO APLICADA**. Sem aprovação de
código, host, grafo ou GO global. Base do corpus/proposta:
`6baf88dc8b33326f8e05245e38f9682cc722c0be`, já aprovado focalmente para
contas/parcelas. Esta proposta não reabre essa auditoria.

## Problema e autoridade

O parecer de `207ca56b87381d69a922224332fcdda3a629d822` rejeitou medir
somente o escalar parental em proof. O contrato de binding §4 exige os campos
materiais completos para fingerprint; o §5 exige recibo privado same-execution
antes de disponibilizar `derived_claim`. O recibo não substitui a observação
desses campos na nova invocação. A proposta v1 permanece registro histórico;
esta v2 resolve seus ajustes antes de aplicação.

O handle de `result` é um record. `get('result')` observa o contêiner;
`get('value')` observa sua folha. Ambos são reads causais, mas a sequência do
get que retorna record deve ter somente um owner: `access_metadata`, que
valida shape, binding e ancestralidade. `read_edges` não pode cobrir essa
mesma sequência. A comparação de conjuntos de reads é necessária e separada
da cobertura dos eventos.

Essa consequência alcança os paths já autorados de claim_context: alcançar
`subject.kind`, por exemplo, precisa observar primeiro `get('subject')`.
Os ancestrais são deduzidos do schema do claim e dos paths declarados antes
da execução; não vêm de T, R, oracle ou de um trace diagnóstico.

## Proposta fechada

1. Nos três grafos derivados `M-01#1#3`, `M-01#1#4`, `M-14#1#3`, acrescentar
   `result.value` na derivation de cada um dos seis aliases parentais.
   Preservar as leituras existentes de `fact_key`, `evaluator_version`,
   `result_hash` e `result`. São **seis** reads adicionais.
2. Para cada alias parental em proof, observar os seis campos materiais do
   descriptor `derived_claim`: `id`, `fact_key`, `evaluator_version`,
   `result_hash`, `result` e `parents`. `result` tem lowering fechado em
   `unit/kind/value`. Preservar os quatro reads existentes e acrescentar
   `id`, as três folhas de `result` e `parents`: **30** reads adicionais.
3. Em proof, acrescentar `keys` da raiz, `has` dos seis campos, `keys` de
   `result` e cardinalidade de `parents`: **54** obrigações estruturais.
   Isso mede o payload material completo, sem copiar essa closure para
   derivation. Identity/fingerprint/parent binding continuam sendo obrigações
   distintas e necessárias; apenas declarar esses reads não aceita um pai.
4. O perfil é **parents vazio somente**. Os seis aliases apontam exatamente
   para os quatro grafos primários `M-01#1#1`, `M-01#1#2`, `M-14#1#1`,
   `M-14#1#2`; nenhum possui validated_parent nem role parent_claim. O host
   deve autenticar o recibo e exigir `parents=[]`; proof deve observar seu
   contêiner e cardinalidade zero. Roster não vazio falha antes de expor o
   handle. Não há lowering genérico de índices de role_ref_list nesta fatia.
5. Nos 76 grafos, fechar exclusivamente os ancestrais de record dos paths
   já declarados em required_claim_reads. Resolver `$ref` e o ramo concreto
   de subject/period pelo schema admitido, rejeitando caminho inexistente,
   ambiguidade, travessia escalar/array e duplicata. A proposta acrescenta
   **154** reads em derivation e **230** em proof. Essa regra não cria
   novas folhas, não executa o claim e não infere dependência do resultado.

Nenhum campo de R/intermediário passa para L/T. O resultado previamente aceito
torna-se input material de outra invocação somente após validação pelo host.
Não aceitar objeto parental fornecido pelo caller, receipt self-sealed, hash
calculado isoladamente ou fingerprint proveniente do trace.

## Evidência reproduzível

Em `docs/audit-evidence/n02g-parent-observation/`:

- `prepare-parent-observation.cjs` lê cinco fontes somente do Git em
  `6baf88d...`, mantém o corpus-base completo em memória e projeta a proposta.
  Não modifica `graphs-v2.json`, runtime, schemas ou registries.
- `parent-observation-proposal.json` enumera os acréscimos por grafo/fase e
  fixa hashes SHA-256 dos bytes Git exatos das fontes. Seu hash do corpus
  proposto refere-se à serialização JSON do objeto reconstruído, não aos
  bytes de um futuro arquivo publicado.
- `tests/next/provenance/parentObservationAuthoring.cases.js` confronta
  inventário/duplicatas, roster primário, gramática, descriptor e reconstrução.

Execução local com Node 22.17.0: **4 PASS / 0 FAIL / 0 SKIP / 0 TODO**.
`--write-new` e `--check` confirmaram 76 grafos, 6/30/54 obrigações parentais
e 154/230 ancestrais de claim. São resultados do executor, não auditoria
independente. Nenhuma suíte ampla foi repetida neste delta documental.
A ampla histórica de contas/parcelas continua RED (2413 PASS/3 FAIL/10 SKIP).

O corpus reconstruído deve diferir integralmente da base somente nos arrays
explicitamente listados. Nodes, sets, selections, predicates, edges, windows,
proofs fora dessas adições e todas as demais propriedades são preservados.
O helper rejeita inventário/parent profile divergente; sua igualdade profunda
com a reconstrução impede omissões silenciosas no delta. O teste reverte
somente as adições permitidas e confronta novamente o corpus integral.

## Saída da revisão e implementação posterior

A revisão independente focal deve julgar suficiência da closure material,
perfil parents vazio, owner único dos eventos de record e legitimidade dos
ancestrais. **APTO DOCUMENTAL PARA IMPLEMENTAR** deve ser explícito antes de
aplicar este delta de autoria. Essa revisão resolve os ajustes normativos
pendentes, sem repetir a auditoria completa de 76 grafos ou contas/parcelas.

Após parecer suficiente: aplicar exatamente a transformação aprovada;
reconciliar os fontes locais preservados; executar REDs de fingerprint/shape,
roster não vazio, recibo forjado/cruzado, mesma quantia com pai/versão trocados
e owner duplicado de sequência. Depois integrar host/registry/proof sem
`acceptPrimary` público ao guest. O hash esperado do registry deve vir de
freeze revisado; um candidato de build não concede autoridade normativa.
A implementação terá auditoria única do recorte estável, com as invariantes
e todos os limites de isolamento/freeze visíveis ao auditor.

Preservar o preimage fechado de result_hash, ordem de roles, R/I/M/L/T,
compiler/registry como autoridades próprias e todos os gates de saída do
charter. Sem NEXT-03, deploy, produção, dados reais ou GO global N02-G/NEXT-02.
