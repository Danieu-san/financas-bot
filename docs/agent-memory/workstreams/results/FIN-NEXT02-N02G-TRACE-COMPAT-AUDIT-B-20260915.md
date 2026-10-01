# FIN-NEXT02-N02G-TRACE-COMPAT-AUDIT-B-20260915

## Veredito focal

**NÃO CONFORME — 1 finding HIGH bloqueante para o fechamento da compatibilidade de trace N02-G.**

Este parecer é estritamente focal. Ele **não** é GO global do N02-G, não autoriza NEXT-03, implementação adicional fora da correção focal, deploy, produção ou uso de dados reais.

Candidato auditado: `9ffaa60669904c2a7d5af547a529e60f09c5e36b`  
Parent único já confirmado na Parte A: `8a4e0ead9c59e5999fa69b4211b5a9e5d14b34a3`  
Evidence commit: `77d894b705f58c1e76d7333c5330ae4a1dc714b0`  
Parent único do evidence commit: `9ffaa60669904c2a7d5af547a529e60f09c5e36b`

## Escopo e reaproveitamento da Parte A

A Parte A já havia confirmado candidato/parent e lido integralmente:
- `docs/plans/workstreams/financasbot-next-02-n02g-trace-compatibility-v1.md`
- `scripts/agent/inspectNextProvenanceTraceCompatibility.mjs`

Também já havia confrontado os trechos causais de `TRACE-COMPAT-001`, `instrumentedAccess.traverse`, `graphCompiler open` e o contrato §4. Essas verificações foram reaproveitadas e **não** foram reiniciadas.

Nesta Parte B foram lidos integralmente somente:
- `docs/audit-evidence/n02g-trace-compat-9ffaa/evidence-manifest.json`
- `docs/audit-evidence/n02g-trace-compat-9ffaa/focal-record.json`
- `docs/audit-evidence/n02g-trace-compat-9ffaa/verify-evidence.cjs`

Não foram executados os 241 testes e não foram reauditados os 76 grafos.

## Integridade do pacote compacto

O evidence commit `77d894b705f58c1e76d7333c5330ae4a1dc714b0` tem parent único `9ffaa60669904c2a7d5af547a529e60f09c5e36b` e adiciona somente os três arquivos do pacote compacto.

O manifesto fixa o source:
- path: `docs/contracts/next/provenance-v2/graphs-v2.json`
- Git blob SHA-1: `5abcb5d528065b00bd575298176947ec605600ba`
- SHA-256: `0fb853ce45ee06f6abade90176a332caf20d3f592fa932a1300a1e519bc777f7`
- locator: `fact_key=S-01#1#1`, `edge_id=e0023`

O blob do source observado diretamente no candidato é `5abcb5d528065b00bd575298176947ec605600ba`.

O verifier:
1. lê os bytes do source integral indicado pelo manifesto;
2. calcula SHA-256 e exige igualdade com `0fb853ce45ee06f6abade90176a332caf20d3f592fa932a1300a1e519bc777f7`;
3. exige unicidade do `fact_key=S-01#1#1`;
4. exige unicidade de `edge_id=e0023` no grafo;
5. deriva do source o edge focal, o estado de `derivation.required_edges`, `derivation.required_nodes`, os `derivation.required_reads` de `person_b` e os `proof.required_reads` de `person_b`;
6. compara o objeto derivado com `focal-record.json` por `assert.deepEqual`, isto é, igualdade estrutural exata do recorte focal.

## Decisões focais

### 1. Obrigatoriedade de `e0023` versus `person_b` e reads

**Sim.** Para `S-01#1#1`, `e0023` é obrigatório em `trace_contract.derivation.required_edges`.

Ao mesmo tempo:
- `person_b` **não** está em `derivation.required_nodes`;
- não há `derivation.required_reads` para `person_b`;
- `person_b.id` e `person_b.family_id` aparecem em `proof.required_reads`, não em `derivation.required_reads`.

Portanto, a obrigação de atravessar/observar `e0023` em derivation **não implica**, por si só, obrigação de leitura de `person_b` em derivation.

