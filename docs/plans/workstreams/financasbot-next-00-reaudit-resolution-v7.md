# NEXT-00 — Fechamento focal da fronteira de execução do grafo

Atualizado em: 2026-08-31
Objetos reavaliados:

- `2a115dc3274e14583fff309274e3a98cbeebe49c`;
- `69062563f66f71127387d4a9d778e19da593ce7b`.

Vereditos externos: `APROVÁVEL APÓS AJUSTES`

## Avaliação

Os dois HIGH, o MEDIUM e o LOW foram confirmados. Eles não invalidam o grafo e
não justificam novo subsistema. São definições ausentes na mesma fronteira de
execução.

## Correções delimitadas

### Closure executável completo

`evaluator_artifact_hash` passa a ser Merkle root do bundle/closure hermético
pós-transformação realmente executado, incluindo imports transitivos, helpers,
tabelas, código gerado e configuração comportamental. Dynamic import e
resolução fora do closure são proibidos.

### Observação externa única

`derivation_trace` e `proof_trace` passam a ser views do mesmo log capturado por
proxy/recorder externo. Metric evaluator, graph evaluator e operators não
recebem objetos crus e não autodeclaram reads. Operações estruturais também são
registradas.

O freeze manifest fixa também `proof_engine_artifact_root` e
`validation_tcb_root`, cobrindo todo código do repositório que avalia, carrega,
isola ou observa a execução. A fronteira externa restante é o runtime/CI
declarado, não uma cadeia indefinida de auto-hashes.

### Sem escape de grupos atômicos

Grupos atômicos foram removidos. Todo átomo exige witness ortogonal; se isso
for impossível, o gate falha com `UNSATISFIED_MUTATION_WITNESS`.

### Autoridade única

O metric evaluator registry é a única autoridade de contract hash, artifact
root e papéis. Claims guardam referências/bindings; traces carregam medições do
loader; freeze manifest referencia o hash do registry.

## Endurecimento após a reauditoria focal

- recorder externo é a única autoridade causal de `derivation_trace` e
  `proof_trace`;
- toda semântica residual de trace emitido/fornecido por evaluator foi removida;
- reads estruturais completos são observados e nós são prototype-free;
- bootstrap controlado pelo projeto pertence ao `validation_tcb_root`;
- runtime/CI ficou restrito à fronteira mínima declarada e não pode injetar
  lógica do projeto;
- metric evaluator registry permaneceu autoridade única; freeze manifest só
  referencia seu hash e traces contêm medições;
- closure inclui todo byte comportamental pós-transformação, com helpers puros
  e sem I/O.

## Fronteira

O desenho continua não normativo. Não houve alteração de compiler, evaluator,
operator, registry executável, corpus, fixture ou runtime. Implementação segue
bloqueada até reauditoria focal do novo hash imutável.

NEXT-01, deploy, produção, writers, integrações e dados reais permanecem fora
de escopo.
