# NEXT-00 — Fechamento focal da fronteira de execução do grafo

Atualizado em: 2026-09-01
Objetos reavaliados:

- `2a115dc3274e14583fff309274e3a98cbeebe49c`;
- `69062563f66f71127387d4a9d778e19da593ce7b`;
- `62b17b21a7a3179e8bce35d86b99119eaa093c9d`;
- `6214f9035cc88465a013a2247b85adbb41afe830`;
- `e1b3238f21a401acf8794cdbb68893e32726ed8f`.

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

`derivation_trace` e `proof_trace` são views produzidas exclusivamente pelo
recorder a partir do mesmo log interno de observação; o proxy apenas instrumenta
os acessos que o recorder observa. Metric evaluator, graph evaluator e operators
não recebem objetos crus e não autodeclaram reads. Operações estruturais também
são registradas pelo recorder.

O freeze manifest fixa também `proof_engine_artifact_root` e
`validation_tcb_root`, cobrindo todo código do repositório que avalia, carrega,
isola ou observa a execução. A fronteira externa restante é o runtime/CI
declarado, não uma cadeia indefinida de auto-hashes.

### Sem escape de grupos atômicos

Grupos atômicos foram removidos. Todo átomo exige witness ortogonal; se isso
for impossível, o gate falha com `UNSATISFIED_MUTATION_WITNESS`.

### Autoridade única

O metric evaluator registry é a única autoridade de contract hash, artifact
root e papéis. Claims guardam referências/bindings; loader mede e recorder
materializa as medições nos traces; freeze manifest referencia o hash do registry.

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

## Harmonização final após a reauditoria de `62b17b2...`

A reauditoria confirmou que o desenho fechou closure, TCB, runtime/CI, reads
estruturais, freeze e witnesses ortogonais, mas encontrou três formulações
residuais incompatíveis com as autoridades já definidas. O mesmo desenho foi
harmonizado localmente, sem novo subsistema:

- metric evaluator passou a ter autoridade somente sobre cálculo
  content-addressed e resultado funcional tipado; trace e metadado causal
  pertencem exclusivamente ao recorder externo;
- evaluator contract deixou de publicar roles normativos; assinatura funcional,
  unidade e propriedades algébricas permanecem no contrato, enquanto os roles
  pertencem exclusivamente ao metric evaluator registry;
- loader mede hashes/roots e os entrega internamente ao recorder; somente o
  recorder materializa essas medições no trace.

O veredito de `62b17b21a7a3179e8bce35d86b99119eaa093c9d` foi
`APROVÁVEL APÓS AJUSTES`. Os dois HIGH e o MEDIUM foram confirmados como
contradições textuais locais e corrigidos sem alterar as partes já fechadas.

## Selagem da autoria causal após `6214f90...`

A reauditoria de `6214f9035cc88465a013a2247b85adbb41afe830` fechou os dois
HIGH anteriores e encontrou um único MEDIUM residual de autoria causal por
terminologia inconsistente. A correção não altera a arquitetura:

- `writer de trace` passou a ser definido pelo efeito de determinar qualquer
  conteúdo materializado, independentemente do verbo usado;
- recorder é o único proprietário e writer; proxy somente instrumenta e loader
  somente mede;
- metric evaluator possui uma lista exaustiva de outputs funcionais permitidos;
- definir role e referenciar role foram formalmente separados, mantendo o
  registry como única autoridade normativa.

Closure, TCB, runtime/CI, freeze, structural reads, prototype-free e witness
ortogonal permaneceram inalterados.

## Separação de resultado e trace após `e1b3238...`

A reauditoria de `e1b3238f21a401acf8794cdbb68893e32726ed8f` encontrou zero
CRITICAL/HIGH e um MEDIUM: o exemplo ainda colocava `result` dentro do trace,
contrariando a definição absoluta de writer. A correção foi focal:

- `R` passou a ser o resultado funcional independente e é comparado ao oracle;
- `I` transporta eventos instrumentados, preservando `E` exclusivamente para
  arestas do grafo;
- `M` transporta medições do loader e `L` é o estado exclusivo do recorder;
- `T` contém somente projeções de `L`; não recebe resultado ou intermediário de
  `R`;
- trace validator e result validator permanecem separados e ambos são exigidos.

Não houve varredura classificatória manual de toda a prosa histórica. A
proteção foi colocada nos tipos, namespaces e condições de NO-GO normativas,
evitando criar uma nova matriz autorreferencial.

## Fronteira

O desenho continua candidato aguardando reauditoria focal. Não houve alteração
de compiler, evaluator, operator, registry executável, corpus, fixture ou runtime.
Implementação segue bloqueada até reauditoria focal do novo hash imutável.

NEXT-01, deploy, produção, writers, integrações e dados reais permanecem fora
de escopo.