### 2. Contrato inconsistente ou implementação incorreta

**O contrato não é inconsistente.**

A leitura consolidada da Parte A do §4 é que `required_edges` e `required_reads` são dimensões exatas e independentes. O registro focal confirma que essa independência é usada de fato pelo grafo: há edge derivacional obrigatório sem target node/read derivacional correspondente.

O problema está na implementação atual de `instrumentedAccess.traverse`: ela reentra em operações instrumentadas de leitura para realizar o traversal e, com isso, materializa reads adicionais — inclusive leitura de identidade do alvo — que o contrato não declarou como causalmente necessárias para derivation.

Esses reads, uma vez realmente executados, **devem** continuar aparecendo no trace observado. O erro não é o trace registrar uma leitura real; o erro é `traverse` realizar leituras incidentais que a semântica contratual de edge-only não exige.

Logo, `TRACE-COMPAT-001` evidencia uma incompatibilidade de implementação, não uma lacuna normativa que autorize completar `expected` a partir de `actual`.

### 3. Menor correção coerente

A menor correção coerente é **separar o registro/uso do edge de qualquer leitura de nó que não seja causalmente solicitada**:

- `traverse` deve registrar a travessia de `e0023` como observação de edge;
- a resolução do target deve usar o vínculo já compilado/estrutural disponível ao traversal, sem reentrar em `get` apenas para descobrir/confirmar identidade do alvo;
- `person_b.id`, `person_b.family_id` ou qualquer outro campo só devem entrar em reads observados quando o evaluator realmente os ler por necessidade causal própria.

Isto remove a leitura real desnecessária; **não** a oculta. Se alguma lógica futura realmente precisar ler `person_b.id`, essa leitura deve permanecer no `actual` e a obrigação correspondente deve vir do contrato/graph authoring de forma independente — nunca por preenchimento automático de `expected` com base no trace observado.

## Cadeia causal

1. O §4 mantém `required_edges` e `required_reads` independentes e exatos.
2. `S-01#1#1` declara `e0023` em `derivation.required_edges`, mas não declara `person_b` nem reads de `person_b` em derivation.
3. O mesmo registro declara reads de `person_b.id` e `person_b.family_id` apenas em proof, demonstrando que o modelo sabe distinguir obrigação de edge, leitura derivacional e leitura de proof.
4. A implementação atual de `traverse` realiza leituras instrumentadas adicionais para efetuar/resolver a travessia.
5. Essas leituras reais entram corretamente no `actual`, mas excedem o `expected` derivacional autorado.
6. Portanto, a falha de compatibilidade é causada pela estratégia de implementação de traversal, e não por inconsistência do contrato.
7. Copiar o `actual` para `expected` destruiria a autoridade independente do contrato; filtrar os reads do trace esconderia leituras reais. A correção correta é deixar de executar as leituras incidentais.

## Findings por severidade

### HIGH — `traverse` converte obrigação de edge em reads derivacionais adicionais

**Impacto:** um grafo contratualmente válido com edge derivacional obrigatório e target sem reads derivacionais pode ser rejeitado pela compatibilidade de trace por causa de reads criados pela própria instrumentação/implementação. Isso quebra a separação normativa entre `required_edges` e `required_reads` e torna o mecanismo de compatibilidade dependente de detalhe incidental de execução.

**Correção requerida:** refatorar `traverse` para observar/resolver o edge sem leituras instrumentadas incidentais do target; manter qualquer leitura causal real visível no trace e exigir contrato explícito quando tal leitura fizer parte da derivation.

**Bloqueio:** bloqueia o fechamento focal de compatibilidade de trace N02-G até correção e revalidação do cenário causal correspondente.

CRITICAL: 0  
HIGH: 1  
MEDIUM: 0  
LOW: 0

## Limites

Este parecer não reaudita toda a implementação N02-G, não reabre a auditoria documental N02-F, não reaudita os 76 grafos e não executa a suíte de 241 testes. O finding é limitado à compatibilidade causal entre contrato focal e implementação de traversal/trace.
