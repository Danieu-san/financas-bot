# NEXT-00 — Resolução da auditoria do grafo de provenance

Atualizado em: 2026-08-31
Objeto reavaliado: `9b20c0fc49dea78cce9fc04ebc2a5bf47e3c5f86`
Veredito externo: `APROVÁVEL APÓS AJUSTES`

## Findings aceitos

Quatro lacunas foram confirmadas:

1. um RED por fingerprint podia mascarar predicado ou aresta defeituosos;
2. trace de inputs não congelava a fórmula executada;
3. campo declarado `non_material` ainda poderia virar dependência causal;
4. mutação sem alternativa no closed world poderia ficar sem witness.

Esses findings não exigem novo paradigma. Eles são propriedades transversais
do grafo e foram incorporados ao desenho antes de qualquer implementação.

## Resolução arquitetural

### Provas ortogonais

Validade passa a ser decomposta em átomos. Cada mutant declara o conjunto exato
de violações esperado. Predicados e arestas recebem mutants com fingerprint
recalculado, de modo que integridade não possa esconder prova semântica morta.

### Evaluator content-addressed

Cada evaluator possui contrato e artefato congelados por SHA-256, papéis tipados
de operandos e propriedades discriminantes. O trace comprova qual função foi
executada; o graph evaluator não ganha DSL de fórmulas.

Hash e trace são medidos externamente: o loader calcula o hash dos bytes
carregados e um proxy tipado captura as leituras reais. Evaluator não pode
autodeclarar hash, omitir read, acessar fixture diretamente ou consultar estado
implícito.

### Leitura implica materialidade

Paths `non_material` ficam fora do namespace dos evaluators. Qualquer leitura
de cálculo ou prova precisa resolver para campo material; violação falha no
compile.

### Witness fail-closed

Toda mutação enumerada precisa ser gerada e executada. Se não houver alternativa
real, o gerador sintetiza objeto schema-valid. Se ainda assim não houver witness
discriminante, o gate falha com `UNSATISFIED_MUTATION_WITNESS`; nunca pula.

## Fronteira

O desenho continua não normativo e sem implementação. Compiler, evaluator,
registries, corpus v2 e validadores permanecem bloqueados até nova auditoria do
hash imutável desta correção arquitetural.

NEXT-01, runtime, produção, writers, integrações e dados reais permanecem fora
de escopo.
