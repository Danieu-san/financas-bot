# FIN-NEXT02-N02G-CHARTER-AUDIT-20260911

## Escopo e identidade

Revisão independente focal de consistência e escopo do charter N02-G; não é reauditoria dos 76 grafos N02-F, não é auditoria de código inexistente e não é GO global NEXT-02.

Candidate lido: `8c1f1302803d625ddfc48f47d60d8c8416d5dee7`.
Parent único confirmado: `aea4ac31e358ed8d8907e78f6002c8bb80233bc8`.
O compare base..candidate está `ahead_by=1` e altera exatamente:
- `docs/plans/workstreams/financasbot-next-02-n02g-v1.md`
- `docs/agent-memory/workstreams/financasbot-next-02-n02g.md`
- `docs/agent-memory/workstreams/index.md`

Os três arquivos foram lidos integralmente no SHA.

## Autoridades confrontadas

- `docs/plans/workstreams/financasbot-cp02-closure-inventory-v1.md`: matriz G07/G08/G11/G14 e ordem vigente após a autoria/revisão integral dos 76 grafos.
- `docs/plans/workstreams/financasbot-next-00-provenance-graph-design-v1.md`: separação de autoridades; trace externo; registry único; roots/TCB/freeze; mutações derivadas; migração integral sem rollout por exceção.
- `docs/contracts/next/provenance-v2/type-and-identity-contract-v2.md`: §§1–4, identidade estática/por execução, projeção pública efêmera, authoring versus execution e roots reais.
- `docs/plans/workstreams/financasbot-next-crosscutting-review-checkpoints-v1.md`: CP-02, posição de CP-03 e preservação de CP-04..CP-07.

## Findings

### CRITICAL
Nenhum.

### HIGH
Nenhum.

### MEDIUM
Nenhum.

### LOW
Nenhum finding causal. O inventário de módulos em `src/next/provenance/` é explicitamente “inicial proposto”, não cardinalidade normativa nem critério de PASS. A decomposição não impõe, por si, complexidade sem obrigação: corresponde às separações exigidas entre cálculo, resolução/roots, observação externa, recorder, binding/identidade, aceitação e mutações. Alterar essa decomposição durante a implementação continua admissível desde que as fronteiras e roots permaneçam demonstráveis.

## Respostas focais

1. **Cobertura e escopo:** sim. O charter fecha a fatia sobre G07/G08/G11/G14 de forma integral, com 76/76 grafos, 39 entradas executáveis, mutações derivadas e G14, e declara expressamente que compiler verde, PASS intermediário ou domínio isolado não libera rollout. Também afirma que PASS/GO de N02-G não substitui G05/G06/G09/G10/G13 nem o gate global NEXT-02.

2. **Reuso e autoridades:** sim. `canonicalValue.js` é limitado aos preimages compatíveis; hashes documentais usam bytes exatos. O cálculo histórico pode ser extraído/adaptado do validador, mas o oracle fica somente no result validator depois de R. O proof engine não conhece métricas/fact_keys; o registry de execução permanece autoridade única de contract hash/artifact root/roles; recorder/proxy/loader medem e observam, não redefinem identidade.

3. **Caminho de gasto:** sim. A ordem exige prova e binding R/claim/prova antes de `ClaimEnvelope` e antes do CAS/resposta. Identidade ausente, prova ausente, replay entre requests ou reprovação bloqueiam entrega. Checks herdados podem permanecer apenas como defesa adicional; não existe fallback autorizado para claim reduzido.

4. **Detalhes ainda não escolhidos:** sim. Isolamento concreto e tabela de compatibilidade campos/lentes são pré-condições explícitas a registrar e demonstrar antes de executar/integrar. O texto não alega que `node:vm`, worker, processo, hash, proxy atual ou mapeamento atual já resolvam essas obrigações; se a solução não satisfizer o contrato, manda bloquear em vez de reduzir a alegação.

5. **Sequência e gate:** coerentes. N02-F satisfaz a precedência de autoria/revisão dos grafos antes do compiler. A sequência IR/admissibilidade → fronteira/roots → operadores/evaluators → DAG/G14 → mutações → integração de gasto preserva a migração integral e culmina em gate sem skips/PASS parcial, roots reais, witnesses e reauditoria do candidato executável. CP-03 permanece somente após GO global NEXT-02; CP-04..CP-07 continuam preservados. A suíte funcional não precisava ser reexecutada neste commit puramente documental; a evidência local declarada (`agent-workflow` e `diff --check`) é proporcional ao objeto.

## Veredito

**APROVÁVEL**, limitado ao charter N02-G.

Este parecer não autoriza produção, deploy, dados reais, NEXT-03 nem GO global NEXT-02. Também não constitui, por si, nova autorização de implementação; qualquer continuidade decorre da autorização prévia de Daniel e dos gates reais registrados no repositório. O candidato executável futuro exige suas próprias provas causais, freeze, testes e reauditoria independente.
