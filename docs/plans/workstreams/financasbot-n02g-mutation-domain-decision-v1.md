# N02-G — decisão pendente sobre domínios singleton no G11

## Status e escopo

**PROPOSTA PARA REVISÃO NORMATIVA; NÃO APLICADA.** Base imutável:
`ecc57203bbd5b50087f2cd7fa9af8c96ee03ae1d`.
Este recorte contém somente este documento e dois artefatos de evidência.
Nenhum runtime, schema, registry, grafo, dependência, fórmula, transporte,
produção, deploy ou dado real é alterado. O código N02-G parcial permanece
em sua worktree própria, sem novo candidato de código nem GO global.

## Impedimento reproduzível

O desenho ratificado §10.1 exige alterar **cada campo material** por outro valor
válido do mesmo tipo. §10.6 exige witness schema-valid e discriminante para
cada mutação enumerada, sem skip/redução por ausência de alternativa.

O registry e seu schema projetado impõem domínios singleton a sete campos:
budget.evidence_state; merchant_rule.evidence_state; fixture.currency;
evaluation_policy.calendar/timezone/ranking_key/ranking_tie_break.
Para `D = {v}`, não existe `v' ∈ D` com `v' ≠ v`. Sintetizar outro snapshot,
alterar ID/versão/fingerprint ou escolher outro registro não cria outro valor
nesse domínio. Trocar por valor externo viola o schema; usar o mesmo valor não
é discriminante. Portanto não é uma limitação de um gerador particular.

O inspector lê os quatro blobs **inteiros** no Git da base, não a árvore local;
confronta todos os enums do registry com a projeção do schema, enumera todos os
76 grafos/nós e publica os targets singleton agregados e seu digest. Os counts
vêm do corpus, não de uma lista de exemplos. O relatório não é um GO e não
atribui execução independente ao auditor. `--check` reconstrói e compara o
relatório integralmente; `--self-test` verifica divergência schema/registry,
expansão coerente do domínio, duplicata de fact_key, kind desconhecido e enum
duplicado. A expansão usada no self-test é somente cópia em memória e **não**
uma proposta para ampliar o domínio financeiro.

## Proposta estritamente limitada a discutir

Não ampliar os domínios financeiros para satisfazer testes. Distinguir duas
obrigações no G11, com cardinalidades derivadas e contabilização separada:

1. **Mutação semântica de conteúdo:** campo com alternativa válida; baseline e
   mutant schema-valid, execução causal, expected_violations exato e witnesses
   ortogonais. Permanecem obrigatórios os doze atoms, estratégias de nós,
   predicados, arestas, trace e evaluator. Ausência de witness nesta categoria
   continua `UNSATISFIED_MUTATION_WITNESS`; não aceitar falta de alternativa
   meramente contingente do corpus quando o schema permite síntese.
2. **Invariante de domínio singleton:** provar que registry e schema impõem
   exatamente o mesmo singleton, que o valor original é admitido, e que um
   valor distinto é recusado pela admissão do schema. Registrar esse negativo
   como **schema-invalid admission test**, nunca como mutant semântico
   schema-valid, execução D/P, isolamento de um atom ou receipt financeiro.
   Seu inventário expected/generated/executed/matched deve ser integral e
   separado; não sumir com a coordenada nem usar um skip.

Nenhuma invariante singleton substitui o witness ortogonal de um dos doze
atoms em outro alvo apto. Nenhuma mudança de identidade, fórmula, expected
trace ou regra de seleção é autorizada por esta proposta. A decisão deve
resolver explicitamente o texto anterior de §10.1/§10.6 e o critério do G11;
este documento, por si, **não** o redefine.

## Perguntas ao revisor

- A incompatibilidade é demonstrada pelos domínios imutáveis, ou existe uma
  construção schema-valid/discriminante que o diagnóstico deixou passar?
- A distinção proposta preserva as garantias relevantes, sem chamar teste de
  admissão de witness semântico? Se não, indicar a menor solução normativa.
- A proposta é suficiente para ratificação documental explícita? Identificar
  exatamente o que pode ser alterado no desenho/G11 e o que permanece exigido.
- Não aprovar código parcial, matriz executada, freeze ou GO global por esta
  revisão. Um parecer incompleto mantém o impedimento; nenhuma exceção ou nova
  semântica será implementada antes da decisão suficiente.

## Verificação local proporcional

Somente syntax, reconstrução exata da evidência, cinco self-tests do inspector,
diff e workflow. Não executar suíte financeira ampla para uma evidência
documental que não altera produto. Resultados efetivos serão registrados no
checkpoint após execução, sem copiar números de suites antigas.
